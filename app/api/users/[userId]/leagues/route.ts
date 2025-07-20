import { NextRequest } from 'next/server'
import { getUserLeagueMemberships } from '@/lib/db'
import { createApiResponse, handleApiError } from '@/lib/api-types'

// GET /api/users/[userId]/leagues - Get user's league memberships
export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const memberships = await getUserLeagueMemberships(params.userId)
    return Response.json(createApiResponse(true, memberships))
  } catch (error) {
    return handleApiError(error)
  }
}