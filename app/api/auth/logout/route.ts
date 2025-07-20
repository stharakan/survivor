import { createApiResponse } from '@/lib/api-types'

export async function POST() {
  try {
    const response = Response.json(
      createApiResponse(true, undefined, undefined, 'Logout successful')
    )
    
    // Clear the auth cookie
    response.headers.set(
      'Set-Cookie',
      'auth-token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax'
    )
    
    return response
  } catch (error) {
    return Response.json(
      createApiResponse(false, undefined, 'Logout failed'),
      { status: 500 }
    )
  }
}