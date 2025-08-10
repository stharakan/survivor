#!/usr/bin/env node

// Scoring and Strikes Calculation HTTP Client Script
// This script calls the scoring calculation API endpoint instead of directly accessing MongoDB
// Safe to run multiple times - idempotent operation via API

// Configuration - can be set via environment variables
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const SCORING_API_KEY = process.env.SCORING_API_KEY;
const API_ENDPOINT = `${API_BASE_URL}/api/admin/recompute-scores`;

// Logging helper with timestamps
function logWithTimestamp(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// Make HTTP request to the scoring API
async function callScoringAPI() {
  if (!SCORING_API_KEY) {
    throw new Error('SCORING_API_KEY environment variable is required');
  }

  const startTime = new Date();
  logWithTimestamp(`=== Scoring Calculation HTTP Client Started ===`);
  logWithTimestamp(`API Endpoint: ${API_ENDPOINT}`);

  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': SCORING_API_KEY,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText} - ${data.error || 'Unknown error'}`);
    }

    if (!data.success) {
      throw new Error(`API returned error: ${data.error || 'Unknown error'}`);
    }

    const endTime = new Date();
    const totalDuration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);

    logWithTimestamp(`=== Scoring Calculation HTTP Client Completed Successfully ===`);
    logWithTimestamp(`API Response Summary:`);
    logWithTimestamp(`  • ${data.data.picksUpdated} pick results updated`);
    logWithTimestamp(`  • ${data.data.membershipsUpdated} league memberships updated`);
    logWithTimestamp(`  • API execution time: ${data.data.executionTime} seconds`);
    logWithTimestamp(`  • Total client time: ${totalDuration} seconds`);
    logWithTimestamp(`  • Completed at: ${data.data.completedAt}`);

    return {
      success: true,
      picksUpdated: data.data.picksUpdated,
      membershipsUpdated: data.data.membershipsUpdated,
      executionTime: data.data.executionTime,
      completedAt: data.data.completedAt
    };

  } catch (error) {
    const endTime = new Date();
    const totalDuration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);

    logWithTimestamp(`=== Scoring Calculation HTTP Client Failed ===`);
    logWithTimestamp(`Error: ${error.message}`);
    logWithTimestamp(`Total execution time: ${totalDuration} seconds`);
    logWithTimestamp(`Failed at: ${endTime.toISOString()}`);

    // Check if it's a network/connection error
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      logWithTimestamp(`Network Error: Unable to connect to API at ${API_BASE_URL}`);
      logWithTimestamp(`Make sure the API server is running and accessible`);
    }

    throw error;
  }
}

// Main execution function
async function main() {
  try {
    // Validate environment variables
    if (!SCORING_API_KEY) {
      logWithTimestamp('ERROR: SCORING_API_KEY environment variable is required');
      logWithTimestamp('Set it using: export SCORING_API_KEY="your-api-key"');
      process.exit(1);
    }

    // Call the scoring API
    const result = await callScoringAPI();
    
    logWithTimestamp('Script completed successfully');
    process.exit(0);

  } catch (error) {
    logWithTimestamp(`Script failed: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// Export for potential use as a module
module.exports = {
  callScoringAPI,
  main
};