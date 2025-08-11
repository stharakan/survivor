import { NextRequest } from 'next/server'
import { createUser, getUserByEmail } from '@/lib/db'
import { registerSchema, createApiResponse, handleApiError } from '@/lib/api-types'
import jwt from 'jsonwebtoken'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, username, password } = registerSchema.parse(body)
    
    // Check if user already exists
    const existingUser = await getUserByEmail(email)
    if (existingUser) {
      return Response.json(
        createApiResponse(false, undefined, 'An account with this email already exists'),
        { status: 400 }
      )
    }
    
    // Create new user
    const user = await createUser(email, username, password)
    
    // Create JWT token (same as login endpoint)
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '7d' }
    )
    
    // Set HTTP-only cookie (same as login endpoint)
    const response = Response.json(
      createApiResponse(true, { user, token }, undefined, 'Registration successful')
    )
    
    response.headers.set(
      'Set-Cookie',
      `auth-token=${token}; HttpOnly; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax`
    )
    
    return response
  } catch (error) {
    return handleApiError(error)
  }
}