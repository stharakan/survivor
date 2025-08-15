#!/usr/bin/env node

// Game Score and Status Update HTTP Client Script
// This script calls the game update API endpoint to fetch latest scores and statuses
// from Football Data API using hybrid approach for comprehensive coverage
// Safe to run multiple times - idempotent operation via API

// Configuration - can be set via environment variables
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const SCORING_API_KEY = process.env.SCORING_API_KEY;
const API_ENDPOINT = `${API_BASE_URL}/api/admin/update-game-scores`;

// Logging helper with timestamps
function logWithTimestamp(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// Make HTTP request to the game update API
async function callGameUpdateAPI() {
  if (!SCORING_API_KEY) {
    throw new Error('SCORING_API_KEY environment variable is required');
  }

  const startTime = new Date();
  logWithTimestamp(`=== Game Score Update HTTP Client Started ===`);
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

    logWithTimestamp(`=== Game Score Update HTTP Client Completed Successfully ===`);
    logWithTimestamp(`API Response Summary:`);
    logWithTimestamp(`  • ${data.data.bulkGamesProcessed} games processed from Football Data API bulk query`);
    logWithTimestamp(`  • ${data.data.overdueGamesFound} overdue games found in database scan`);
    logWithTimestamp(`  • ${data.data.individualApiCalls} individual API calls made for edge cases`);
    logWithTimestamp(`  • ${data.data.gamesUpdated} games updated in database`);
    logWithTimestamp(`  • ${data.data.gamesCompletedWithPicks} user picks affected by newly completed games`);
    logWithTimestamp(`  • API execution time: ${data.data.executionTime} seconds`);
    logWithTimestamp(`  • Total client time: ${totalDuration} seconds`);
    logWithTimestamp(`  • Completed at: ${data.data.completedAt}`);

    return {
      success: true,
      bulkGamesProcessed: data.data.bulkGamesProcessed,
      overdueGamesFound: data.data.overdueGamesFound,
      individualApiCalls: data.data.individualApiCalls,
      gamesUpdated: data.data.gamesUpdated,
      gamesCompletedWithPicks: data.data.gamesCompletedWithPicks,
      executionTime: data.data.executionTime,
      completedAt: data.data.completedAt
    };

  } catch (error) {
    const endTime = new Date();
    const totalDuration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);

    logWithTimestamp(`=== Game Score Update HTTP Client Failed ===`);
    logWithTimestamp(`Error: ${error.message}`);
    logWithTimestamp(`Total execution time: ${totalDuration} seconds`);
    logWithTimestamp(`Failed at: ${endTime.toISOString()}`);

    // Check if it's a network/connection error
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      logWithTimestamp(`Network Error: Unable to connect to API at ${API_BASE_URL}`);
      logWithTimestamp(`Make sure the API server is running and accessible`);
    }

    // Check if it's a Football Data API related error
    if (error.message.includes('FOOTBALLDATA_API_KEY')) {
      logWithTimestamp(`Football Data API Error: Check FOOTBALLDATA_API_KEY environment variable`);
      logWithTimestamp(`Ensure the API key is valid and has sufficient quota`);
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

    // Call the game update API
    const result = await callGameUpdateAPI();
    
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
  callGameUpdateAPI,
  main
};