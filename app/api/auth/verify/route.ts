import { NextRequest } from 'next/server'
import { getUserById } from '@/lib/db'
import { createApiResponse, handleApiError } from '@/lib/api-types'
import jwt from 'jsonwebtoken'

export async function GET(request: NextRequest) {
  try {
    // Get token from cookie
    const token = request.cookies.get('auth-token')?.value
    
    if (!token) {
      return Response.json(
        createApiResponse(false, undefined, 'No token provided'),
        { status: 401 }
      )
    }
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as {
      userId: string
      email: string
    }
    
    // Get user from database
    const user = await getUserById(decoded.userId)
    if (!user) {
      return Response.json(
        createApiResponse(false, undefined, 'User not found'),
        { status: 404 }
      )
    }
    
    return Response.json(
      createApiResponse(true, { user }, undefined, 'Token valid')
    )
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