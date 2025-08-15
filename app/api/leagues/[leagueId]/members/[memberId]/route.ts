import { NextRequest } from 'next/server'
import { getLeagueMember, updateMemberStatus } from '@/lib/db'
import { createApiResponse, handleApiError, updateMemberSchema } from '@/lib/api-types'
import { authorizeRequest, logAdminPrivilegeChange, verifyAuthToken } from '@/lib/auth-utils'
import jwt from 'jsonwebtoken'

// GET /api/leagues/[leagueId]/members/[memberId] - Get individual member
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string; memberId: string }> }
) {
  try {
    // Await params for Next.js 15 compatibility
    const { leagueId, memberId } = await params
    
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
    
    const member = await getLeagueMember(leagueId, memberId)
    
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
  { params }: { params: Promise<{ leagueId: string; memberId: string }> }
) {
  try {
    // Await params for Next.js 15 compatibility
    const { leagueId, memberId } = await params
    
    // Parse and validate request body
    const body = await request.json()
    const validatedData = updateMemberSchema.parse(body)
    
    // Get existing member data before any changes
    const existingMember = await getLeagueMember(leagueId, memberId)
    if (!existingMember) {
      return Response.json(
        createApiResponse(false, undefined, 'Member not found'),
        { status: 404 }
      )
    }
    
    // Authorize the request (includes admin permission checks)
    try {
      await authorizeRequest(request, leagueId, memberId, validatedData)
    } catch (authError: any) {
      // Return appropriate status codes for different authorization failures
      const status = authError.message.includes('Authentication required') || 
                    authError.message.includes('Invalid authentication token') ? 401 :
                    authError.message.includes('not a member') ||
                    authError.message.includes('Only league administrators') ||
                    authError.message.includes('cannot remove your own admin') ||
                    authError.message.includes('Cannot remove admin privileges from league creator') ? 403 : 400
      
      return Response.json(
        createApiResponse(false, undefined, authError.message),
        { status }
      )
    }
    
    // Store original admin status for audit logging
    const originalAdminStatus = existingMember.isAdmin
    
    // Update member status in database
    await updateMemberStatus(leagueId, memberId, validatedData)
    
    // Log admin privilege changes for audit trail
    if (typeof validatedData.isAdmin === 'boolean' && validatedData.isAdmin !== originalAdminStatus) {
      try {
        const authUser = await verifyAuthToken(request)
        await logAdminPrivilegeChange(
          authUser.userId,
          leagueId,
          memberId,
          originalAdminStatus,
          validatedData.isAdmin,
          {
            requestIP: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
            userAgent: request.headers.get('user-agent') || 'unknown'
          }
        )
      } catch (logError) {
        console.error('Failed to log admin privilege change:', logError)
        // Continue execution - audit logging failure shouldn't break the operation
      }
    }
    
    // Return updated member data
    const updatedMember = await getLeagueMember(leagueId, memberId)
    
    return Response.json(createApiResponse(true, updatedMember, undefined, 'Member updated successfully'))
  } catch (error: any) {
    // Handle validation errors specifically
    if (error.name === 'ZodError') {
      return Response.json(
        createApiResponse(false, undefined, `Validation error: ${error.errors.map((e: any) => e.message).join(', ')}`),
        { status: 400 }
      )
    }
    
    return handleApiError(error)
  }
}