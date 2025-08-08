import { NextRequest, NextResponse } from 'next/server'
import { getAllTeams, getUserPicksByLeague } from '@/lib/db'
import type { ApiResponse } from '@/lib/api-types'
import type { Team } from '@/types/team'

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
    
    // Get all teams
    const teams = await getAllTeams()
    
    // Get user's picks for this league
    const userPicks = await getUserPicksByLeague(userId, leagueId)
    
    // Create picks remaining data
    const picksRemaining = teams.map((team) => {
      // Check if team has been picked already by this user in this league
      const isPicked = userPicks.some((pick) => pick.team.id === team.id)
      return {
        team,
        // In survivor league, you can only pick a team once
        remaining: isPicked ? 0 : 1,
      }
    })
    
    return NextResponse.json({
      success: true,
      data: picksRemaining,
    } as ApiResponse<typeof picksRemaining>)
  } catch (error) {
    console.error('Error fetching picks remaining:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch picks remaining',
    } as ApiResponse<never>, { status: 500 })
  }
}