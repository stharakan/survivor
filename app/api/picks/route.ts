import { NextRequest, NextResponse } from 'next/server'
import { createPick, getUserPicksByLeague } from '@/lib/db'
import type { ApiResponse } from '@/lib/api-types'

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