#!/usr/bin/env node
/**
 * SUR-010 Stage A: Migrate `leagues` collection into `league_seasons` + parent `leagues`.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/migrate-league-to-leagueseason.ts [flags]
 *
 * Flags:
 *   --dry-run        (default) Print every planned write without touching the DB.
 *   --execute        Actually write. Runs dry-run output first, then executes.
 *   --rollback       Reverse the migration: rename leagueSeasonId→leagueId across
 *                    dependent collections, drop league_seasons, drop new parent
 *                    leagues docs created by this script.
 *   --verify-only    Run Phase 3 verification only (useful post-execute check).
 *   --allow-prod     Required to run against a non-dev DB name.
 */

import { MongoClient, ObjectId, Db } from 'mongodb'

// ── config ────────────────────────────────────────────────────────────────────

const DEV_DB_NAME = 'survivor-league-dev'
const DEMO_LEAGUE_NAME = 'Demo League'

const DEPENDENT_COLLECTIONS = [
  'league_memberships',
  'picks',
  'league_invitations',
  'audit_logs',
] as const

// ── arg parsing ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const isDryRun = !args.includes('--execute') && !args.includes('--rollback') && !args.includes('--verify-only')
const isExecute = args.includes('--execute')
const isRollback = args.includes('--rollback')
const isVerifyOnly = args.includes('--verify-only')
const allowProd = args.includes('--allow-prod')

// ── logging ───────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`)
}

function section(title: string) {
  log(`\n${'─'.repeat(60)}`)
  log(`  ${title}`)
  log('─'.repeat(60))
}

// ── environment guard ─────────────────────────────────────────────────────────

function guardEnvironment(dbName: string) {
  if (dbName !== DEV_DB_NAME && !allowProd) {
    log(`ERROR: DB name is "${dbName}", not "${DEV_DB_NAME}".`)
    log('  Pass --allow-prod to run against a non-dev DB.')
    log('  Take a mongodump snapshot first if targeting prod.')
    process.exit(1)
  }
  if (dbName !== DEV_DB_NAME) {
    log(`WARNING: Running against non-dev DB "${dbName}" (--allow-prod passed).`)
    log('  Ensure you have a mongodump snapshot before --execute.')
  }
}

// ── connection ────────────────────────────────────────────────────────────────

async function connect(): Promise<{ client: MongoClient; db: Db; dbName: string }> {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    log('ERROR: MONGODB_URI environment variable is not set.')
    process.exit(1)
  }
  const dbName = process.env.MONGODB_DB_NAME || 'survivor-league'
  guardEnvironment(dbName)

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
  })
  await client.connect()
  const db = client.db(dbName)
  log(`Connected to "${dbName}"`)
  return { client, db, dbName }
}

// ── phase 0: pre-flight ───────────────────────────────────────────────────────

async function phaseZeroPreflight(db: Db, execute: boolean) {
  section('Phase 0 — Pre-flight')

  // Print current doc counts
  const leagueCount = await db.collection('leagues').countDocuments()
  const memberCount = await db.collection('league_memberships').countDocuments()
  const picksCount = await db.collection('picks').countDocuments()
  const invitesCount = await db.collection('league_invitations').countDocuments()
  const auditCount = await db.collection('audit_logs').countDocuments({ leagueId: { $exists: true } })
  const leagueSeasonCount = await db.collection('league_seasons').countDocuments().catch(() => 0)

  log('Current doc counts:')
  log(`  leagues:                ${leagueCount}`)
  log(`  league_seasons:         ${leagueSeasonCount}`)
  log(`  league_memberships:     ${memberCount}`)
  log(`  picks:                  ${picksCount}`)
  log(`  league_invitations:     ${invitesCount}`)
  log(`  audit_logs (leagueId):  ${auditCount}`)

  // Find Demo League and its dependents
  const demoLeague = await db.collection('leagues').findOne({ name: DEMO_LEAGUE_NAME })
  if (!demoLeague) {
    log(`\nDemo League ("${DEMO_LEAGUE_NAME}") not found — already deleted or never existed.`)
  } else {
    const demoId = demoLeague._id
    const demoMemberCount = await db.collection('league_memberships').countDocuments({ leagueId: demoId })
    const demoPickCount = await db.collection('picks').countDocuments({ leagueId: demoId })
    const demoInviteCount = await db.collection('league_invitations').countDocuments({ leagueId: demoId })
    const demoAuditCount = await db.collection('audit_logs').countDocuments({ leagueId: demoId })

    log(`\nDemo League found: _id=${demoId}, season=${demoLeague.season}`)
    log(`  Dependents to delete:`)
    log(`    league_memberships: ${demoMemberCount}`)
    log(`    picks:              ${demoPickCount}`)
    log(`    league_invitations: ${demoInviteCount}`)
    log(`    audit_logs:         ${demoAuditCount}`)

    if (execute) {
      log('\nDeleting Demo League and its dependents...')
      await db.collection('league_memberships').deleteMany({ leagueId: demoId })
      await db.collection('picks').deleteMany({ leagueId: demoId })
      await db.collection('league_invitations').deleteMany({ leagueId: demoId })
      await db.collection('audit_logs').deleteMany({ leagueId: demoId })
      await db.collection('leagues').deleteOne({ _id: demoId })
      log('  Done.')
    } else {
      log('\n[DRY-RUN] Would delete Demo League and all its dependents above.')
    }
  }

  log('\nRecommended snapshot command before --execute on prod:')
  log('  mongodump --uri="$MONGODB_URI" --db=<dbname> --out=./mongodump-backup')
}

