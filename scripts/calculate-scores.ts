// Scoring and Strikes Calculation Cron Job Script
// This script processes completed games to update pick results and calculate league member scores/strikes
// Safe to run multiple times - idempotent operation

import { getDatabase, Collections } from '../lib/mongodb'
import { ObjectId } from 'mongodb'

interface PickDocument {
  _id: ObjectId
  userId: ObjectId
  leagueId: ObjectId
  gameId: number
  teamId: number
  result: "win" | "loss" | "draw" | null
  week: number
}

interface GameDocument {
  _id: ObjectId
  id: number
  week: number
  homeTeamId: number
  awayTeamId: number
  homeScore: number | null
  awayScore: number | null
  status: "not_started" | "in_progress" | "completed"
  date: Date
}

interface LeagueMembershipDocument {
  _id: ObjectId
  leagueId: ObjectId
  userId: ObjectId
  teamName: string
  points: number
  strikes: number
  rank: number
  isActive: boolean
  status: string
}

// Logging helper with timestamps
function logWithTimestamp(message: string) {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] ${message}`)
}

// Calculate pick result based on game outcome
function calculatePickResult(
  game: GameDocument,
  pickedTeamId: number
): "win" | "loss" | "draw" | null {
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
async function updatePickResults(): Promise<number> {
  const db = await getDatabase()
  let updatedCount = 0

  try {
    logWithTimestamp("Starting pick result updates...")

    // Find all picks with null results
    const picksWithNullResults = await db.collection(Collections.PICKS)
      .find({ result: null })
      .toArray() as PickDocument[]

    logWithTimestamp(`Found ${picksWithNullResults.length} picks with null results`)

    for (const pick of picksWithNullResults) {
      try {
        // Get the corresponding game
        const game = await db.collection(Collections.GAMES)
          .findOne({ id: pick.gameId }) as GameDocument | null

        if (!game) {
          logWithTimestamp(`Warning: Game ${pick.gameId} not found for pick ${pick._id}`)
          continue
        }

        // Calculate the result
        const result = calculatePickResult(game, pick.teamId)

        if (result !== null) {
          // Update the pick with the calculated result
          await db.collection(Collections.PICKS).updateOne(
            { _id: pick._id },
            { $set: { result } }
          )
          
          updatedCount++
          logWithTimestamp(`Updated pick ${pick._id}: ${result} (Game ${game.id}, Week ${game.week})`)
        }
      } catch (error) {
        logWithTimestamp(`Error processing pick ${pick._id}: ${error}`)
      }
    }

    logWithTimestamp(`Completed pick result updates: ${updatedCount} picks updated`)
    return updatedCount

  } catch (error) {
    logWithTimestamp(`Error in updatePickResults: ${error}`)
    throw error
  }
}

// Calculate scores and strikes for all league members
async function calculateScoresAndStrikes(): Promise<number> {
  const db = await getDatabase()
  let processedCount = 0

  try {
    logWithTimestamp("Starting score and strikes calculation...")

    // Get all league memberships
    const memberships = await db.collection(Collections.LEAGUE_MEMBERSHIPS)
      .find({ isActive: true, status: 'active' })
      .toArray() as LeagueMembershipDocument[]

    logWithTimestamp(`Found ${memberships.length} active league memberships to process`)

    for (const membership of memberships) {
      try {
        // Get all picks for this user in this league with non-null results
        const picks = await db.collection(Collections.PICKS)
          .find({
            userId: membership.userId,
            leagueId: membership.leagueId,
            result: { $ne: null }
          })
          .toArray() as PickDocument[]

        // Calculate points and strikes
        let totalPoints = 0
        let totalStrikes = 0

        for (const pick of picks) {
          switch (pick.result) {
            case "win":
              totalPoints += 3
              break
            case "draw":
              totalPoints += 1
              break
            case "loss":
              totalStrikes += 1
              break
          }
        }

        // Update the league membership with calculated values
        const updateResult = await db.collection(Collections.LEAGUE_MEMBERSHIPS).updateOne(
          { _id: membership._id },
          { 
            $set: { 
              points: totalPoints,
              strikes: totalStrikes 
            } 
          }
        )

        if (updateResult.modifiedCount > 0) {
          processedCount++
          logWithTimestamp(
            `Updated ${membership.teamName}: ${totalPoints} points, ${totalStrikes} strikes (from ${picks.length} completed picks)`
          )
        }

      } catch (error) {
        logWithTimestamp(`Error processing membership ${membership._id}: ${error}`)
      }
    }

    logWithTimestamp(`Completed score and strikes calculation: ${processedCount} memberships updated`)
    return processedCount

  } catch (error) {
    logWithTimestamp(`Error in calculateScoresAndStrikes: ${error}`)
    throw error
  }
}

// Main function to run the complete scoring calculation
async function runScoringCalculation(): Promise<void> {
  const startTime = new Date()
  logWithTimestamp("=== Scoring Calculation Cron Job Started ===")

  try {
    // Step 1: Update pick results for completed games
    const picksUpdated = await updatePickResults()

    // Step 2: Calculate scores and strikes for all league members
    const membershipsUpdated = await calculateScoresAndStrikes()

    const endTime = new Date()
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000)

    logWithTimestamp("=== Scoring Calculation Completed Successfully ===")
    logWithTimestamp(`Summary:`)
    logWithTimestamp(`  • ${picksUpdated} pick results updated`)
    logWithTimestamp(`  • ${membershipsUpdated} league memberships updated`)
    logWithTimestamp(`  • Total execution time: ${duration} seconds`)
    logWithTimestamp(`  • Completed at: ${endTime.toISOString()}`)

  } catch (error) {
    logWithTimestamp(`=== Scoring Calculation Failed ===`)
    logWithTimestamp(`Error: ${error}`)
    throw error
  }
}

// Run if called directly
if (require.main === module) {
  runScoringCalculation()
    .then(() => {
      logWithTimestamp("Script completed successfully")
      process.exit(0)
    })
    .catch((error) => {
      logWithTimestamp(`Script failed: ${error}`)
      process.exit(1)
    })
}

// Export for potential use as a module
export { runScoringCalculation, updatePickResults, calculateScoresAndStrikes }