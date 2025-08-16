import { NextRequest } from 'next/server'
import { getScoreboardWithPicks } from '@/lib/db'
import { createApiResponse, handleApiError } from '@/lib/api-types'

// GET /api/leagues/[leagueId]/scoreboard - Get league scoreboard with weekly picks
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  try {
    const { leagueId } = await params
    const scoreboardData = await getScoreboardWithPicks(leagueId)
    
    return Response.json(createApiResponse(true, scoreboardData))
  } catch (error) {
    return handleApiError(error)
  }
}