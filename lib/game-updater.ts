import { getDatabase, Collections } from './mongodb'
import { runScoringCalculation } from './scoring'
import type { GameStatus } from '@/types/game'
import { addDays, format } from 'date-fns'

// Logging helper with timestamps
function logWithTimestamp(message: string) {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] ${message}`)
}

// Sleep helper for rate limiting
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Football Data API configuration
const FOOTBALLDATA_API_KEY = process.env.FOOTBALLDATA_API_KEY
const API_BASE_URL = process.env.FOOTBALLDATA_API_URL || 'https://api.football-data.org/v4'
const DEFAULT_COMPETITION_CODE = process.env.FOOTBALLDATA_COMPETITION_CODE || 'PL'
const REQUEST_DELAY = parseInt(process.env.FOOTBALLDATA_REQUEST_DELAY || '6000')

// Map Football Data API season format to database season format
function mapApiSeasonToDatabase(apiSeason: string, competitionType: string = "EPL"): string {
  // Football Data API returns single year, database uses academic year format
  if (competitionType === "EPL") {
    const year = parseInt(apiSeason)
    return `${year}/${year + 1}`  // "2025" → "2025/2026"
  }
  return apiSeason // Fallback for other leagues
}

// Get current season from environment or calculate from current date
function getCurrentSeason(): string {
  if (process.env.CURRENT_SEASON) {
    return process.env.CURRENT_SEASON
  }

  // Calculate current season based on current date
  const now = new Date()
  const currentYear = now.getFullYear()
  const month = now.getMonth() + 1 // JavaScript months are 0-indexed

  // Football seasons typically start in August and end in May
  // If it's June-July, we're in the off-season, use the upcoming season
  if (month >= 8) {
    return `${currentYear}/${currentYear + 1}`
  } else if (month <= 5) {
    return `${currentYear - 1}/${currentYear}`
  } else {
    // June-July: use upcoming season
    return `${currentYear}/${currentYear + 1}`
  }
}


// Simplified game matching - external ID only
async function findMatchingDatabaseGame(apiGame: any, apiSeason: string): Promise<any | null> {
  const db = await getDatabase()
  
  // Only try external ID matching - fail fast if not found
  if (!apiGame.id) {
    throw new Error(`CRITICAL: API game missing external ID - cannot process game: ${apiGame.homeTeam.shortName} vs ${apiGame.awayTeam.shortName} on ${apiGame.utcDate}`)
  }
  
  const dbGame = await db.collection(Collections.GAMES).findOne({ 
    externalId: apiGame.id.toString() 
  })
  
  if (dbGame) {
    logWithTimestamp(`Game matched by external ID: ${apiGame.id}`)
    return dbGame
  }
  
  // No external ID match found - this is now a critical error
  throw new Error(`CRITICAL: No database game found with external ID ${apiGame.id} for API game: ${apiGame.homeTeam.shortName} vs ${apiGame.awayTeam.shortName} on ${apiGame.utcDate}. Run backfill script to add missing external IDs.`)
}

// Map Football Data API status to our internal status
function mapApiStatusToInternal(apiStatus: string): GameStatus {
  switch (apiStatus) {
    case 'SCHEDULED':
    case 'TIMED':
      return 'not_started'
    case 'LIVE':
    case 'IN_PLAY':
    case 'PAUSED':
    case 'HALFTIME':
      return 'in_progress'
    case 'FINISHED':
    case 'AWARDED':
    case 'POSTPONED':
    case 'CANCELLED':
    case 'SUSPENDED':
      return 'completed'
    default:
      return 'not_started'
  }
}

// Fetch games from Football Data API for extended range
async function fetchBulkGames(dateFrom: string, dateTo: string, competitionCode?: string): Promise<any[]> {
  if (!FOOTBALLDATA_API_KEY) {
    throw new Error('FOOTBALLDATA_API_KEY environment variable is required')
  }

  const competition = competitionCode || DEFAULT_COMPETITION_CODE
  logWithTimestamp(`Fetching bulk games from Football Data API: ${dateFrom} to ${dateTo} for competition ${competition}`)

  const url = `${API_BASE_URL}/competitions/${competition}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`
  
  try {
    const response = await fetch(url, {
      headers: {
        'X-Auth-Token': FOOTBALLDATA_API_KEY,
      },
    })

    if (!response.ok) {
      throw new Error(`Football Data API request failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    const matches = data.matches || []
    
    logWithTimestamp(`Successfully fetched ${matches.length} games from Football Data API`)
    return matches
    
  } catch (error) {
    logWithTimestamp(`Error fetching bulk games: ${error instanceof Error ? error.message : 'Unknown error'}`)
    throw error
  }
}

