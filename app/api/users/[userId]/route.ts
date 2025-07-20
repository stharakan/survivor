import { NextRequest } from 'next/server'
import { getUserById } from '@/lib/db'
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