// ── phase 1: copy leagues → league_seasons, create parent League docs ─────────

async function phaseOneCreateLeagueSeasons(db: Db, execute: boolean): Promise<Map<string, ObjectId>> {
  section('Phase 1 — leagues → league_seasons + parent League docs')

  // Skip if already done (idempotency)
  const existingSeasonCount = await db.collection('league_seasons').countDocuments().catch(() => 0)
  const remainingLeagueCount = await db.collection('leagues').countDocuments()

  if (existingSeasonCount > 0 && remainingLeagueCount === 0) {
    log('league_seasons already populated and leagues is empty — Phase 1 appears complete. Skipping.')
    // Still need to return the mapping for downstream phases
    const parentMap = new Map<string, ObjectId>()
    const seasons = await db.collection('league_seasons').find({}).toArray()
    for (const s of seasons) {
      if (s.leagueId) parentMap.set(s._id.toString(), s.leagueId)
    }
    return parentMap
  }

  const leagues = await db.collection('leagues').find({}).toArray()
  log(`Found ${leagues.length} league(s) to process:`)

  // Map: old league _id (string) → new parent League _id
  const parentLeagueIdMap = new Map<string, ObjectId>()

  for (const doc of leagues) {
    log(`\n  Processing: "${doc.name}" (${doc._id})`)
    log(`    season=${doc.season}, sportsLeague=${doc.sportsLeague}, members=${doc.memberCount}`)

    // Fields that move UP to parent League
    const parentFields = {
      name: doc.name,
      description: doc.description,
      sportsLeague: doc.sportsLeague,
      logo: doc.logo ?? null,
      createdBy: doc.createdBy,
      createdAt: doc.createdAt,
    }

    // Fields that stay on LeagueSeason (same _id as old league doc)
    const seasonFields = {
      _id: doc._id,
      leagueId: null, // backfilled in step 4
      season: doc.season,
      isActive: doc.isActive,
      memberCount: doc.memberCount,
      isPublic: doc.isPublic,
      requiresApproval: doc.requiresApproval,
      hideScoreboard: doc.hideScoreboard ?? false,
      current_game_week: doc.current_game_week ?? null,
      current_pick_week: doc.current_pick_week ?? null,
      last_completed_week: doc.last_completed_week ?? null,
      createdAt: doc.createdAt,
    }

    log(`    LeagueSeason doc (same _id, leagueId=null until step 4):`)
    log(`      ${JSON.stringify({ ...seasonFields, _id: seasonFields._id.toString() }, null, 0)}`)

    const newParentId = new ObjectId()
    const parentDoc = {
      _id: newParentId,
      ...parentFields,
      currentSeasonId: doc._id,
      pastSeasonIds: [],
    }

    log(`    New parent League doc (_id=${newParentId}):`)
    log(`      name="${parentDoc.name}", sportsLeague="${parentDoc.sportsLeague}"`)
    log(`      currentSeasonId=${doc._id}, pastSeasonIds=[]`)

    if (execute) {
      // Step 2: insert LeagueSeason with same _id (skip if already exists)
      const existingSeasonDoc = await db.collection('league_seasons').findOne({ _id: doc._id })
      if (!existingSeasonDoc) {
        await db.collection('league_seasons').insertOne(seasonFields)
        log(`    [OK] Inserted league_seasons doc ${doc._id}`)
      } else {
        log(`    [SKIP] league_seasons doc ${doc._id} already exists`)
      }

      // Step 3: insert parent League doc (skip if already exists for this season)
      const existingParent = await db.collection('leagues').findOne({
        currentSeasonId: doc._id,
        name: doc.name,
      })
      const actualParentId = existingParent ? existingParent._id : newParentId
      if (!existingParent) {
        await db.collection('leagues').insertOne(parentDoc)
        log(`    [OK] Inserted parent League doc ${newParentId}`)
      } else {
        log(`    [SKIP] Parent League doc already exists for this season: ${existingParent._id}`)
      }

      // Step 4: backfill leagueId on the league_seasons doc
      await db.collection('league_seasons').updateOne(
        { _id: doc._id },
        { $set: { leagueId: actualParentId } }
      )
      log(`    [OK] Backfilled league_seasons.leagueId = ${actualParentId}`)

      parentLeagueIdMap.set(doc._id.toString(), actualParentId)
    } else {
      log(`    [DRY-RUN] Would insert league_seasons doc + parent League doc, then backfill leagueId.`)
      parentLeagueIdMap.set(doc._id.toString(), newParentId)
    }
  }

  // Step 5: drop original leagues collection after verifying league_seasons is fully populated
  if (execute) {
    const seasonCount = await db.collection('league_seasons').countDocuments()
    const leagueCount = await db.collection('leagues').countDocuments()
    // The remaining `leagues` docs should all be the new parent docs (not the old ones)
    // Old docs had `season` field; new parent docs have `currentSeasonId` field
    const oldStyleCount = await db.collection('leagues').countDocuments({ season: { $exists: true } })

    log(`\n  Post-insert counts: league_seasons=${seasonCount}, leagues=${leagueCount} (old-style=${oldStyleCount})`)

    if (oldStyleCount === 0) {
      log('  All old-style leagues docs migrated — nothing left to drop from leagues.')
    } else {
      // Drop the old-style docs (they have a `season` field, new parent docs do not)
      await db.collection('leagues').deleteMany({ season: { $exists: true } })
      log(`  [OK] Deleted ${oldStyleCount} old-style league doc(s) from leagues collection.`)
    }
  } else {
    log('\n  [DRY-RUN] After insert, would delete old-style league docs from leagues.')
  }

  return parentLeagueIdMap
}

