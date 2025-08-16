#!/usr/bin/env node

// External ID Backfill Script for 2025/2026 EPL Season
// This script backfills external IDs for all EPL 2025/2026 games by matching them against Football Data API
// Safe to re-run - will only update games that don't already have external IDs

import { getDatabase, Collections } from '../lib/mongodb'

// Configuration
const FOOTBALLDATA_API_KEY = process.env.FOOTBALLDATA_API_KEY
const API_BASE_URL = 'https://api.football-data.org/v4'
const COMPETITION_CODE = 'PL' // Premier League
const SEASON = '2025'
const SEASON_DISPLAY = '2025/2026'
const SPORTS_LEAGUE = 'EPL'
const REQUEST_DELAY = 6000 // 6 seconds between requests for rate limiting

// Logging helper with timestamps
function logWithTimestamp(message: string) {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] ${message}`)
}

// Sleep helper for rate limiting
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Validate environment variables
function validateEnvironment(): void {
  const requiredVars = ['FOOTBALLDATA_API_KEY', 'MONGODB_URI']
  const missingVars = requiredVars.filter(varName => !process.env[varName])
  
  if (missingVars.length > 0) {
    logWithTimestamp(`ERROR: Missing required environment variables: ${missingVars.join(', ')}`)
    logWithTimestamp('Required environment variables:')
    logWithTimestamp('  FOOTBALLDATA_API_KEY - Football Data API key')
    logWithTimestamp('  MONGODB_URI - MongoDB connection string')
    process.exit(1)
  }
}

// Fetch all EPL matches for the 2025 season from Football Data API
async function fetchEPLFixtures(): Promise<any[]> {
  logWithTimestamp('Fetching EPL 2025/2026 fixtures from Football Data API...')
  
  if (!FOOTBALLDATA_API_KEY) {
    throw new Error('FOOTBALLDATA_API_KEY environment variable is required')
  }

  const url = `${API_BASE_URL}/competitions/${COMPETITION_CODE}/matches?season=${SEASON}`
  
  try {
    const response = await fetch(url, {
      headers: {
        'X-Auth-Token': FOOTBALLDATA_API_KEY,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const data = await response.json()
    
    if (!data.matches || !Array.isArray(data.matches)) {
      throw new Error('Invalid API response: matches array not found')
    }

    logWithTimestamp(`Successfully fetched ${data.matches.length} fixtures from API`)
    return data.matches

  } catch (error) {
    if ((error as any).code === 'ECONNREFUSED' || (error as any).code === 'ENOTFOUND') {
      logWithTimestamp(`Network Error: Unable to connect to Football Data API at ${API_BASE_URL}`)
      logWithTimestamp('Make sure you have internet connectivity and the API is accessible')
    }
    throw error
  }
}

// Get games from database that need external IDs
async function getGamesNeedingExternalIds(): Promise<any[]> {
  logWithTimestamp('Finding 2025/2026 games without external IDs...')
  
  const db = await getDatabase()
  
  const games = await db.collection(Collections.GAMES)
    .find({
      sportsLeague: SPORTS_LEAGUE,
      season: SEASON_DISPLAY,
      $or: [
        { externalId: { $exists: false } },
        { externalId: null },
        { externalId: '' }
      ]
    })
    .toArray()
  
  logWithTimestamp(`Found ${games.length} games without external IDs`)
  return games
}

// Find team by Football Data API team names (enhanced to handle duplicates)
async function findTeamByApiName(apiTeam: { name: string, shortName: string }): Promise<any | null> {
  const db = await getDatabase()
  
  // Try multiple matching strategies and prefer teams that are actually used in games
  const possibleTeams = await db.collection(Collections.TEAMS).find({
    $or: [
      { name: apiTeam.name },        // "Liverpool FC" → "Liverpool"
      { name: apiTeam.shortName },   // "Liverpool" → "Liverpool"
      { name: { $regex: new RegExp(apiTeam.shortName, 'i') } }, // Case insensitive
      { abbreviation: apiTeam.shortName.substring(0, 3).toUpperCase() } // Fallback abbreviation
    ]
  }).toArray()
  
  if (possibleTeams.length === 0) {
    return null
  }
  
  if (possibleTeams.length === 1) {
    return possibleTeams[0]
  }
  
  // If multiple teams found, prefer the one that's actually used in 2025/2026 games
  logWithTimestamp(`Multiple teams found for ${apiTeam.shortName}: ${possibleTeams.map(t => `${t.name} (ID: ${t.id})`).join(', ')}`)
  
  for (const team of possibleTeams) {
    const gameCount = await db.collection(Collections.GAMES).countDocuments({
      $or: [{ homeTeamId: team.id }, { awayTeamId: team.id }],
      season: SEASON_DISPLAY,
      sportsLeague: SPORTS_LEAGUE
    })
    
    if (gameCount > 0) {
      logWithTimestamp(`Choosing team ${team.name} (ID: ${team.id}) with ${gameCount} games`)
      return team
    }
  }
  
  // Fallback to first team if none have games
  logWithTimestamp(`No teams have games, using first match: ${possibleTeams[0].name}`)
  return possibleTeams[0]
}

// Enhanced game matching (adapted from game-updater.ts)
async function findMatchingApiGame(dbGame: any, apiFixtures: any[]): Promise<any | null> {
  // First try to find by external ID if it exists
  if (dbGame.externalId) {
    const match = apiFixtures.find(apiGame => apiGame.id.toString() === dbGame.externalId.toString())
    if (match) return match
  }
  
  // Try team ID + date + week matching
  for (const apiGame of apiFixtures) {
    // Check week/matchday first
    if (dbGame.week !== apiGame.matchday) continue
    
    // Check date proximity (within 2 days)
    const dbDate = new Date(dbGame.date || dbGame.startTime)
    const apiDate = new Date(apiGame.utcDate)
    const timeDiff = Math.abs(dbDate.getTime() - apiDate.getTime())
    const daysDiff = timeDiff / (1000 * 60 * 60 * 24)
    
    if (daysDiff > 2) continue
    
    // Try to match teams
    const homeTeam = await findTeamByApiName(apiGame.homeTeam)
    const awayTeam = await findTeamByApiName(apiGame.awayTeam)
    
    if (homeTeam && awayTeam) {
      if (dbGame.homeTeamId === homeTeam.id && dbGame.awayTeamId === awayTeam.id) {
        logWithTimestamp(`✓ Matched by team IDs + date + week: ${homeTeam.name} vs ${awayTeam.name}`)
        return apiGame
      }
    }
  }
  
  return null
}

// Match database game against API fixtures and update with external ID
async function matchAndUpdateGame(dbGame: any, apiFixtures: any[]): Promise<{ success: boolean, error?: string }> {
  try {
    const matchedApiGame = await findMatchingApiGame(dbGame, apiFixtures)
    
    if (!matchedApiGame) {
      return {
        success: false,
        error: `No matching API game found for DB game: ${dbGame.id} (Week ${dbGame.week})`
      }
    }
    
    return await updateGameWithExternalId(dbGame, matchedApiGame)
    
  } catch (error) {
    return {
      success: false,
      error: `Error matching game ${dbGame.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}


