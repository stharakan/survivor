import { NextRequest } from 'next/server'
import { createLeagueInvitation, getLeagueInvitations } from '@/lib/db'
import { getDatabase, Collections } from '@/lib/mongodb'
import { createInvitationSchema, createApiResponse, handleApiError } from '@/lib/api-types'
import jwt from 'jsonwebtoken'
import { ObjectId } from 'mongodb'

// GET /api/leagues/{leagueId}/invitations - List invitations for a league (admin only)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  try {
    const { leagueId } = await params
    
    // Verify authentication
    const token = request.cookies.get('auth-token')?.value
    if (!token) {
      return Response.json(
        createApiResponse(false, undefined, 'Authentication required'),
        { status: 401 }
      )
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as {
      userId: string
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
    
    // Get invitations for the league
    const invitations = await getLeagueInvitations(leagueId)
    
    return Response.json(createApiResponse(true, invitations))
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/leagues/{leagueId}/invitations - Create new invitation (admin only)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  try {
    const { leagueId } = await params
    
    // Verify authentication
    const token = request.cookies.get('auth-token')?.value
    if (!token) {
      return Response.json(
        createApiResponse(false, undefined, 'Authentication required'),
        { status: 401 }
      )
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as {
      userId: string
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
    
    // Parse and validate request body
    const body = await request.json()
    const { maxUses, expiresAt } = createInvitationSchema.parse(body)
    
    // Create invitation
    const invitation = await createLeagueInvitation(
      leagueId,
      decoded.userId,
      maxUses,
      expiresAt ? new Date(expiresAt) : null
    )
    
    return Response.json(
      createApiResponse(true, invitation, undefined, 'Invitation created successfully'),
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}