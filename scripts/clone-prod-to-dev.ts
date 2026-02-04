// Clone production database to dev database on the same Atlas cluster
// Sanitizes user data (emails, passwords) for safe dev usage
// Run: npm run clone-prod-to-dev

import { MongoClient } from 'mongodb'
import bcrypt from 'bcryptjs'

const PROD_DB = 'survivor-league'
const DEV_DB = 'survivor-league-dev'
const DEV_PASSWORD = 'devpassword123'

// Mirror the Collections enum from lib/mongodb.ts
const Collections = {
  USERS: 'users',
  LEAGUES: 'leagues',
  LEAGUE_MEMBERSHIPS: 'league_memberships',
  TEAMS: 'teams',
  GAMES: 'games',
  PICKS: 'picks',
  JOIN_REQUESTS: 'join_requests',
  LEAGUE_INVITATIONS: 'league_invitations',
  PASSWORD_RESET_TOKENS: 'password_reset_tokens',
} as const

type EmailMapping = { original: string; dev: string }

async function cloneProdToDev() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    throw new Error('MONGODB_URI not found in .env.local')
  }

  console.log('Connecting to Atlas cluster...')
  const client = new MongoClient(uri)
  await client.connect()

  const prodDb = client.db(PROD_DB)
  const devDb = client.db(DEV_DB)

  // Pre-hash the shared dev password
  const devPasswordHash = await bcrypt.hash(DEV_PASSWORD, 10)

  const emailMappings: EmailMapping[] = []
  const summary: { collection: string; count: number }[] = []

  for (const [key, collectionName] of Object.entries(Collections)) {
    console.log(`\n--- ${collectionName} ---`)

    // Drop target collection for a clean slate
    try {
      await devDb.collection(collectionName).drop()
      console.log(`  Dropped existing dev collection`)
    } catch {
      // Collection doesn't exist yet, that's fine
    }

    // Read all documents from prod
    const docs = await prodDb.collection(collectionName).find({}).toArray()
    console.log(`  Read ${docs.length} documents from prod`)

    if (docs.length === 0) {
      summary.push({ collection: collectionName, count: 0 })
      continue
    }

    // Sanitize users collection
    if (collectionName === Collections.USERS) {
      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i]
        const devEmail = `user${i + 1}@dev.local`
        emailMappings.push({ original: doc.email, dev: devEmail })
        doc.email = devEmail
        doc.password = devPasswordHash
      }
    }

    // Insert into dev
    await devDb.collection(collectionName).insertMany(docs)
    console.log(`  Inserted ${docs.length} documents into dev`)

    // Copy indexes (skip the default _id index)
    const indexes = await prodDb.collection(collectionName).indexes()
    const customIndexes = indexes.filter((idx: any) => idx.name !== '_id_')
    if (customIndexes.length > 0) {
      for (const idx of customIndexes) {
        const { key, ...options } = idx
        // Remove the 'v' field which is internal
        delete (options as any).v
        try {
          await devDb.collection(collectionName).createIndex(key, options)
        } catch (err: any) {
          console.log(`  Warning: could not copy index ${idx.name}: ${err.message}`)
        }
      }
      console.log(`  Copied ${customIndexes.length} index(es)`)
    }

    summary.push({ collection: collectionName, count: docs.length })
  }

  // Print summary
  console.log('\n========================================')
  console.log('CLONE SUMMARY')
  console.log('========================================')
  console.log(`Source: ${PROD_DB}  →  Target: ${DEV_DB}`)
  console.log('')
  for (const { collection, count } of summary) {
    console.log(`  ${collection.padEnd(25)} ${count} docs`)
  }

  if (emailMappings.length > 0) {
    console.log('\n========================================')
    console.log('EMAIL MAPPING (all passwords: devpassword123)')
    console.log('========================================')
    for (const { original, dev } of emailMappings) {
      console.log(`  ${original.padEnd(35)} → ${dev}`)
    }
  }

  await client.close()
  console.log('\nDone.')
}

cloneProdToDev().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