// Fetch individual game from Football Data API
async function fetchIndividualGame(externalId: string): Promise<any | null> {
  if (!FOOTBALLDATA_API_KEY) {
    throw new Error('FOOTBALLDATA_API_KEY environment variable is required')
  }

  logWithTimestamp(`Fetching individual game from Football Data API: ${externalId}`)
  
  const url = `${API_BASE_URL}/matches/${externalId}`
  
  try {
    await sleep(REQUEST_DELAY) // Rate limiting delay
    
    const response = await fetch(url, {
      headers: {
        'X-Auth-Token': FOOTBALLDATA_API_KEY,
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        logWithTimestamp(`Game not found in Football Data API: ${externalId}`)
        return null
      }
      throw new Error(`Football Data API request failed: ${response.status} ${response.statusText}`)
    }

    const game = await response.json()
    logWithTimestamp(`Successfully fetched individual game: ${externalId}`)
    return game
    
  } catch (error) {
    logWithTimestamp(`Error fetching individual game ${externalId}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    return null
  }
}

// Find overdue games in database (started but still marked as not_started)
async function findOverdueGames(excludeSeasons?: { sportsLeague: string; season: string }[]): Promise<any[]> {
  const db = await getDatabase()
  const now = new Date()

  logWithTimestamp('Scanning database for overdue games...')

  const query: any = {
    $and: [
      {
        $or: [
          { startTime: { $lt: now } },
          { date: { $lt: now } }
        ]
      },
      { status: 'not_started' }
    ]
  }

  // Add exclusion filter if provided
  if (excludeSeasons && excludeSeasons.length > 0) {
    query.$and.push({
      $nor: excludeSeasons.map(exclude => ({
        $and: [
          { sportsLeague: exclude.sportsLeague },
          { season: exclude.season }
        ]
      }))
    })
  }

  const overdueGames = await db.collection(Collections.GAMES)
    .find(query)
    .toArray()

  logWithTimestamp(`Found ${overdueGames.length} overdue games${excludeSeasons ? ' (with exclusions)' : ''}`)
  return overdueGames
}

// Try to find a database game in the bulk API response
function findGameInBulkResponse(dbGame: any, apiGames: any[]): any | null {
  // Try to match by external ID first (if available)
  if (dbGame.externalId) {
    const match = apiGames.find(apiGame => apiGame.id.toString() === dbGame.externalId.toString())
    if (match) return match
  }
  
  // Try to match by teams and approximate date
  const gameDate = new Date(dbGame.startTime || dbGame.date)
  const gameDateStr = format(gameDate, 'yyyy-MM-dd')
  
  for (const apiGame of apiGames) {
    const apiDateStr = format(new Date(apiGame.utcDate), 'yyyy-MM-dd')
    
    // Check if dates are close (within 1 day) and teams match
    const dateMatch = Math.abs(new Date(gameDateStr).getTime() - new Date(apiDateStr).getTime()) <= 24 * 60 * 60 * 1000
    
    if (dateMatch) {
      const homeMatch = apiGame.homeTeam.name === dbGame.homeTeam?.name || 
                       apiGame.homeTeam.shortName === dbGame.homeTeam?.name
      const awayMatch = apiGame.awayTeam.name === dbGame.awayTeam?.name || 
                       apiGame.awayTeam.shortName === dbGame.awayTeam?.name
      
      if (homeMatch && awayMatch) {
        return apiGame
      }
    }
  }
  
  return null
}

// Update a single game in the database
async function updateGameInDatabase(dbGame: any, apiGame: any): Promise<boolean> {
  const db = await getDatabase()
  
  const newStatus = mapApiStatusToInternal(apiGame.status)
  const newStartTime = apiGame.utcDate
  const newHomeScore = apiGame.score?.fullTime?.home ?? null
  const newAwayScore = apiGame.score?.fullTime?.away ?? null
  
  // Check if this is a status change to completed
  const statusChangedToCompleted = dbGame.status !== 'completed' && newStatus === 'completed'
  
  // Update the game
  const updateResult = await db.collection(Collections.GAMES).updateOne(
    { _id: dbGame._id },
    {
      $set: {
        status: newStatus,
        startTime: newStartTime,
        date: newStartTime, // Keep date field synchronized with startTime
        homeScore: newHomeScore,
        awayScore: newAwayScore,
        externalId: apiGame.id.toString(), // Store external ID for future individual lookups
        lastUpdated: new Date()
      }
    }
  )
  
  logWithTimestamp(`Updated game ${dbGame.id}: ${dbGame.status} → ${newStatus}`)
  
  return statusChangedToCompleted
}

// Check if any users have picks for completed games and trigger scoring if needed
async function checkAndTriggerScoring(gamesMovedToCompleted: any[]): Promise<number> {
  if (gamesMovedToCompleted.length === 0) {
    return 0
  }
  
  const db = await getDatabase()
  
  // Check if any users have picks for these completed games
  const gameIds = gamesMovedToCompleted.map(game => game.id)
  const picksCount = await db.collection(Collections.PICKS)
    .countDocuments({ gameId: { $in: gameIds } })
  
  if (picksCount > 0) {
    logWithTimestamp(`Found ${picksCount} user picks for ${gamesMovedToCompleted.length} newly completed games. Triggering score recalculation...`)
    
    // Trigger scoring calculation
    await runScoringCalculation()
    
    logWithTimestamp('Score recalculation completed')
    return picksCount
  } else {
    logWithTimestamp(`No user picks found for newly completed games. Skipping score recalculation.`)
    return 0
  }
}

// Calculate current game week (latest week with started or completed games)
async function calculateCurrentGameWeek(sportsLeague: string, season: string): Promise<number | null> {
  const db = await getDatabase()

  const result = await db.collection(Collections.GAMES)
    .aggregate([
      {
        $match: {
          sportsLeague,
          season,
          status: { $in: ['in_progress', 'completed'] }
        }
      },
      {
        $group: {
          _id: null,
          maxWeek: { $max: '$week' }
        }
      }
    ])
    .toArray()

  return result.length > 0 ? result[0].maxWeek : null
}

// Calculate current pick week (earliest week with games not yet started)
async function calculateCurrentPickWeek(sportsLeague: string, season: string): Promise<number | null> {
  const db = await getDatabase()

  const result = await db.collection(Collections.GAMES)
    .aggregate([
      {
        $match: {
          sportsLeague,
          season,
          status: 'not_started'
        }
      },
      {
        $group: {
          _id: null,
          minWeek: { $min: '$week' }
        }
      }
    ])
    .toArray()

  return result.length > 0 ? result[0].minWeek : null
}

// Calculate last completed week (largest week for which all games are completed)
async function calculateLastCompletedWeek(sportsLeague: string, season: string): Promise<number | null> {
  const db = await getDatabase()

  const result = await db.collection(Collections.GAMES)
    .aggregate([
      {
        $match: {
          sportsLeague,
          season
        }
      },
      {
        $group: {
          _id: '$week',
          completedCount: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          totalCount: { $sum: 1 }
        }
      },
      {
        $match: { $expr: { $eq: ['$completedCount', '$totalCount'] } }
      },
      {
        $group: {
          _id: null,
          maxCompletedWeek: { $max: '$_id' }
        }
      }
    ])
    .toArray()

  return result.length > 0 ? result[0].maxCompletedWeek : null
}

// Update league week tracking for all leagues
async function updateLeagueWeekTracking(): Promise<number> {
  const db = await getDatabase()
  
  logWithTimestamp('Updating league week tracking...')
  
  // Get all active leagues
  const leagues = await db.collection(Collections.LEAGUES)
    .find({ isActive: true })
    .toArray()
  
  let leaguesUpdated = 0
  
  for (const league of leagues) {
    try {
      // Calculate weeks for this league
      const currentGameWeek = await calculateCurrentGameWeek(league.sportsLeague, league.season)
      const currentPickWeek = await calculateCurrentPickWeek(league.sportsLeague, league.season)
      const lastCompletedWeek = await calculateLastCompletedWeek(league.sportsLeague, league.season)
      
      // Update league document
      await db.collection(Collections.LEAGUES).updateOne(
        { _id: league._id },
        {
          $set: {
            current_game_week: currentGameWeek,
            current_pick_week: currentPickWeek,
            last_completed_week: lastCompletedWeek,
            lastWeekUpdate: new Date()
          }
        }
      )
      
      leaguesUpdated++
      logWithTimestamp(`Updated league ${league.name}: game_week=${currentGameWeek}, pick_week=${currentPickWeek}, last_completed_week=${lastCompletedWeek}`)
      
    } catch (error) {
      logWithTimestamp(`Error updating week tracking for league ${league.name}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  logWithTimestamp(`League week tracking completed: ${leaguesUpdated} leagues updated`)
  return leaguesUpdated
}

// Main hybrid game update function
export async function updateGameScores(): Promise<{
  bulkGamesProcessed: number
  overdueGamesFound: number
  individualApiCalls: number
  gamesUpdated: number
  gamesCompletedWithPicks: number
  leaguesUpdated: number
  executionTime: number
  completedAt: string
}> {
  const startTime = new Date()
  logWithTimestamp('=== Game Score Update Started (Hybrid Approach) ===')
  
  try {
    // Step 1: Extended range bulk query (configurable date range)
    const daysBack = parseInt(process.env.BULK_QUERY_DAYS_BACK || '7')
    const daysForward = parseInt(process.env.BULK_QUERY_DAYS_FORWARD || '7')
    const dateFrom = format(addDays(new Date(), -daysBack), 'yyyy-MM-dd')
    const dateTo = format(addDays(new Date(), daysForward), 'yyyy-MM-dd')

    const competitionCode = process.env.FOOTBALLDATA_COMPETITION_CODE
    const bulkGames = await fetchBulkGames(dateFrom, dateTo, competitionCode)

    // Step 2: Find overdue games in database (with optional season exclusions)
    const excludeSeasons = process.env.EXCLUDE_SEASONS ?
      JSON.parse(process.env.EXCLUDE_SEASONS) : undefined
    const overdueGames = await findOverdueGames(excludeSeasons)
    
    // Step 3: Smart processing - try to find overdue games in bulk response first
    let individualApiCalls = 0
    let gamesUpdated = 0
    const gamesMovedToCompleted: any[] = []
    
    // Process bulk games first with enhanced matching
    for (const apiGame of bulkGames) {
      // Extract season from API response or use calculated current season
      const currentSeasonYear = getCurrentSeason().split('/')[0]
      const apiSeason = apiGame.season?.id?.toString() || currentSeasonYear

      // findMatchingDatabaseGame now throws an error if no match is found
      const dbGame = await findMatchingDatabaseGame(apiGame, apiSeason)
      const statusChangedToCompleted = await updateGameInDatabase(dbGame, apiGame)
      gamesUpdated++

      if (statusChangedToCompleted) {
        gamesMovedToCompleted.push(dbGame)
      }
    }
    
    // Step 4: Process overdue games not found in bulk response
    for (const overdueGame of overdueGames) {
      const foundInBulk = findGameInBulkResponse(overdueGame, bulkGames)
      
      if (!foundInBulk && overdueGame.externalId) {
        // Make individual API call
        const individualGame = await fetchIndividualGame(overdueGame.externalId)
        individualApiCalls++
        
        if (individualGame) {
          const statusChangedToCompleted = await updateGameInDatabase(overdueGame, individualGame)
          gamesUpdated++
          
          if (statusChangedToCompleted) {
            gamesMovedToCompleted.push(overdueGame)
          }
        }
      } else if (!foundInBulk) {
        logWithTimestamp(`Overdue game ${overdueGame.id} has no external ID for individual lookup`)
      }
    }
    
    // Step 5: Trigger scoring if games completed with user picks
    const picksUpdated = await checkAndTriggerScoring(gamesMovedToCompleted)
    
    // Step 6: Update league week tracking
    const leaguesUpdated = await updateLeagueWeekTracking()
    
    const endTime = new Date()
    const executionTime = Math.round((endTime.getTime() - startTime.getTime()) / 1000)
    
    logWithTimestamp('=== Game Score Update Completed Successfully ===')
    logWithTimestamp(`Summary:`)
    logWithTimestamp(`  • ${bulkGames.length} games processed from bulk API`)
    logWithTimestamp(`  • ${overdueGames.length} overdue games found in database`)
    logWithTimestamp(`  • ${individualApiCalls} individual API calls made`)
    logWithTimestamp(`  • ${gamesUpdated} games updated in database`)
    logWithTimestamp(`  • ${gamesMovedToCompleted.length} games moved to completed status`)
    logWithTimestamp(`  • ${picksUpdated} user picks affected by completed games`)
    logWithTimestamp(`  • ${leaguesUpdated} leagues updated with week tracking`)
    logWithTimestamp(`  • Total execution time: ${executionTime} seconds`)
    logWithTimestamp(`  • Completed at: ${endTime.toISOString()}`)
    
    return {
      bulkGamesProcessed: bulkGames.length,
      overdueGamesFound: overdueGames.length,
      individualApiCalls,
      gamesUpdated,
      gamesCompletedWithPicks: picksUpdated,
      leaguesUpdated,
      executionTime,
      completedAt: endTime.toISOString()
    }
    
  } catch (error) {
    const endTime = new Date()
    const executionTime = Math.round((endTime.getTime() - startTime.getTime()) / 1000)
    
    logWithTimestamp('=== Game Score Update Failed ===')
    logWithTimestamp(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    logWithTimestamp(`Total execution time: ${executionTime} seconds`)
    logWithTimestamp(`Failed at: ${endTime.toISOString()}`)
    
    throw error
  }
}