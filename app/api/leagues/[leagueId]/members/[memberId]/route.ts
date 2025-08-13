import { NextRequest } from 'next/server'
import { getLeagueMember, updateMemberStatus } from '@/lib/db'
import { createApiResponse, handleApiError } from '@/lib/api-types'
import jwt from 'jsonwebtoken'

// GET /api/leagues/[leagueId]/members/[memberId] - Get individual member
export async function GET(
  request: NextRequest,
  { params }: { params: { leagueId: string; memberId: string } }
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
    
    const member = await getLeagueMember(params.leagueId, params.memberId)
    
    if (!member) {
      return Response.json(
        createApiResponse(false, undefined, 'Member not found'),
        { status: 404 }
      )
    }
    
    return Response.json(createApiResponse(true, member))
  } catch (error) {
    return handleApiError(error)
  }
}

// PATCH /api/leagues/[leagueId]/members/[memberId] - Update member status
export async function PATCH(
  request: NextRequest,
  { params }: { params: { leagueId: string; memberId: string } }
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
    
    // Parse request body
    const body = await request.json()
    const updates: { isPaid?: boolean; isAdmin?: boolean; teamName?: string } = {}
    
    if (typeof body.isPaid === 'boolean') {
      updates.isPaid = body.isPaid
    }
    if (typeof body.isAdmin === 'boolean') {
      updates.isAdmin = body.isAdmin
    }
    if (typeof body.teamName === 'string') {
      const trimmed = body.teamName.trim()
      if (trimmed.length === 0) {
        return Response.json(
          createApiResponse(false, undefined, 'Team name cannot be empty'),
          { status: 400 }
        )
      }
      if (trimmed.length > 100) {
        return Response.json(
          createApiResponse(false, undefined, 'Team name must be 100 characters or less'),
          { status: 400 }
        )
      }
      updates.teamName = trimmed
    }
    
    if (Object.keys(updates).length === 0) {
      return Response.json(
        createApiResponse(false, undefined, 'No valid updates provided'),
        { status: 400 }
      )
    }
    
    // Check if member exists
    const existingMember = await getLeagueMember(params.leagueId, params.memberId)
    if (!existingMember) {
      return Response.json(
        createApiResponse(false, undefined, 'Member not found'),
        { status: 404 }
      )
    }
    
    // Update member status
    await updateMemberStatus(params.leagueId, params.memberId, updates)
    
    // Return updated member data
    const updatedMember = await getLeagueMember(params.leagueId, params.memberId)
    
    return Response.json(createApiResponse(true, updatedMember))
  } catch (error) {
    return handleApiError(error)
  }
}