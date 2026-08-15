#!/usr/bin/env node
/**
 * SUR-010 Stage D: Create a new LeagueSeason under an existing parent League.
 *
 * Calls POST /api/admin/create-season on the running FastAPI server rather
 * than writing to Mongo directly — Python logic stays the single source of truth.
 *
 * Usage:
 *   SCORING_API_KEY=... npx tsx --env-file=.env.local scripts/create-league-season.ts \
 *     --league-id <parent-league-id> \
 *     --season "2026/2027"
 *
 * Requires the FastAPI server to be running. Set API_BASE_URL to override
 * the default http://localhost:8001.
 */

const args = process.argv.slice(2)

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag)
  return idx !== -1 ? args[idx + 1] : undefined
}

const leagueId = getArg('--league-id')
const season = getArg('--season')

if (!leagueId || !season) {
  console.error('Usage: create-league-season.ts --league-id <id> --season "2026/2027"')
  process.exit(1)
}

const apiKey = process.env.SCORING_API_KEY
if (!apiKey) {
  console.error('SCORING_API_KEY env var is required')
  process.exit(1)
}

const baseUrl = process.env.API_BASE_URL ?? 'http://localhost:8001'

async function run() {
  console.log(`Creating season "${season}" under league ${leagueId} ...`)

  const res = await fetch(`${baseUrl}/api/admin/create-season`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey!,
    },
    body: JSON.stringify({ leagueId, newSeason: season }),
  })

  const data = await res.json()

  if (!res.ok || !data.success) {
    console.error('Failed:', JSON.stringify(data, null, 2))
    process.exit(1)
  }

  console.log('Created league season:')
  console.log(JSON.stringify(data.data, null, 2))
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
