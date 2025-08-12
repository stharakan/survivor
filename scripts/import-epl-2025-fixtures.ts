#!/usr/bin/env node

// EPL 2025/2026 Season Fixture Import Script
// This script imports all EPL fixtures for the 2025/2026 season from Football Data API
// Safe to re-run - will delete existing season data and repopulate with fresh data

import { getDatabase, Collections } from '../lib/mongodb'

// Configuration - can be set via environment variables
const FOOTBALLDATA_API_KEY = process.env.FOOTBALLDATA_API_KEY;
const API_BASE_URL = 'https://api.football-data.org/v4';
const COMPETITION_CODE = 'PL'; // Premier League
const SEASON = '2025';
const SEASON_DISPLAY = '2025/2026';
const SPORTS_LEAGUE = 'EPL';

// Rate limiting configuration (Football Data API allows 10 requests/minute for free tier)
const REQUEST_DELAY = 6000; // 6 seconds between requests

// Logging helper with timestamps
function logWithTimestamp(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// Sleep helper for rate limiting
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Team management will be done dynamically by querying the database

// Get next available game ID
async function getNextGameId() {
  const db = await getDatabase();
  const lastGame = await db.collection(Collections.GAMES).findOne({}, { sort: { id: -1 } });
  return lastGame ? lastGame.id + 1 : 1;
}

// Get next available team ID
async function getNextTeamId() {
  const db = await getDatabase();
  const lastTeam = await db.collection(Collections.TEAMS).findOne({}, { sort: { id: -1 } });
  return lastTeam ? lastTeam.id + 1 : 1;
}

// Find team by name in database
async function findTeamByName(teamName: string) {
  const db = await getDatabase();
  return await db.collection(Collections.TEAMS).findOne({ name: teamName });
}

// Create team from API data
async function createTeamFromApiData(apiTeam: any, teamId: number) {
  const db = await getDatabase();
  
  const teamData = {
    id: teamId,
    name: apiTeam.shortName || apiTeam.name, // Use shortName, fallback to name
    abbreviation: apiTeam.tla || apiTeam.shortName?.substring(0, 3).toUpperCase() || 'TBD',
    logo: apiTeam.crest || '',
    sportsLeague: SPORTS_LEAGUE,
    createdAt: new Date(),
  };
  
  await db.collection(Collections.TEAMS).insertOne(teamData);
  logWithTimestamp(`✓ Created new team: ${teamData.name} (ID: ${teamId})`);
  
  return teamData;
}

// Get or create team - main team management function
async function getOrCreateTeam(apiTeam: any, teamStats?: any) {
  const teamName = apiTeam.shortName || apiTeam.name;
  
  // Track unique teams processed
  if (teamStats && !teamStats.processedTeams.has(teamName)) {
    teamStats.processedTeams.add(teamName);
    
    // 1. Look up by short name
    let team = await findTeamByName(teamName);
    
    // 2. If not found, create new team
    if (!team) {
      logWithTimestamp(`Discovered new team: ${teamName}`);
      const newTeamId = await getNextTeamId();
      team = await createTeamFromApiData(apiTeam, newTeamId);
      teamStats.created++;
    } else {
      teamStats.existing++;
    }
    
    // 3. Return database team ID
    return team.id;
  } else {
    // Quick lookup for already processed teams
    const team = await findTeamByName(teamName);
    return team ? team.id : await getOrCreateTeam(apiTeam); // Fallback without stats
  }
}

// Fetch all EPL matches for the season from Football Data API
async function fetchEPLFixtures() {
  logWithTimestamp('Fetching EPL 2025/2026 fixtures from Football Data API...');
  
  if (!FOOTBALLDATA_API_KEY) {
    throw new Error('FOOTBALLDATA_API_KEY environment variable is required');
  }

  const url = `${API_BASE_URL}/competitions/${COMPETITION_CODE}/matches?season=${SEASON}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'X-Auth-Token': FOOTBALLDATA_API_KEY,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.matches || !Array.isArray(data.matches)) {
      throw new Error('Invalid API response: matches array not found');
    }

    logWithTimestamp(`Successfully fetched ${data.matches.length} fixtures from API`);
    return data.matches;

  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      logWithTimestamp(`Network Error: Unable to connect to Football Data API at ${API_BASE_URL}`);
      logWithTimestamp('Make sure you have internet connectivity and the API is accessible');
    }
    throw error;
  }
}

// Delete existing EPL 2025/2026 games from database
async function deleteExistingSeasonGames() {
  logWithTimestamp('Deleting existing EPL 2025/2026 games...');
  
  const db = await getDatabase();
  
  try {
    const deleteResult = await db.collection(Collections.GAMES).deleteMany({
      sportsLeague: SPORTS_LEAGUE,
      season: SEASON_DISPLAY
    });
    
    logWithTimestamp(`✓ Deleted ${deleteResult.deletedCount} existing EPL 2025/2026 games`);
    return deleteResult.deletedCount;
    
  } catch (error) {
    logWithTimestamp(`ERROR: Failed to delete existing games: ${error.message}`);
    throw error;
  }
}

// Transform API fixture data to database format
async function transformFixtureToGame(fixture, gameId, teamStats?) {
  // Get or create team IDs using dynamic lookup
  const homeTeamId = await getOrCreateTeam(fixture.homeTeam, teamStats);
  const awayTeamId = await getOrCreateTeam(fixture.awayTeam, teamStats);
  
  // Parse date
  const gameDate = new Date(fixture.utcDate);
  
  // Map status
  let status = 'not_started';
  if (fixture.status === 'FINISHED') {
    status = 'completed';
  } else if (fixture.status === 'IN_PLAY' || fixture.status === 'PAUSED') {
    status = 'in_progress';
  }
  
  // Extract scores if available
  const homeScore = fixture.score?.fullTime?.home || null;
  const awayScore = fixture.score?.fullTime?.away || null;
  
  return {
    id: gameId,
    week: fixture.matchday,
    homeTeamId,
    awayTeamId,
    homeScore,
    awayScore,
    status,
    date: gameDate,
    sportsLeague: SPORTS_LEAGUE,
    season: SEASON_DISPLAY,
    createdAt: new Date(),
  };
}

// Import fixtures to database
async function importFixtures(fixtures) {
  logWithTimestamp('Transforming and importing fixtures to database...');
  
  const db = await getDatabase();
  let currentGameId = await getNextGameId();
  const gamesToInsert = [];
  const errors = [];
  
  // Track team management stats
  const teamStats = {
    existing: 0,
    created: 0,
    processedTeams: new Set()
  };
  
  for (const fixture of fixtures) {
    try {
      const game = await transformFixtureToGame(fixture, currentGameId, teamStats);
      gamesToInsert.push(game);
      currentGameId++;
    } catch (error) {
      errors.push({
        fixture: `${fixture.homeTeam.shortName || fixture.homeTeam.name} vs ${fixture.awayTeam.shortName || fixture.awayTeam.name}`,
        error: error.message
      });
    }
  }
  
  // Log any transformation errors
  if (errors.length > 0) {
    logWithTimestamp(`WARNING: ${errors.length} fixtures could not be transformed:`);
    errors.forEach(error => {
      logWithTimestamp(`  ✗ ${error.fixture}: ${error.error}`);
    });
  }
  
  if (gamesToInsert.length === 0) {
    throw new Error('No valid games to insert after transformation');
  }
  
  try {
    const insertResult = await db.collection(Collections.GAMES).insertMany(gamesToInsert);
    logWithTimestamp(`✓ Successfully imported ${insertResult.insertedCount} games to database`);
    
    // Log summary by week
    const weekSummary = {};
    gamesToInsert.forEach(game => {
      weekSummary[game.week] = (weekSummary[game.week] || 0) + 1;
    });
    
    logWithTimestamp('Import summary by week:');
    Object.keys(weekSummary).sort((a, b) => parseInt(a) - parseInt(b)).forEach(week => {
      logWithTimestamp(`  Week ${week}: ${weekSummary[week]} games`);
    });
    
    return {
      imported: insertResult.insertedCount,
      errors: errors.length,
      weekSummary,
      teamStats
    };
    
  } catch (error) {
    logWithTimestamp(`ERROR: Failed to insert games into database: ${error.message}`);
    throw error;
  }
}

// Main execution function
async function main() {
  const startTime = new Date();
  
  try {
    logWithTimestamp('=== EPL 2025/2026 Fixture Import Started ===');
    
    // Validate environment variables
    if (!FOOTBALLDATA_API_KEY) {
      logWithTimestamp('ERROR: FOOTBALLDATA_API_KEY environment variable is required');
      logWithTimestamp('Set it using: export FOOTBALLDATA_API_KEY="your-api-key"');
      process.exit(1);
    }
    
    // Step 1: Delete existing season data
    const deletedCount = await deleteExistingSeasonGames();
    
    // Step 2: Fetch fixtures from API
    const fixtures = await fetchEPLFixtures();
    
    // Step 3: Import fixtures to database
    const importResult = await importFixtures(fixtures);
    
    const endTime = new Date();
    const totalDuration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
    
    logWithTimestamp('=== EPL 2025/2026 Fixture Import Completed Successfully ===');
    logWithTimestamp('Import Summary:');
    logWithTimestamp(`  • ${deletedCount} existing games deleted`);
    logWithTimestamp(`  • ${fixtures.length} fixtures fetched from API`);
    logWithTimestamp(`  • ${importResult.imported} games imported to database`);
    logWithTimestamp(`  • ${importResult.errors} transformation errors`);
    logWithTimestamp(`  • Teams: ${importResult.teamStats.existing} existing, ${importResult.teamStats.created} new teams added`);
    logWithTimestamp(`  • Total execution time: ${totalDuration} seconds`);
    logWithTimestamp(`  • Completed at: ${endTime.toISOString()}`);
    
    logWithTimestamp('Script completed successfully');
    process.exit(0);
    
  } catch (error) {
    const endTime = new Date();
    const totalDuration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
    
    logWithTimestamp('=== EPL 2025/2026 Fixture Import Failed ===');
    logWithTimestamp(`Error: ${error.message}`);
    logWithTimestamp(`Total execution time: ${totalDuration} seconds`);
    logWithTimestamp(`Failed at: ${endTime.toISOString()}`);
    
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}