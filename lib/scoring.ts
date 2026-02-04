import { ObjectId } from 'mongodb'
import { getDatabase, Collections } from './mongodb'
import type { GameStatus } from '@/types/game'

// Logging helper with timestamps
function logWithTimestamp(message: string) {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] ${message}`)
}

// Calculate pick result based on game outcome
function calculatePickResult(game: any, pickedTeamId: number): "win" | "draw" | "loss" | null {
  if (game.status !== "completed" || game.homeScore === null || game.awayScore === null) {
    return null
  }

  const isHomeTeam = pickedTeamId === game.homeTeamId
  const homeScore = game.homeScore
  const awayScore = game.awayScore

  // Determine game outcome
  if (homeScore === awayScore) {
    return "draw" // Tie game
  }

  // Win/loss based on which team was picked
  if (isHomeTeam) {
    return homeScore > awayScore ? "win" : "loss"
  } else {
    return awayScore > homeScore ? "win" : "loss"
  }
}

// Update pick results for completed games
export async function updatePickResults(): Promise<number> {
  const database = await getDatabase()
  let updatedCount = 0

  try {
    logWithTimestamp("Starting pick result updates...")

    // Find all picks with null results
    const picksWithNullResults = await database.collection(Collections.PICKS)
      .find({ result: null })
      .toArray()

    logWithTimestamp(`Found ${picksWithNullResults.length} picks with null results`)

    for (const pick of picksWithNullResults) {
      try {
        // Get the corresponding game
        const game = await database.collection(Collections.GAMES)
          .findOne({ id: pick.gameId })

        if (!game) {
          logWithTimestamp(`Warning: Game ${pick.gameId} not found for pick ${pick._id}`)
          continue
        }

        // Calculate the result
        const result = calculatePickResult(game, pick.teamId)

        if (result !== null) {
          // Update the pick with the calculated result
          await database.collection(Collections.PICKS).updateOne(
            { _id: pick._id },
            { $set: { result } }
          )

          updatedCount++
          logWithTimestamp(`Updated pick ${pick._id}: ${result} (Game ${game.id}, Week ${game.week})`)
        }
      } catch (error) {
        logWithTimestamp(`Error processing pick ${pick._id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    logWithTimestamp(`Completed pick result updates: ${updatedCount} picks updated`)
    return updatedCount

  } catch (error) {
    logWithTimestamp(`Error in updatePickResults: ${error instanceof Error ? error.message : 'Unknown error'}`)
    throw error
  }
}

// Calculate scores and strikes for all league members
export async function calculateScoresAndStrikes(): Promise<number> {
  const database = await getDatabase()
  let processedCount = 0

  try {
    logWithTimestamp("Starting score and strikes calculation...")

    // Get all league memberships
    const memberships = await database.collection(Collections.LEAGUE_MEMBERSHIPS)
      .find({ isActive: true, status: 'active' })
      .toArray()

    // Build a map of leagueId → last_completed_week
    const leagues = await database.collection(Collections.LEAGUES)
      .find({ isActive: true })
      .project({ last_completed_week: 1 })
      .toArray()
    const leagueWeekMap = new Map<string, number>()
    for (const league of leagues) {
      leagueWeekMap.set(league._id.toString(), league.last_completed_week ?? 0)
    }

    logWithTimestamp(`Found ${memberships.length} active league memberships to process`)

    for (const membership of memberships) {
      try {
        const lastCompletedWeek = leagueWeekMap.get(membership.leagueId.toString()) ?? 0

        // Get all picks for this user in this league for completed weeks
        const picks = await database.collection(Collections.PICKS)
          .find({
            userId: membership.userId,
            leagueId: membership.leagueId,
            result: { $ne: null },
            week: { $lte: lastCompletedWeek }
          })
          .toArray()

        // Count unique weeks with picks to determine missed weeks
        const weeksWithPicks = new Set(picks.map(p => p.week)).size
        const missingPickStrikes = Math.max(0, lastCompletedWeek - weeksWithPicks)

        // Calculate points and loss strikes from picks
        let totalPoints = 0
        let lossStrikes = 0

        for (const pick of picks) {
          switch (pick.result) {
            case "win":
              totalPoints += 3
              break
            case "draw":
              totalPoints += 1
              break
            case "loss":
              lossStrikes += 1
              break
          }
        }

        // Total strikes = losses + missed weeks
        const totalStrikes = lossStrikes + missingPickStrikes

        // Update the league membership with calculated values
        const updateResult = await database.collection(Collections.LEAGUE_MEMBERSHIPS).updateOne(
          { _id: membership._id },
          {
            $set: {
              points: totalPoints,
              strikes: totalStrikes,
              lossStrikes,
              missingPickStrikes
            }
          }
        )

        if (updateResult.modifiedCount > 0) {
          processedCount++
          logWithTimestamp(
            `Updated ${membership.teamName}: ${totalPoints} points, ${totalStrikes} strikes (${lossStrikes} losses + ${missingPickStrikes} missed weeks, from ${picks.length} picks)`
          )
        }

      } catch (error) {
        logWithTimestamp(`Error processing membership ${membership._id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    logWithTimestamp(`Strike calculation complete. Updated ${processedCount} players.`)
    return processedCount

  } catch (error) {
    logWithTimestamp(`Error in calculateScoresAndStrikes: ${error instanceof Error ? error.message : 'Unknown error'}`)
    throw error
  }
}

// Summary result type for the scoring operation
export type ScoringResult = {
  picksUpdated: number
  membershipsUpdated: number
  executionTime: number
  completedAt: string
}

// Main function to run the complete scoring calculation
export async function runScoringCalculation(): Promise<ScoringResult> {
  const startTime = new Date()
  logWithTimestamp("=== Scoring Calculation Started ===")

  try {
    // Step 1: Update pick results for completed games
    const picksUpdated = await updatePickResults()

    // Step 2: Calculate scores and strikes for all league members
    const membershipsUpdated = await calculateScoresAndStrikes()

    const endTime = new Date()
    const executionTime = Math.round((endTime.getTime() - startTime.getTime()) / 1000)

    logWithTimestamp("=== Scoring Calculation Completed Successfully ===")
    logWithTimestamp(`Summary:`)
    logWithTimestamp(`  • ${picksUpdated} pick results updated`)
    logWithTimestamp(`  • ${membershipsUpdated} league memberships updated`)
    logWithTimestamp(`  • Total execution time: ${executionTime} seconds`)
    logWithTimestamp(`  • Completed at: ${endTime.toISOString()}`)

    return {
      picksUpdated,
      membershipsUpdated,
      executionTime,
      completedAt: endTime.toISOString()
    }

  } catch (error) {
    logWithTimestamp(`=== Scoring Calculation Failed ===`)
    logWithTimestamp(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    throw error
  }
}
