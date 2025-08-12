import { NextRequest } from 'next/server'
import { acceptInvitation, getUserById } from '@/lib/db'
import { acceptInvitationSchema, createApiResponse, handleApiError } from '@/lib/api-types'
import jwt from 'jsonwebtoken'

// POST /api/invitations/{token}/accept - Accept invitation (authenticated)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    
    // Verify authentication
    const authToken = request.cookies.get('auth-token')?.value
    if (!authToken) {
      return Response.json(
        createApiResponse(false, undefined, 'Authentication required'),
        { status: 401 }
      )
    }
    
    const decoded = jwt.verify(authToken, process.env.JWT_SECRET || 'fallback-secret') as {
      userId: string
    }
    
    const user = await getUserById(decoded.userId)
    if (!user) {
      return Response.json(
        createApiResponse(false, undefined, 'User not found'),
        { status: 404 }
      )
    }
    
    // Parse and validate request body
    const body = await request.json()
    const { teamName } = acceptInvitationSchema.parse(body)
    
    // Accept invitation
    const result = await acceptInvitation(token, decoded.userId, teamName)
    
    if (!result.success) {
      return Response.json(
        createApiResponse(false, undefined, result.error),
        { status: 400 }
      )
    }
    
    return Response.json(
      createApiResponse(true, result.membership, undefined, 'Successfully joined league'),
      { status: 200 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}