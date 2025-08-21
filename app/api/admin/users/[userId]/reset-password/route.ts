import { NextRequest, NextResponse } from 'next/server'
import { verifyAuthToken, getAuthorizationContext } from '@/lib/auth-utils'
import { getUserById } from '@/lib/db'
import { createApiResponse, handleApiError, ApiError } from '@/lib/api-types'
import { resetUserPassword, logPasswordResetAction } from '@/lib/auth-utils'

/**
 * POST /api/admin/users/[userId]/reset-password
 * 
 * Admin-controlled password reset for league members.
 * Generates a temporary password and updates the user's account.
 * 
 * Requires:
 * - Valid JWT authentication
 * - Admin privileges in a shared league with the target user
 * - Cannot reset own password (use profile settings instead)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId: targetUserId } = params
    
    // Verify authentication
    const authUser = await verifyAuthToken(request)
    
    // Parse request body to get league context
    const body = await request.json()
    const { leagueId } = body
    
    if (!leagueId) {
      return NextResponse.json(
        createApiResponse(false, undefined, 'League ID is required'),
        { status: 400 }
      )
    }
    
    // Prevent self-password reset
    if (authUser.userId === targetUserId) {
      return NextResponse.json(
        createApiResponse(false, undefined, 'Cannot reset your own password. Use account settings instead.'),
        { status: 400 }
      )
    }
    
    // Get authorization context for requesting admin
    const adminAuth = await getAuthorizationContext(authUser.userId, leagueId)
    
    // Verify admin has membership in the league
    if (!adminAuth.membership) {
      return NextResponse.json(
        createApiResponse(false, undefined, 'You are not a member of this league'),
        { status: 403 }
      )
    }
    
    // Verify admin privileges
    if (!adminAuth.isAdmin) {
      return NextResponse.json(
        createApiResponse(false, undefined, 'Only league administrators can reset passwords'),
        { status: 403 }
      )
    }
    
    // Verify target user exists
    const targetUser = await getUserById(targetUserId)
    if (!targetUser) {
      return NextResponse.json(
        createApiResponse(false, undefined, 'Target user not found'),
        { status: 404 }
      )
    }
    
    // Check if target user is a member of the same league
    const targetAuth = await getAuthorizationContext(targetUserId, leagueId)
    if (!targetAuth.membership) {
      return NextResponse.json(
        createApiResponse(false, undefined, 'Target user is not a member of this league'),
        { status: 403 }
      )
    }
    
    // Generate temporary password and update user account
    const tempPassword = await resetUserPassword(targetUserId)
    
    // Log the password reset action for audit trail
    await logPasswordResetAction(
      authUser.userId,
      targetUserId,
      leagueId,
      'admin_reset_password',
      {
        adminEmail: authUser.email,
        targetUserEmail: targetUser.email,
        leagueName: adminAuth.membership.league.name
      }
    )
    
    console.log(`Password reset completed: Admin ${authUser.email} reset password for ${targetUser.email} in league ${leagueId}`)
    
    return NextResponse.json(
      createApiResponse(
        true,
        { 
          temporaryPassword: tempPassword,
          userEmail: targetUser.email 
        },
        undefined,
        'Password reset successful. Share the temporary password with the user.'
      ),
      { status: 200 }
    )
    
  } catch (error) {
    console.error('Password reset error:', error)
    return handleApiError(error)
  }
}

// Reject other HTTP methods
export async function GET() {
  return NextResponse.json(
    createApiResponse(false, undefined, 'Method not allowed. Use POST to reset password.'),
    { status: 405 }
  )
}

export async function PUT() {
  return NextResponse.json(
    createApiResponse(false, undefined, 'Method not allowed. Use POST to reset password.'),
    { status: 405 }
  )
}

export async function DELETE() {
  return NextResponse.json(
    createApiResponse(false, undefined, 'Method not allowed. Use POST to reset password.'),
    { status: 405 }
  )
}