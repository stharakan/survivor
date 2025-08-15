import { NextRequest } from 'next/server'
import { getUserLeagueMemberships } from '@/lib/db'
import { createApiResponse, handleApiError } from '@/lib/api-types'

// GET /api/users/[userId]/leagues - Get user's league memberships
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    // Await params for Next.js 15 compatibility
    const { userId } = await params
    const memberships = await getUserLeagueMemberships(userId)
    return Response.json(createApiResponse(true, memberships))
  } catch (error) {
    return handleApiError(error)
  }
}