// Update database game with external ID from API game
async function updateGameWithExternalId(dbGame: any, apiGame: any): Promise<{ success: boolean, error?: string }> {
  try {
    const db = await getDatabase()
    
    const updateResult = await db.collection(Collections.GAMES).updateOne(
      { _id: dbGame._id },
      {
        $set: {
          externalId: apiGame.id.toString(),
          lastUpdated: new Date()
        }
      }
    )
    
    if (updateResult.modifiedCount === 1) {
      logWithTimestamp(`✓ Updated game ${dbGame.id} with external ID: ${apiGame.id}`)
      return { success: true }
    } else {
      return {
        success: false,
        error: `Failed to update database for game ${dbGame.id}`
      }
    }
    
  } catch (error) {
    return {
      success: false,
      error: `Database update error for game ${dbGame.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

// Process all games and update them with external IDs
async function backfillExternalIds(dbGames: any[], apiFixtures: any[]): Promise<{
  processed: number
  successful: number
  failed: number
  errors: string[]
}> {
  logWithTimestamp('Starting external ID backfill process...')
  
  const results = {
    processed: 0,
    successful: 0,
    failed: 0,
    errors: [] as string[]
  }
  
  for (const dbGame of dbGames) {
    results.processed++
    
    logWithTimestamp(`Processing game ${results.processed}/${dbGames.length}: Game ID ${dbGame.id} (Week ${dbGame.week})`)
    
    const result = await matchAndUpdateGame(dbGame, apiFixtures)
    
    if (result.success) {
      results.successful++
    } else {
      results.failed++
      if (result.error) {
        results.errors.push(result.error)
        logWithTimestamp(`✗ ${result.error}`)
      }
    }
    
    // Rate limiting delay between API operations
    if (results.processed < dbGames.length) {
      logWithTimestamp(`Waiting ${REQUEST_DELAY/1000} seconds for rate limiting...`)
      await sleep(REQUEST_DELAY)
    }
  }
  
  return results
}

// Verify that all 2025/2026 games now have external IDs
async function verifyExternalIds(): Promise<{ total: number, withExternalId: number, missing: number }> {
  logWithTimestamp('Verifying external ID coverage...')
  
  const db = await getDatabase()
  
  const totalGames = await db.collection(Collections.GAMES).countDocuments({
    sportsLeague: SPORTS_LEAGUE,
    season: SEASON_DISPLAY
  })
  
  const gamesWithExternalId = await db.collection(Collections.GAMES).countDocuments({
    sportsLeague: SPORTS_LEAGUE,
    season: SEASON_DISPLAY,
    externalId: { $exists: true, $ne: null, $ne: '' }
  })
  
  const missingExternalId = totalGames - gamesWithExternalId
  
  logWithTimestamp(`Total 2025/2026 games: ${totalGames}`)
  logWithTimestamp(`Games with external ID: ${gamesWithExternalId}`)
  logWithTimestamp(`Games missing external ID: ${missingExternalId}`)
  
  return {
    total: totalGames,
    withExternalId: gamesWithExternalId,
    missing: missingExternalId
  }
}

// Main execution function
async function main() {
  const startTime = new Date()
  
  try {
    logWithTimestamp('=== External ID Backfill Started ===')
    
    // Step 1: Validate environment
    logWithTimestamp('Validating environment variables...')
    validateEnvironment()
    logWithTimestamp('✓ Environment validation passed')
    
    // Step 2: Get initial verification
    const initialVerification = await verifyExternalIds()
    if (initialVerification.missing === 0) {
      logWithTimestamp('✓ All 2025/2026 games already have external IDs. No backfill needed.')
      process.exit(0)
    }
    
    // Step 3: Fetch API fixtures
    const apiFixtures = await fetchEPLFixtures()
    
    // Step 4: Get games needing external IDs
    const dbGames = await getGamesNeedingExternalIds()
    
    if (dbGames.length === 0) {
      logWithTimestamp('✓ No games found needing external IDs')
      process.exit(0)
    }
    
    // Step 5: Process backfill
    const results = await backfillExternalIds(dbGames, apiFixtures)
    
    // Step 6: Final verification
    const finalVerification = await verifyExternalIds()
    
    const endTime = new Date()
    const totalDuration = Math.round((endTime.getTime() - startTime.getTime()) / 1000)
    
    logWithTimestamp('=== External ID Backfill Completed ===')
    logWithTimestamp('Backfill Summary:')
    logWithTimestamp(`  • ${results.processed} games processed`)
    logWithTimestamp(`  • ${results.successful} successfully updated`)
    logWithTimestamp(`  • ${results.failed} failed to update`)
    logWithTimestamp(`  • ${apiFixtures.length} API fixtures fetched`)
    logWithTimestamp('')
    logWithTimestamp('Final State:')
    logWithTimestamp(`  • ${finalVerification.total} total 2025/2026 games`)
    logWithTimestamp(`  • ${finalVerification.withExternalId} games with external IDs`)
    logWithTimestamp(`  • ${finalVerification.missing} games still missing external IDs`)
    logWithTimestamp(`  • Total execution time: ${totalDuration} seconds`)
    logWithTimestamp(`  • Completed at: ${endTime.toISOString()}`)
    
    // Log errors if any
    if (results.errors.length > 0) {
      logWithTimestamp('')
      logWithTimestamp('Errors encountered:')
      results.errors.forEach((error, index) => {
        logWithTimestamp(`  ${index + 1}. ${error}`)
      })
    }
    
    if (finalVerification.missing === 0) {
      logWithTimestamp('\n🎉 SUCCESS: All 2025/2026 games now have external IDs!')
      process.exit(0)
    } else {
      logWithTimestamp(`\n⚠️  WARNING: ${finalVerification.missing} games still missing external IDs`)
      process.exit(1)
    }
    
  } catch (error) {
    const endTime = new Date()
    const totalDuration = Math.round((endTime.getTime() - startTime.getTime()) / 1000)
    
    logWithTimestamp('=== External ID Backfill Failed ===')
    logWithTimestamp(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    logWithTimestamp(`Total execution time: ${totalDuration} seconds`)
    logWithTimestamp(`Failed at: ${endTime.toISOString()}`)
    
    process.exit(1)
  }
}

// Run if called directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}