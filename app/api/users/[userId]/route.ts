import { NextRequest } from 'next/server'
import { getUserById, updateUser } from '@/lib/db'
import { createApiResponse, handleApiError } from '@/lib/api-types'

// GET /api/users/[userId] - Get user profile
export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const user = await getUserById(params.userId)
    
    if (!user) {
      return Response.json(
        createApiResponse(false, undefined, 'User not found'),
        { status: 404 }
      )
    }
    
    return Response.json(createApiResponse(true, user))
  } catch (error) {
    return handleApiError(error)
  }
}

// PATCH /api/users/[userId] - Update user profile
export async function PATCH(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const body = await request.json()
    const { name } = body
    
    // Validate name field (max 12 characters, optional)
    if (name !== undefined && name !== null) {
      if (typeof name !== 'string') {
        return Response.json(
          createApiResponse(false, undefined, 'Name must be a string'),
          { status: 400 }
        )
      }
      if (name.trim().length > 12) {
        return Response.json(
          createApiResponse(false, undefined, 'Name must be 12 characters or less'),
          { status: 400 }
        )
      }
    }
    
    const updates: any = {}
    if (name !== undefined) updates.name = name
    
    const updatedUser = await updateUser(params.userId, updates)
    
    if (!updatedUser) {
      return Response.json(
        createApiResponse(false, undefined, 'User not found'),
        { status: 404 }
      )
    }
    
    return Response.json(createApiResponse(true, updatedUser))
  } catch (error) {
    return handleApiError(error)
  }
}