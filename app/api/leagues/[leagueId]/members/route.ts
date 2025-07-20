import { NextRequest } from 'next/server'
import { getLeagueMembers } from '@/lib/db'
import { createApiResponse, handleApiError } from '@/lib/api-types'

// GET /api/leagues/[leagueId]/members - Get league members
export async function GET(
  request: NextRequest,
  { params }: { params: { leagueId: string } }
) {
  try {
    const members = await getLeagueMembers(params.leagueId)
    return Response.json(createApiResponse(true, members))
  } catch (error) {
    return handleApiError(error)
  }
}