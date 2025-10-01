import { NextRequest, NextResponse } from 'next/server'
import { createPick, getUserPicksByLeague, getGameTimeInfoById, getUserPickForWeek, getLeagueById } from '@/lib/db'
import type { ApiResponse } from '@/lib/api-types'
import { ObjectId } from 'mongodb'
import { canPickFromGame, canChangeExistingPick, hasGameweekStarted, arePicksLocked } from '@/lib/game-utils'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const userId = searchParams.get('user_id')
    const leagueId = searchParams.get('league_id')
    
    if (!userId || !leagueId) {
      return NextResponse.json({
        success: false,
        error: 'User ID and League ID parameters are required',
      } as ApiResponse<never>, { status: 400 })
    }
    
    // Validate that leagueId is a valid ObjectId format
    if (!ObjectId.isValid(leagueId)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid league ID format',
      } as ApiResponse<never>, { status: 400 })
    }
    
    const picks = await getUserPicksByLeague(userId, leagueId)
    
    return NextResponse.json({
      success: true,
      data: picks,
    } as ApiResponse<typeof picks>)
  } catch (error) {
    console.error('Error fetching picks:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch picks',
    } as ApiResponse<never>, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, leagueId, gameId, teamId, week } = body
    
    if (!userId || !leagueId || !gameId || !teamId || !week) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: userId, leagueId, gameId, teamId, week',
      } as ApiResponse<never>, { status: 400 })
    }
    
    // Validate that leagueId is a valid ObjectId format
    if (!ObjectId.isValid(leagueId)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid league ID format',
      } as ApiResponse<never>, { status: 400 })
    }
    
    // Get league information for pick locking validation
    const league = await getLeagueById(leagueId)
    if (!league) {
      return NextResponse.json({
        success: false,
        error: 'League not found',
      } as ApiResponse<never>, { status: 404 })
    }
    
    // Check if user already has a pick for this week
    const existingPick = await getUserPickForWeek(userId, leagueId, week)
    
    // Validate pick locking rules
    const gameweekStarted = hasGameweekStarted(league, week)
    const picksLocked = arePicksLocked(!!existingPick, gameweekStarted)
    
    if (picksLocked) {
      return NextResponse.json({
        success: false,
        error: 'Picks are locked because the gameweek has started and you already have a pick for this week',
      } as ApiResponse<never>, { status: 400 })
    }
    
    // Fetch game time information for validation
    const gameTimeInfo = await getGameTimeInfoById(gameId)
    if (!gameTimeInfo) {
      return NextResponse.json({
        success: false,
        error: 'Game not found',
      } as ApiResponse<never>, { status: 404 })
    }
    
    // Check if user is trying to change an existing pick (existingPick already fetched above)
    if (existingPick) {
      if (!canChangeExistingPick(existingPick.game)) {
        return NextResponse.json({
          success: false,
          error: 'Cannot change pick because your selected game has already started',
        } as ApiResponse<never>, { status: 400 })
      }
    }

    // Additional validation for first pick during active gameweek
    if (gameweekStarted && !existingPick) {
      // User can make first pick during active gameweek, but only from games that haven't started
      if (!canPickFromGame(gameTimeInfo)) {
        return NextResponse.json({
          success: false,
          error: 'Cannot pick from this game because it has already started. During an active gameweek, you can only pick from games that haven\'t started yet.',
        } as ApiResponse<never>, { status: 400 })
      }
    } else {
      // Normal time-based validation for all other cases
      if (!canPickFromGame(gameTimeInfo)) {
        return NextResponse.json({
          success: false,
          error: 'Pick failed because game has already started',
        } as ApiResponse<never>, { status: 400 })
      }
    }
    
    const pick = await createPick(userId, leagueId, gameId, teamId, week)
    
    return NextResponse.json({
      success: true,
      data: pick,
    } as ApiResponse<typeof pick>)
  } catch (error) {
    console.error('Error creating pick:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to create pick',
    } as ApiResponse<never>, { status: 500 })
  }
}