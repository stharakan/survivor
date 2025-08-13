import { NextRequest } from 'next/server'
import { getLeagueMembersWithUserData } from '@/lib/db'
import { createApiResponse, handleApiError } from '@/lib/api-types'
import jwt from 'jsonwebtoken'

// GET /api/leagues/[leagueId]/members - Get league members
export async function GET(
  request: NextRequest,
  { params }: { params: { leagueId: string } }
) {
  try {
    // Verify authentication
    const token = request.cookies.get('auth-token')?.value
    if (!token) {
      return Response.json(
        createApiResponse(false, undefined, 'Authentication required'),
        { status: 401 }
      )
    }
    
    // Verify JWT token
    try {
      jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret')
    } catch {
      return Response.json(
        createApiResponse(false, undefined, 'Invalid token'),
        { status: 401 }
      )
    }
    
    const members = await getLeagueMembersWithUserData(params.leagueId)
    return Response.json(createApiResponse(true, members))
  } catch (error) {
    return handleApiError(error)
  }
}