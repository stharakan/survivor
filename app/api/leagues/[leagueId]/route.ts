import { NextRequest } from 'next/server'
import { getLeagueById, updateLeagueSettings } from '@/lib/db'
import { getDatabase, Collections } from '@/lib/mongodb'
import { createApiResponse, handleApiError } from '@/lib/api-types'
import { verifyLeagueMembership } from '@/lib/auth-utils'
import { ObjectId } from 'mongodb'
import jwt from 'jsonwebtoken'

// GET /api/leagues/[leagueId] - Get specific league
export async function GET(
  request: NextRequest,
  { params }: { params: { leagueId: string } }
) {
  try {
    const { leagueId } = params

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

    const league = await getLeagueById(leagueId)

    if (!league) {
      return Response.json(
        createApiResponse(false, undefined, 'League not found'),
        { status: 404 }
      )
    }

    return Response.json(createApiResponse(true, league))
  } catch (error) {
    return handleApiError(error)
  }
}

// PATCH /api/leagues/[leagueId] - Update league settings
export async function PATCH(
  request: NextRequest,
  { params }: { params: { leagueId: string } }
) {
  try {
    const { leagueId } = params
    
    // Get token from cookie
    const token = request.cookies.get('auth-token')?.value
    if (!token) {
      return Response.json(
        createApiResponse(false, undefined, 'Authentication required'),
        { status: 401 }
      )
    }
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as {
      userId: string
      email: string
    }
    
    // Check if user is admin of this league
    const db = await getDatabase()
    const membership = await db.collection(Collections.LEAGUE_MEMBERSHIPS).findOne({
      leagueId: new ObjectId(leagueId),
      userId: new ObjectId(decoded.userId)
    })
    
    if (!membership || !membership.isAdmin) {
      return Response.json(
        createApiResponse(false, undefined, 'Admin access required'),
        { status: 403 }
      )
    }
    
    // Parse request body
    const body = await request.json()
    const updates: any = {}
    
    // Validate and whitelist allowed updates
    if (body.name !== undefined) updates.name = body.name
    if (body.description !== undefined) updates.description = body.description
    if (body.logo !== undefined) updates.logo = body.logo
    if (body.sportsLeague !== undefined) updates.sportsLeague = body.sportsLeague
    if (body.isPublic !== undefined) updates.isPublic = body.isPublic
    if (body.requiresApproval !== undefined) updates.requiresApproval = body.requiresApproval
    if (body.hideScoreboard !== undefined) updates.hideScoreboard = body.hideScoreboard
    
    // Update league settings
    const updatedLeague = await updateLeagueSettings(leagueId, updates)
    
    if (!updatedLeague) {
      return Response.json(
        createApiResponse(false, undefined, 'League not found'),
        { status: 404 }
      )
    }
    
    return Response.json(createApiResponse(true, updatedLeague))
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return Response.json(
        createApiResponse(false, undefined, 'Invalid token'),
        { status: 401 }
      )
    }
    return handleApiError(error)
  }
}

// DELETE /api/leagues/[leagueId] - Delete league
export async function DELETE(
  request: NextRequest,
  { params }: { params: { leagueId: string } }
) {
  try {
    // TODO: Implement league deletion logic
    // This would include authorization checks to ensure only admins can delete
    return Response.json(
      createApiResponse(false, undefined, 'Not implemented yet'),
      { status: 501 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}