import { NextRequest, NextResponse } from 'next/server'
import { getGamesByWeek, getGamesByWeekWithPicks } from '@/lib/db'
import type { ApiResponse } from '@/lib/api-types'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const week = searchParams.get('week')
    const userId = searchParams.get('user_id')
    const leagueId = searchParams.get('league_id')
    
    if (!week || !leagueId) {
      return NextResponse.json({
        success: false,
        error: 'Week and league_id parameters are required',
      } as ApiResponse<never>, { status: 400 })
    }
    
    let games
    if (userId) {
      // Get games with user picks included
      games = await getGamesByWeekWithPicks(parseInt(week), userId, leagueId)
    } else {
      // Get games without picks
      games = await getGamesByWeek(parseInt(week), leagueId)
    }
    
    return NextResponse.json({
      success: true,
      data: games,
    } as ApiResponse<typeof games>)
  } catch (error) {
    console.error('Error fetching games:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch games',
    } as ApiResponse<never>, { status: 500 })
  }
}