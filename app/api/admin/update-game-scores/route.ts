import { NextRequest, NextResponse } from 'next/server'
import { updateGameScores } from '@/lib/game-updater'
import { createApiResponse, handleApiError } from '@/lib/api-types'

/**
 * Validates the API key from the request headers
 */
function validateApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('X-API-Key')
  const expectedApiKey = process.env.SCORING_API_KEY
  
  if (!expectedApiKey) {
    console.warn('SCORING_API_KEY environment variable not set')
    return false
  }
  
  if (!apiKey) {
    return false
  }
  
  return apiKey === expectedApiKey
}

/**
 * POST /api/admin/update-game-scores
 * 
 * Triggers the game status and score update process using hybrid approach:
 * 1. Queries Football Data API for games in extended range (today → +1 week)
 * 2. Scans database for overdue games (started but still "not_started")
 * 3. Smart individual API calls for overdue games not found in bulk response
 * 4. Updates database with accurate status and scores
 * 5. Triggers score recalculation for newly completed games with user picks
 * 
 * Requires API key authentication via X-API-Key header.
 */
export async function POST(request: NextRequest) {
  try {
    // Validate API key authentication
    if (!validateApiKey(request)) {
      console.log('=== Game Score Update Request - Authentication Failed ===')
      return NextResponse.json(
        createApiResponse(false, undefined, 'Invalid or missing API key'),
        { status: 401 }
      )
    }
    
    console.log('=== Game Score Update Request Started ===')
    
    // Run the complete game update process
    const result = await updateGameScores()
    
    console.log('=== Game Score Update Request Completed ===')
    
    return NextResponse.json(
      createApiResponse(true, result, undefined, 'Game score update completed successfully'),
      { status: 200 }
    )
    
  } catch (error) {
    console.error('Game Score Update Error:', error)
    return handleApiError(error)
  }
}

// Optional: Support GET for testing/debugging purposes
export async function GET(request: NextRequest) {
  return NextResponse.json(
    createApiResponse(
      false, 
      undefined, 
      'Method not allowed. Use POST to trigger game score updates.',
      'This endpoint requires POST method'
    ),
    { status: 405 }
  )
}