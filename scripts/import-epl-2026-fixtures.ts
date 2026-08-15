#!/usr/bin/env node
/**
 * EPL 2026/2027 Season Fixture Import Script
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/import-epl-2026-fixtures.ts [flags]
 *
 * Flags:
 *   (default)     Dry-run — fetch API data, print pre-import summary, no DB writes.
 *   --execute     Actually write to the DB. Safe to re-run (deletes 2026/2027 games first).
 *   --allow-prod  Required to run against a non-dev DB name.
 */

import { MongoClient, Db } from 'mongodb'

// ── config ────────────────────────────────────────────────────────────────────

const FOOTBALLDATA_API_KEY = process.env.FOOTBALLDATA_API_KEY
const API_BASE_URL = 'https://api.football-data.org/v4'
const COMPETITION_CODE = 'PL'
const SEASON = '2026'
const SEASON_DISPLAY = '2026/2027'
const SPORTS_LEAGUE = 'EPL'
const REQUEST_DELAY = 6000
const DEV_DB_NAME = 'survivor-league-dev'

// ── arg parsing ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const isDryRun = !args.includes('--execute')
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

async function connect(): Promise<{ client: MongoClient; db: Db }> {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    log('ERROR: MONGODB_URI environment variable is not set.')
    process.exit(1)
  }
  const dbName = process.env.MONGODB_DB_NAME || 'survivor-league'
  guardEnvironment(dbName)

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 })
  await client.connect()
  log(`Connected to MongoDB: ${dbName}`)
  return { client, db: client.db(dbName) }
}

// ── sleep ─────────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── API fetch ─────────────────────────────────────────────────────────────────

