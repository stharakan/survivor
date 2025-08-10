import { NextRequest, NextResponse } from 'next/server'
import { runScoringCalculation } from '@/lib/scoring'
import { createApiResponse, handleApiError } from '@/lib/api-types'
import type { ScoringResult } from '@/lib/scoring'

/**
 * POST /api/admin/recompute-scores
 * 
 * Triggers the scoring calculation process that:
 * 1. Updates pick results from null to win/draw/loss based on completed games
 * 2. Recalculates points and strikes for all league members
 * 
 * This endpoint replicates the functionality of the scripts/calculate-scores.js script
 * but provides it as an HTTP API for remote triggering.
 */
export async function POST(request: NextRequest) {
  try {
    console.log('=== API Scoring Calculation Request Started ===')
    
    // Run the complete scoring calculation
    const result = await runScoringCalculation()
    
    console.log('=== API Scoring Calculation Request Completed ===')
    
    return NextResponse.json(
      createApiResponse(true, result, undefined, 'Scoring calculation completed successfully'),
      { status: 200 }
    )
    
  } catch (error) {
    console.error('API Scoring Calculation Error:', error)
    return handleApiError(error)
  }
}

// Optional: Support GET for testing/debugging purposes
export async function GET(request: NextRequest) {
  return NextResponse.json(
    createApiResponse(
      false, 
      undefined, 
      'Method not allowed. Use POST to trigger scoring calculation.',
      'This endpoint requires POST method'
    ),
    { status: 405 }
  )
}