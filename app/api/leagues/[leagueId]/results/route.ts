import { NextRequest } from 'next/server'
import { getLeagueResults } from '@/lib/db'
import { createApiResponse, handleApiError } from '@/lib/api-types'

// GET /api/leagues/[leagueId]/results - Get league results with pick outcomes
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  try {
    const { leagueId } = await params
    const resultsData = await getLeagueResults(leagueId)

    return Response.json(createApiResponse(true, resultsData))
  } catch (error) {
    return handleApiError(error)
  }
}