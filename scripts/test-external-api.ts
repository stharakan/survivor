import { addDays, format } from 'date-fns'

// Football Data API configuration - same as game updater
const FOOTBALLDATA_API_KEY = process.env.FOOTBALLDATA_API_KEY
const API_BASE_URL = process.env.FOOTBALLDATA_API_URL || 'https://api.football-data.org/v4'
const DEFAULT_COMPETITION_CODE = process.env.FOOTBALLDATA_COMPETITION_CODE || 'PL'

// Fail immediately if API key is missing
if (!FOOTBALLDATA_API_KEY) {
  throw new Error('FOOTBALLDATA_API_KEY environment variable is required')
}

// Calculate date range - same logic as game updater
const daysBack = parseInt(process.env.BULK_QUERY_DAYS_BACK || '7')
const daysForward = parseInt(process.env.BULK_QUERY_DAYS_FORWARD || '7')
const dateFrom = format(addDays(new Date(), -daysBack), 'yyyy-MM-dd')
const dateTo = format(addDays(new Date(), daysForward), 'yyyy-MM-dd')

async function testAPI() {
  console.log(`Testing Football Data API`)
  console.log(`Date range: ${dateFrom} to ${dateTo}`)
  console.log(`Competition: ${DEFAULT_COMPETITION_CODE}`)
  console.log(`API Base URL: ${API_BASE_URL}`)
  console.log('---')

  // Fetch games - exact same logic as fetchBulkGames function
  const url = `${API_BASE_URL}/competitions/${DEFAULT_COMPETITION_CODE}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`

  const response = await fetch(url, {
    headers: {
      'X-Auth-Token': FOOTBALLDATA_API_KEY,
    },
  })

  // Fail loudly if API request fails
  if (!response.ok) {
    throw new Error(`Football Data API request failed: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  const matches = data.matches

  // Fail if no matches array
  if (!Array.isArray(matches)) {
    throw new Error(`Expected matches array but got: ${typeof matches}`)
  }

  console.log(`Found ${matches.length} matches:\n`)

  // Format output: date, gameweek, home team: (score), away team: (score), status
  for (const match of matches) {
    const homeTeam = match.homeTeam.shortName || match.homeTeam.name
    const awayTeam = match.awayTeam.shortName || match.awayTeam.name

    const homeScore = match.score?.fullTime?.home ?? 'no score'
    const awayScore = match.score?.fullTime?.away ?? 'no score'

    const status = match.status
    const matchDate = format(new Date(match.utcDate), 'MMM dd')
    const gameweek = match.matchday || 'unknown'

    console.log(`${matchDate}, GW${gameweek}: ${homeTeam}: (${homeScore}), ${awayTeam}: (${awayScore}), ${status}`)
  }

  console.log(`\nAPI test completed successfully - ${matches.length} matches processed`)
}

// Run the test and let any errors bubble up
testAPI()