async function fetchEPLFixtures(): Promise<any[]> {
  log(`Fetching EPL ${SEASON_DISPLAY} fixtures from Football Data API...`)

  if (!FOOTBALLDATA_API_KEY) {
    throw new Error('FOOTBALLDATA_API_KEY environment variable is required')
  }

  const url = `${API_BASE_URL}/competitions/${COMPETITION_CODE}/matches?season=${SEASON}`
  const response = await fetch(url, {
    headers: { 'X-Auth-Token': FOOTBALLDATA_API_KEY },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`)
  }

  const data = await response.json()
  if (!data.matches || !Array.isArray(data.matches)) {
    throw new Error('Invalid API response: matches array not found')
  }

  log(`Successfully fetched ${data.matches.length} fixtures from API`)
  return data.matches
}

// ── pre-import summary ────────────────────────────────────────────────────────

async function printPreImportSummary(db: Db, fixtures: any[]) {
  section('Pre-Import Team Summary')

  // Collect unique teams from API response
  const apiTeams = new Map<string, any>() // shortName → apiTeam object
  for (const fixture of fixtures) {
    for (const side of [fixture.homeTeam, fixture.awayTeam]) {
      const name = side.shortName || side.name
      if (!apiTeams.has(name)) apiTeams.set(name, side)
    }
  }

  // Load all EPL teams from DB
  const dbTeams = await db.collection('teams')
    .find({ sportsLeague: SPORTS_LEAGUE })
    .toArray()
  const dbTeamsByName = new Map(dbTeams.map(t => [t.name, t]))

  const apiTeamNames = new Set(apiTeams.keys())
  const dbTeamNames = new Set(dbTeamsByName.keys())

  const newTeams = [...apiTeamNames].filter(n => !dbTeamNames.has(n))   // promoted
  const absentTeams = [...dbTeamNames].filter(n => !apiTeamNames.has(n)) // relegated (or multi-sport)

  log(`API teams (${SEASON_DISPLAY}): ${apiTeamNames.size}`)
  log(`DB EPL teams (all seasons): ${dbTeamNames.size}`)

  if (newTeams.length > 0) {
    log(`\nNEW teams in ${SEASON_DISPLAY} (promoted — will be created):`)
    newTeams.forEach(n => log(`  + ${n}`))
  } else {
    log(`\nNo new teams to create.`)
  }

  if (absentTeams.length > 0) {
    log(`\nTeams absent from ${SEASON_DISPLAY} API response (relegated / other seasons):`)
    absentTeams.forEach(n => log(`  - ${n} [KEPT in teams collection — picks references intact]`))
  } else {
    log(`\nNo teams missing from API response.`)
  }

  return { apiTeams, dbTeamsByName, newTeams, absentTeams }
}

// ── team helpers ──────────────────────────────────────────────────────────────

async function getNextId(db: Db, collection: string, field = 'id'): Promise<number> {
  const last = await db.collection(collection).findOne({}, { sort: { [field]: -1 } })
  return last ? (last[field] as number) + 1 : 1
}

async function getOrCreateTeam(
  db: Db,
  apiTeam: any,
  teamCache: Map<string, number>,
  teamStats: { existing: number; created: number },
  execute: boolean
): Promise<number> {
  const name = apiTeam.shortName || apiTeam.name

  if (teamCache.has(name)) return teamCache.get(name)!

  const existing = await db.collection('teams').findOne({ name })
  if (existing) {
    teamCache.set(name, existing.id)
    teamStats.existing++
    return existing.id
  }

  // New team (promoted)
  const newId = await getNextId(db, 'teams')
  const teamDoc = {
    id: newId,
    name,
    abbreviation: apiTeam.tla || name.substring(0, 3).toUpperCase(),
    logo: apiTeam.crest || '',
    sportsLeague: SPORTS_LEAGUE,
    createdAt: new Date(),
  }

  if (execute) {
    await db.collection('teams').insertOne(teamDoc)
    log(`  [CREATE] New team: ${name} (id=${newId})`)
  } else {
    log(`  [DRY-RUN] Would create team: ${name} (id=${newId})`)
  }

  teamCache.set(name, newId)
  teamStats.created++
  return newId
}

// ── transform fixture ─────────────────────────────────────────────────────────

function mapStatus(apiStatus: string): string {
  if (apiStatus === 'FINISHED') return 'completed'
  if (apiStatus === 'IN_PLAY' || apiStatus === 'PAUSED') return 'in_progress'
  return 'not_started'
}

// ── post-import verification ──────────────────────────────────────────────────

async function verifyPicksIntegrity(db: Db) {
  section('Post-Import Verification')

  // Check orphaned picks for 2025/2026
  const picks2526 = await db.collection('picks')
    .find({ season: '2025/2026' })
    .toArray()

  const teamIds = [...new Set(picks2526.map(p => p.teamId))]
  const foundTeams = await db.collection('teams')
    .find({ id: { $in: teamIds } })
    .toArray()
  const foundIds = new Set(foundTeams.map(t => t.id))
  const orphaned = teamIds.filter(id => !foundIds.has(id))

  if (orphaned.length > 0) {
    log(`ERROR: Orphaned picks found for teamIds: ${orphaned.join(', ')}`)
    log('  These picks reference teams not in the teams collection!')
    return false
  } else {
    log(`✓ All ${picks2526.length} picks for 2025/2026 resolve to valid teams (${teamIds.length} unique team IDs checked)`)
  }

  // Verify 2026/2027 games shape
  const games2627 = await db.collection('games')
    .find({ season: SEASON_DISPLAY })
    .toArray()

  const missingWeek = games2627.filter(g => g.week == null)
  const wrongLeague = games2627.filter(g => g.sportsLeague !== SPORTS_LEAGUE)

  log(`✓ ${games2627.length} games imported for ${SEASON_DISPLAY}`)

  if (missingWeek.length > 0) {
    log(`WARNING: ${missingWeek.length} games are missing the 'week' field`)
  } else {
    log(`✓ All games have 'week' populated`)
  }

  if (wrongLeague.length > 0) {
    log(`ERROR: ${wrongLeague.length} games have wrong sportsLeague`)
    return false
  } else {
    log(`✓ All games have sportsLeague: "${SPORTS_LEAGUE}"`)
  }

  return true
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now()

  log(`=== EPL ${SEASON_DISPLAY} Fixture Import ${isDryRun ? '[DRY-RUN]' : '[EXECUTE]'} ===`)

  if (!FOOTBALLDATA_API_KEY) {
    log('ERROR: FOOTBALLDATA_API_KEY environment variable is required')
    process.exit(1)
  }

  // Step 1: Fetch from API (always — even in dry-run)
  const fixtures = await fetchEPLFixtures()
  await sleep(REQUEST_DELAY) // respect rate limit after the single request

  const { client, db } = await connect()

  try {
    // Step 2: Pre-import summary
    const { apiTeams } = await printPreImportSummary(db, fixtures)

    if (isDryRun) {
      section('Dry-Run Complete')
      log('No DB writes performed.')
      log(`Re-run with --execute to import ${fixtures.length} fixtures into ${SEASON_DISPLAY}.`)
      log('Add --allow-prod if targeting a non-dev database.')
      return
    }

    // Step 3: Delete existing 2026/2027 games (safe re-run)
    section('Deleting Existing 2026/2027 Games')
    const deleteResult = await db.collection('games').deleteMany({
      sportsLeague: SPORTS_LEAGUE,
      season: SEASON_DISPLAY,
    })
    log(`✓ Deleted ${deleteResult.deletedCount} existing ${SEASON_DISPLAY} games`)

    // Step 4: Import fixtures
    section('Importing Fixtures')
    let nextGameId = await getNextId(db, 'games')
    const teamCache = new Map<string, number>()
    const teamStats = { existing: 0, created: 0 }
    const gamesToInsert: any[] = []
    const errors: { fixture: string; error: string }[] = []

    for (const fixture of fixtures) {
      try {
        const homeTeamId = await getOrCreateTeam(db, fixture.homeTeam, teamCache, teamStats, true)
        const awayTeamId = await getOrCreateTeam(db, fixture.awayTeam, teamCache, teamStats, true)

        gamesToInsert.push({
          id: nextGameId++,
          week: fixture.matchday,
          homeTeamId,
          awayTeamId,
          homeScore: fixture.score?.fullTime?.home ?? null,
          awayScore: fixture.score?.fullTime?.away ?? null,
          status: mapStatus(fixture.status),
          date: new Date(fixture.utcDate),
          sportsLeague: SPORTS_LEAGUE,
          season: SEASON_DISPLAY,
          createdAt: new Date(),
        })
      } catch (err: any) {
        const label = `${fixture.homeTeam?.shortName || fixture.homeTeam?.name} vs ${fixture.awayTeam?.shortName || fixture.awayTeam?.name}`
        errors.push({ fixture: label, error: err.message })
      }
    }

    if (errors.length > 0) {
      log(`WARNING: ${errors.length} fixtures could not be transformed:`)
      errors.forEach(e => log(`  ✗ ${e.fixture}: ${e.error}`))
    }

    if (gamesToInsert.length === 0) {
      throw new Error('No valid games to insert after transformation')
    }

    const insertResult = await db.collection('games').insertMany(gamesToInsert)
    log(`✓ Inserted ${insertResult.insertedCount} games`)

    // Week summary
    const weekSummary: Record<number, number> = {}
    gamesToInsert.forEach(g => { weekSummary[g.week] = (weekSummary[g.week] || 0) + 1 })
    log('Games by week:')
    Object.keys(weekSummary)
      .map(Number)
      .sort((a, b) => a - b)
      .forEach(w => log(`  Week ${w}: ${weekSummary[w]} games`))

    // Step 5: Verify integrity
    const ok = await verifyPicksIntegrity(db)

    // Summary
    section('Import Complete')
    log(`  • ${deleteResult.deletedCount} existing games deleted`)
    log(`  • ${fixtures.length} fixtures fetched from API`)
    log(`  • ${insertResult.insertedCount} games imported`)
    log(`  • ${errors.length} transformation errors`)
    log(`  • Teams: ${teamStats.existing} existing, ${teamStats.created} new`)
    log(`  • Integrity check: ${ok ? 'PASSED' : 'FAILED — review errors above'}`)
    log(`  • Duration: ${Math.round((Date.now() - startTime) / 1000)}s`)

    if (!ok) process.exit(1)

  } finally {
    await client.close()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
