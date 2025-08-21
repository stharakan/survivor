import { NextRequest, NextResponse } from 'next/server'
import { verifyAuthToken, getAuthorizationContext } from '@/lib/auth-utils'
import { getUserById } from '@/lib/db'
import { createApiResponse, handleApiError } from '@/lib/api-types'
import { getDatabase, Collections } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import crypto from 'crypto'
import type { PasswordResetToken } from '@/types/password-reset'

/**
 * POST /api/admin/users/[userId]/generate-reset-link
 * 
 * Admin-controlled password reset link generation for league members.
 * Creates a time-limited token and returns a magic link.
 * 
 * Requires:
 * - Valid JWT authentication
 * - Admin privileges in a shared league with the target user
 * - Cannot generate link for own account (use profile settings instead)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId: targetUserId } = await params
    
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
    
    // Prevent self-reset link generation
    if (authUser.userId === targetUserId) {
      return NextResponse.json(
        createApiResponse(false, undefined, 'Cannot generate reset link for your own account. Use account settings instead.'),
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
        createApiResponse(false, undefined, 'Only league administrators can generate password reset links'),
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
    
    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex')
    
    // Set expiration to 24 hours from now
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24)
    
    // Create password reset token record
    const db = await getDatabase()
    const now = new Date()
    
    const passwordResetToken: Omit<PasswordResetToken, 'id'> = {
      token,
      userId: targetUserId,
      createdBy: authUser.userId,
      leagueId,
      expiresAt: expiresAt.toISOString(),
      usedAt: null,
      isActive: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    }
    
    const result = await db.collection(Collections.PASSWORD_RESET_TOKENS).insertOne(passwordResetToken)
    
    if (!result.insertedId) {
      return NextResponse.json(
        createApiResponse(false, undefined, 'Failed to create password reset token'),
        { status: 500 }
      )
    }
    
    // Generate the reset link
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const resetLink = `${baseUrl}/reset-password/${token}`
    
    // Log the action for audit trail
    const auditLogEntry = {
      timestamp: new Date().toISOString(),
      action: 'admin_generate_password_reset_link',
      userId: authUser.userId,
      targetUserId: targetUserId,
      leagueId,
      tokenId: result.insertedId.toString(),
      context: {
        adminEmail: authUser.email,
        targetUserEmail: targetUser.email,
        leagueName: adminAuth.membership.league.name,
        expiresAt: expiresAt.toISOString()
      }
    }
    
    console.log('PASSWORD RESET LINK GENERATION AUDIT LOG:', JSON.stringify(auditLogEntry, null, 2))
    
    try {
      await db.collection('audit_logs').insertOne(auditLogEntry)
    } catch (error) {
      console.error('Failed to store password reset link generation audit log:', error)
      // Don't throw - audit logging failure shouldn't break the main operation
    }
    
    console.log(`Password reset link generated: Admin ${authUser.email} created link for ${targetUser.email} in league ${leagueId}`)
    
    return NextResponse.json(
      createApiResponse(
        true,
        { 
          resetLink,
          userEmail: targetUser.email,
          expiresAt: expiresAt.toISOString()
        },
        undefined,
        'Password reset link generated successfully. Share this link with the user.'
      ),
      { status: 200 }
    )
    
  } catch (error) {
    console.error('Password reset link generation error:', error)
    return handleApiError(error)
  }
}

// Reject other HTTP methods
export async function GET() {
  return NextResponse.json(
    createApiResponse(false, undefined, 'Method not allowed. Use POST to generate reset link.'),
    { status: 405 }
  )
}

export async function PUT() {
  return NextResponse.json(
    createApiResponse(false, undefined, 'Method not allowed. Use POST to generate reset link.'),
    { status: 405 }
  )
}

export async function DELETE() {
  return NextResponse.json(
    createApiResponse(false, undefined, 'Method not allowed. Use POST to generate reset link.'),
    { status: 405 }
  )
}