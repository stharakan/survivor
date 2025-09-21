import { NextRequest } from 'next/server'
import { getScoreboardWithPicks } from '@/lib/db'
import { createApiResponse, handleApiError } from '@/lib/api-types'
import { verifyLeagueMembership } from '@/lib/auth-utils'

// GET /api/leagues/[leagueId]/scoreboard - Get league scoreboard with weekly picks
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  try {
    const { leagueId } = await params

    // Verify user authentication and league membership
    try {
      await verifyLeagueMembership(request, leagueId)
    } catch (authError: any) {
      const status = authError.message.includes('Authentication required') ||
                    authError.message.includes('Invalid authentication token') ? 401 : 403
      return Response.json(
        createApiResponse(false, undefined, authError.message),
        { status }
      )
    }

    const scoreboardData = await getScoreboardWithPicks(leagueId)

    return Response.json(createApiResponse(true, scoreboardData))
  } catch (error) {
    return handleApiError(error)
  }
}