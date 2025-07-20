import { NextRequest } from 'next/server'
import { verifyPassword } from '@/lib/db'
import { loginSchema, createApiResponse, handleApiError } from '@/lib/api-types'
import jwt from 'jsonwebtoken'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = loginSchema.parse(body)
    
    // Verify user credentials
    const user = await verifyPassword(email, password)
    if (!user) {
      return Response.json(
        createApiResponse(false, undefined, 'Invalid email or password'),
        { status: 401 }
      )
    }
    
    // Create JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '7d' }
    )
    
    // Set HTTP-only cookie
    const response = Response.json(
      createApiResponse(true, { user, token }, undefined, 'Login successful')
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