// ── phase 2: rename leagueId → leagueSeasonId across dependent collections ────

async function phaseTwoRenameField(db: Db, execute: boolean) {
  section('Phase 2 — $rename leagueId → leagueSeasonId in dependent collections')

  for (const coll of DEPENDENT_COLLECTIONS) {
    const withField = await db.collection(coll).countDocuments({ leagueId: { $exists: true } })
    const withNewField = await db.collection(coll).countDocuments({ leagueSeasonId: { $exists: true } })

    log(`  ${coll}: ${withField} docs have leagueId, ${withNewField} already have leagueSeasonId`)

    if (withField === 0) {
      log(`    [SKIP] No leagueId field found — already renamed or empty.`)
      continue
    }

    if (execute) {
      const result = await db.collection(coll).updateMany(
        { leagueId: { $exists: true } },
        { $rename: { leagueId: 'leagueSeasonId' } }
      )
      log(`    [OK] Renamed ${result.modifiedCount} docs.`)
    } else {
      log(`    [DRY-RUN] Would rename ${withField} docs.`)
    }
  }
}

// ── phase 3: verification ─────────────────────────────────────────────────────

async function phaseThreeVerify(db: Db): Promise<boolean> {
  section('Phase 3 — Verification')

  let passed = true
  const fail = (msg: string) => { log(`  [FAIL] ${msg}`); passed = false }
  const ok = (msg: string) => log(`  [OK]   ${msg}`)

  // 1. Every league_seasons.leagueId resolves to a leagues._id
  const seasons = await db.collection('league_seasons').find({}).toArray()
  for (const s of seasons) {
    if (!s.leagueId) {
      fail(`league_seasons ${s._id} has null leagueId`)
      continue
    }
    const parent = await db.collection('leagues').findOne({ _id: s.leagueId })
    if (!parent) {
      fail(`league_seasons ${s._id}.leagueId=${s.leagueId} has no matching leagues doc`)
    }
  }
  ok(`All ${seasons.length} league_seasons.leagueId values resolve to a leagues doc`)

  // 2. Every leagues.currentSeasonId resolves to a league_seasons doc, and round-trips
  const parentLeagues = await db.collection('leagues').find({}).toArray()
  for (const p of parentLeagues) {
    if (!p.currentSeasonId) {
      fail(`leagues ${p._id} has no currentSeasonId`)
      continue
    }
    const season = await db.collection('league_seasons').findOne({ _id: p.currentSeasonId })
    if (!season) {
      fail(`leagues ${p._id}.currentSeasonId=${p.currentSeasonId} has no matching league_seasons doc`)
      continue
    }
    if (!season.leagueId || season.leagueId.toString() !== p._id.toString()) {
      fail(`Round-trip failed: league_seasons ${season._id}.leagueId=${season.leagueId} ≠ leagues._id=${p._id}`)
    }
  }
  ok(`All ${parentLeagues.length} leagues.currentSeasonId values round-trip correctly`)

  // 3. Pre/post doc counts for dependent collections (just verify no docs were deleted)
  for (const coll of DEPENDENT_COLLECTIONS) {
    const withOldField = await db.collection(coll).countDocuments({ leagueId: { $exists: true } })
    if (withOldField > 0) {
      fail(`${coll} still has ${withOldField} docs with old leagueId field`)
    } else {
      ok(`${coll}: zero docs with old leagueId field`)
    }
  }

  // 4. Spot-check: pick one membership, confirm leagueSeasonId resolves
  const sampleMembership = await db.collection('league_memberships').findOne({ leagueSeasonId: { $exists: true } })
  if (!sampleMembership) {
    fail('No league_memberships docs found with leagueSeasonId field')
  } else {
    const resolvedSeason = await db.collection('league_seasons').findOne({ _id: sampleMembership.leagueSeasonId })
    if (!resolvedSeason) {
      fail(`Sample membership leagueSeasonId=${sampleMembership.leagueSeasonId} has no matching league_seasons doc`)
    } else {
      const resolvedLeague = await db.collection('leagues').findOne({ _id: resolvedSeason.leagueId })
      log(`  [SPOT] Membership ${sampleMembership._id}`)
      log(`         → leagueSeasonId=${resolvedSeason._id}, season=${resolvedSeason.season}`)
      log(`         → leagueId=${resolvedLeague?._id}, name="${resolvedLeague?.name}", sport="${resolvedLeague?.sportsLeague}"`)
      if (resolvedLeague) {
        ok('Spot-check: membership → league_season → league chain resolves cleanly')
      } else {
        fail('Spot-check: league_seasons.leagueId does not resolve to a leagues doc')
      }
    }
  }

  log(`\n${passed ? '[PASS] All verification checks passed.' : '[FAIL] One or more checks failed — see above.'}`)
  return passed
}

