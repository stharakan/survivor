import { NextRequest } from 'next/server'
import { getAllLeagues, createLeague, getUserById } from '@/lib/db'
import { createLeagueSchema, createApiResponse, handleApiError } from '@/lib/api-types'
import jwt from 'jsonwebtoken'

// GET /api/leagues - Get all leagues
export async function GET() {
  try {
    const leagues = await getAllLeagues()
    return Response.json(createApiResponse(true, leagues))
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/leagues - Create a new league
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const token = request.cookies.get('auth-token')?.value
    if (!token) {
      return Response.json(
        createApiResponse(false, undefined, 'Authentication required'),
        { status: 401 }
      )
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as {
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
    const { name, description, sportsLeague, season, isPublic, requiresApproval } = 
      createLeagueSchema.parse(body)
    
    // Create league
    const league = await createLeague(
      name,
      description,
      sportsLeague,
      season,
      isPublic,
      requiresApproval,
      user.id
    )
    
    return Response.json(
      createApiResponse(true, league, undefined, 'League created successfully'),
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}