import { NextRequest, NextResponse } from 'next/server'
import { verifyAuthToken } from '@/lib/auth-utils'
import { getUserById } from '@/lib/db'
import { createApiResponse, handleApiError } from '@/lib/api-types'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

// Validation schema for password change
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your new password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "New passwords don't match",
  path: ["confirmPassword"],
})

/**
 * POST /api/auth/change-password
 * 
 * Allows authenticated users to change their password.
 * Requires current password verification before setting new password.
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const authUser = await verifyAuthToken(request)
    
    // Parse and validate request body
    const body = await request.json()
    const { currentPassword, newPassword } = changePasswordSchema.parse(body)
    
    // Get user from database
    const user = await getUserById(authUser.userId)
    if (!user) {
      return NextResponse.json(
        createApiResponse(false, undefined, 'User not found'),
        { status: 404 }
      )
    }
    
    // Verify current password
    const { getDatabase, Collections } = await import('@/lib/mongodb')
    const { ObjectId } = await import('mongodb')
    const db = await getDatabase()
    
    const userWithPassword = await db.collection(Collections.USERS).findOne({
      _id: new ObjectId(authUser.userId)
    })
    
    if (!userWithPassword) {
      return NextResponse.json(
        createApiResponse(false, undefined, 'User not found'),
        { status: 404 }
      )
    }
    
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, userWithPassword.password)
    if (!isCurrentPasswordValid) {
      return NextResponse.json(
        createApiResponse(false, undefined, 'Current password is incorrect'),
        { status: 400 }
      )
    }
    
    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12)
    
    // Update password in database
    const result = await db.collection(Collections.USERS).updateOne(
      { _id: new ObjectId(authUser.userId) },
      { 
        $set: { 
          password: hashedNewPassword,
          passwordChangedAt: new Date()
        } 
      }
    )
    
    if (result.modifiedCount === 0) {
      return NextResponse.json(
        createApiResponse(false, undefined, 'Failed to update password'),
        { status: 500 }
      )
    }
    
    // Log password change for audit trail
    const auditLogEntry = {
      timestamp: new Date().toISOString(),
      action: 'user_password_change',
      userId: authUser.userId,
      userEmail: authUser.email,
      context: {
        initiatedBy: 'user',
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
      }
    }
    
    console.log('PASSWORD CHANGE AUDIT LOG:', JSON.stringify(auditLogEntry, null, 2))
    
    try {
      await db.collection('audit_logs').insertOne(auditLogEntry)
    } catch (error) {
      console.error('Failed to store password change audit log:', error)
      // Don't throw - audit logging failure shouldn't break the main operation
    }
    
    console.log(`Password changed successfully for user: ${authUser.email}`)
    
    return NextResponse.json(
      createApiResponse(
        true,
        { message: 'Password changed successfully' },
        undefined,
        'Your password has been updated successfully.'
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
    
    console.error('Change password error:', error)
    return handleApiError(error)
  }
}

// Reject other HTTP methods
export async function GET() {
  return NextResponse.json(
    createApiResponse(false, undefined, 'Method not allowed. Use POST to change password.'),
    { status: 405 }
  )
}

export async function PUT() {
  return NextResponse.json(
    createApiResponse(false, undefined, 'Method not allowed. Use POST to change password.'),
    { status: 405 }
  )
}

export async function DELETE() {
  return NextResponse.json(
    createApiResponse(false, undefined, 'Method not allowed. Use POST to change password.'),
    { status: 405 }
  )
}