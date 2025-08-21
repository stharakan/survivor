import { NextRequest, NextResponse } from 'next/server'
import { createApiResponse, handleApiError } from '@/lib/api-types'
import { getDatabase, Collections } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import type { PasswordResetValidationInfo, CompletePasswordResetRequest } from '@/types/password-reset'

// Validation schema for password reset completion
const completePasswordResetSchema = z.object({
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your new password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
})

/**
 * GET /api/reset-password/[token]
 * 
 * Validates a password reset token and returns user information.
 * Used by the reset password page to verify the token is valid.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    
    const db = await getDatabase()
    
    // Find the password reset token
    const resetToken = await db.collection(Collections.PASSWORD_RESET_TOKENS).findOne({
      token,
      isActive: true
    })
    
    if (!resetToken) {
      return NextResponse.json(
        createApiResponse(false, undefined, 'Password reset token not found'),
        { status: 404 }
      )
    }
    
    // Check if token is expired
    const now = new Date()
    const expiresAt = new Date(resetToken.expiresAt)
    const isExpired = now > expiresAt
    
    // Check if token has been used
    const isUsed = resetToken.usedAt !== null
    
    // Get user information
    const user = await db.collection(Collections.USERS).findOne({
      _id: new ObjectId(resetToken.userId)
    })
    
    if (!user) {
      return NextResponse.json(
        createApiResponse(false, undefined, 'User not found'),
        { status: 404 }
      )
    }
    
    // Get league information
    const league = await db.collection(Collections.LEAGUES).findOne({
      _id: new ObjectId(resetToken.leagueId)
    })
    
    if (!league) {
      return NextResponse.json(
        createApiResponse(false, undefined, 'League not found'),
        { status: 404 }
      )
    }
    
    const validationInfo: PasswordResetValidationInfo = {
      token: {
        id: resetToken._id.toString(),
        token: resetToken.token,
        isValid: !isExpired && !isUsed,
        isExpired,
        isUsed
      },
      user: {
        id: user._id.toString(),
        username: user.username,
        email: user.email
      },
      league: {
        id: league._id.toString(),
        name: league.name
      }
    }
    
    return NextResponse.json(createApiResponse(true, validationInfo))
    
  } catch (error) {
    console.error('Password reset token validation error:', error)
    return handleApiError(error)
  }
}

/**
 * POST /api/reset-password/[token]
 * 
 * Completes the password reset process by setting a new password.
 * Validates the token and updates the user's password.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    
    // Parse and validate request body
    const body = await request.json()
    const { newPassword } = completePasswordResetSchema.parse(body)
    
    const db = await getDatabase()
    
    // Find the password reset token
    const resetToken = await db.collection(Collections.PASSWORD_RESET_TOKENS).findOne({
      token,
      isActive: true
    })
    
    if (!resetToken) {
      return NextResponse.json(
        createApiResponse(false, undefined, 'Password reset token not found'),
        { status: 404 }
      )
    }
    
    // Check if token is expired
    const now = new Date()
    const expiresAt = new Date(resetToken.expiresAt)
    if (now > expiresAt) {
      return NextResponse.json(
        createApiResponse(false, undefined, 'Password reset token has expired'),
        { status: 400 }
      )
    }
    
    // Check if token has been used
    if (resetToken.usedAt) {
      return NextResponse.json(
        createApiResponse(false, undefined, 'Password reset token has already been used'),
        { status: 400 }
      )
    }
    
    // Get user information
    const user = await db.collection(Collections.USERS).findOne({
      _id: new ObjectId(resetToken.userId)
    })
    
    if (!user) {
      return NextResponse.json(
        createApiResponse(false, undefined, 'User not found'),
        { status: 404 }
      )
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12)
    
    // Update user password
    const updateResult = await db.collection(Collections.USERS).updateOne(
      { _id: new ObjectId(resetToken.userId) },
      { 
        $set: { 
          password: hashedPassword,
          passwordChangedAt: new Date()
        } 
      }
    )
    
    if (updateResult.modifiedCount === 0) {
      return NextResponse.json(
        createApiResponse(false, undefined, 'Failed to update password'),
        { status: 500 }
      )
    }
    
    // Mark token as used
    await db.collection(Collections.PASSWORD_RESET_TOKENS).updateOne(
      { _id: resetToken._id },
      { 
        $set: { 
          usedAt: now.toISOString(),
          isActive: false,
          updatedAt: now.toISOString()
        } 
      }
    )
    
    // Log password reset completion for audit trail
    const auditLogEntry = {
      timestamp: new Date().toISOString(),
      action: 'user_password_reset_completed',
      userId: resetToken.userId,
      tokenId: resetToken._id.toString(),
      leagueId: resetToken.leagueId,
      context: {
        userEmail: user.email,
        resetTokenCreatedBy: resetToken.createdBy,
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
      }
    }
    
    console.log('PASSWORD RESET COMPLETION AUDIT LOG:', JSON.stringify(auditLogEntry, null, 2))
    
    try {
      await db.collection('audit_logs').insertOne(auditLogEntry)
    } catch (error) {
      console.error('Failed to store password reset completion audit log:', error)
      // Don't throw - audit logging failure shouldn't break the main operation
    }
    
    console.log(`Password reset completed for user: ${user.email}`)
    
    return NextResponse.json(
      createApiResponse(
        true,
        { message: 'Password reset successful' },
        undefined,
        'Your password has been reset successfully. You can now log in with your new password.'
      ),
      { status: 200 }
    )
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        createApiResponse(false, undefined, error.errors[0].message),
        { status: 400 }
      )
    }
    
    console.error('Password reset completion error:', error)
    return handleApiError(error)
  }
}

// Reject other HTTP methods
export async function PUT() {
  return NextResponse.json(
    createApiResponse(false, undefined, 'Method not allowed. Use GET to validate token or POST to reset password.'),
    { status: 405 }
  )
}

export async function DELETE() {
  return NextResponse.json(
    createApiResponse(false, undefined, 'Method not allowed. Use GET to validate token or POST to reset password.'),
    { status: 405 }
  )
}