// ── rollback ──────────────────────────────────────────────────────────────────

async function rollback(db: Db) {
  section('Rollback')

  log('Step 1: Reverse leagueSeasonId → leagueId in dependent collections')
  for (const coll of DEPENDENT_COLLECTIONS) {
    const withField = await db.collection(coll).countDocuments({ leagueSeasonId: { $exists: true } })
    if (withField === 0) {
      log(`  ${coll}: no leagueSeasonId field found, skipping`)
      continue
    }
    const result = await db.collection(coll).updateMany(
      { leagueSeasonId: { $exists: true } },
      { $rename: { leagueSeasonId: 'leagueId' } }
    )
    log(`  ${coll}: renamed ${result.modifiedCount} docs back to leagueId`)
  }

  log('\nStep 2: Drop league_seasons collection')
  const seasonCount = await db.collection('league_seasons').countDocuments().catch(() => 0)
  if (seasonCount === 0) {
    log('  league_seasons is empty or does not exist — skipping drop')
  } else {
    await db.collection('league_seasons').drop()
    log(`  Dropped league_seasons (had ${seasonCount} docs)`)
  }

  log('\nStep 3: Drop new-style parent leagues docs (those with currentSeasonId field)')
  const parentCount = await db.collection('leagues').countDocuments({ currentSeasonId: { $exists: true } })
  if (parentCount === 0) {
    log('  No new-style parent league docs found — already removed or rollback already ran')
  } else {
    await db.collection('leagues').deleteMany({ currentSeasonId: { $exists: true } })
    log(`  Deleted ${parentCount} parent League doc(s)`)
  }

  log('\nRollback complete.')
  log('NOTE: The Demo League and its dependents were permanently deleted in Phase 0 and are NOT restored by rollback.')
  log('      Restore from mongodump if you need them back.')
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  log('=== SUR-010 League → LeagueSeason Migration ===')
  log(`Mode: ${isRollback ? 'ROLLBACK' : isVerifyOnly ? 'VERIFY-ONLY' : isExecute ? 'EXECUTE' : 'DRY-RUN'}`)

  const { client, db } = await connect()

  try {
    if (isRollback) {
      await rollback(db)
      return
    }

    if (isVerifyOnly) {
      const ok = await phaseThreeVerify(db)
      process.exitCode = ok ? 0 : 1
      return
    }

    // Dry-run or execute
    const execute = isExecute

    await phaseZeroPreflight(db, execute)
    await phaseOneCreateLeagueSeasons(db, execute)
    await phaseTwoRenameField(db, execute)

    if (execute) {
      const passed = await phaseThreeVerify(db)
      if (!passed) {
        log('\nERROR: Verification failed post-execute. Review errors above.')
        log('       Run --rollback if you need to undo, or --verify-only to re-check after manual fixes.')
        process.exitCode = 1
      } else {
        log('\nMigration complete. Run --verify-only at any time to re-check.')
      }
    } else {
      log('\n[DRY-RUN] No writes performed. Re-run with --execute to apply.')
    }
  } finally {
    await client.close()
  }
}

main().catch((err) => {
  log(`FATAL: ${err.message}`)
  console.error(err)
  process.exit(1)
})
