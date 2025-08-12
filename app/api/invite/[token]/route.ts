import { NextRequest } from 'next/server'
import { getInvitationByToken } from '@/lib/db'
import { createApiResponse, handleApiError } from '@/lib/api-types'

// GET /api/invitations/{token} - Get invitation details (public)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    
    const invitation = await getInvitationByToken(token)
    if (!invitation) {
      return Response.json(
        createApiResponse(false, undefined, 'Invitation not found'),
        { status: 404 }
      )
    }
    
    return Response.json(createApiResponse(true, invitation))
  } catch (error) {
    return handleApiError(error)
  }
}