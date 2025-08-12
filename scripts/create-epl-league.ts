#!/usr/bin/env node

// EPL 2025/2026 League Creation Script
// This script creates an EPL 2025/2026 survivor league with designated admin user
// Safe to re-run - will handle existing users and prevent duplicate leagues

import { getUserByEmail, createLeague, createLeagueMembership } from '../lib/db'
import { getDatabase, Collections } from '../lib/mongodb'
import type { User } from '../types/user'
import type { League } from '../types/league'

// Configuration
const TARGET_EMAIL = 'sameer.tharakan@gmail.com'
const SPORTS_LEAGUE = 'EPL'
const SEASON = '2025/2026'
const LEAGUE_NAME = 'Tharakan Bros Survivor League'
const LEAGUE_DESCRIPTION = 'Official Tharakan Bros Survivor League - pick one team per week and survive as long as possible! Complement your incredible picks with inane whatsapp messages! We have it all!'
const TEAM_NAME = 'Dev team aka claude'

// Logging helper with timestamps
function logWithTimestamp(message: string) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// Validate environment variables
function validateEnvironment(): void {
  const requiredVars = ['MONGODB_URI']
  const missingVars = requiredVars.filter(varName => !process.env[varName])
  
  if (missingVars.length > 0) {
    logWithTimestamp(`ERROR: Missing required environment variables: ${missingVars.join(', ')}`)
    logWithTimestamp('Required environment variables:')
    logWithTimestamp('  MONGODB_URI - MongoDB connection string')
    logWithTimestamp('  MONGODB_DB_NAME - Database name (optional, defaults to "survivor-league")')
    process.exit(1)
  }
}

// Find existing user with the target email
async function findExistingUser(): Promise<User> {
  logWithTimestamp(`Looking up existing user with email: ${TARGET_EMAIL}`)
  
  try {
    const existingUser = await getUserByEmail(TARGET_EMAIL)
    if (existingUser) {
      logWithTimestamp(`✓ Found existing user: ${existingUser.email} (ID: ${existingUser.id})`)
      return existingUser
    } else {
      throw new Error(`User with email ${TARGET_EMAIL} not found in database`)
    }
  } catch (error) {
    logWithTimestamp(`ERROR: Failed to find user: ${error.message}`)
    throw error
  }
}

// Check if league already exists
async function checkExistingLeague(): Promise<League | null> {
  logWithTimestamp(`Checking for existing league: ${LEAGUE_NAME}`)
  
  try {
    const db = await getDatabase()
    const existingLeague = await db.collection(Collections.LEAGUES).findOne({ 
      name: LEAGUE_NAME,
      sportsLeague: SPORTS_LEAGUE,
      season: SEASON
    })
    
    if (existingLeague) {
      const league = {
        id: existingLeague._id.toString(),
        name: existingLeague.name,
        description: existingLeague.description,
        sportsLeague: existingLeague.sportsLeague,
        season: existingLeague.season,
        isPublic: existingLeague.isPublic,
        requiresApproval: existingLeague.requiresApproval,
        createdBy: existingLeague.createdBy.toString(),
        isActive: existingLeague.isActive,
        memberCount: existingLeague.memberCount,
        createdAt: existingLeague.createdAt.toISOString(),
      } as League
      
      logWithTimestamp(`✓ Found existing league: ${league.name} (ID: ${league.id})`)
      return league
    }
    
    return null
  } catch (error) {
    logWithTimestamp(`ERROR: Failed to check for existing league: ${error.message}`)
    throw error
  }
}

// Create new EPL league
async function createEplLeague(createdBy: string): Promise<League> {
  logWithTimestamp(`Creating new league: ${LEAGUE_NAME}`)
  
  try {
    const league = await createLeague(
      LEAGUE_NAME,
      LEAGUE_DESCRIPTION,
      SPORTS_LEAGUE,
      SEASON,
      true, // isPublic
      false, // requiresApproval
      createdBy
    )
    
    logWithTimestamp(`✓ Created new league: ${league.name} (ID: ${league.id})`)
    return league
  } catch (error) {
    logWithTimestamp(`ERROR: Failed to create league: ${error.message}`)
    throw error
  }
}

// Check if user is already a member of the league
async function checkExistingMembership(leagueId: string, userId: string): Promise<boolean> {
  try {
    const db = await getDatabase()
    const { ObjectId } = await import('mongodb')
    const existingMembership = await db.collection(Collections.LEAGUE_MEMBERSHIPS).findOne({
      leagueId: new ObjectId(leagueId),
      userId: new ObjectId(userId)
    })
    
    if (existingMembership) {
      logWithTimestamp(`✓ User already has membership in league (Admin: ${existingMembership.isAdmin})`)
      return true
    }
    
    return false
  } catch (error) {
    logWithTimestamp(`ERROR: Failed to check existing membership: ${error.message}`)
    throw error
  }
}

// Create admin membership for user in the league
async function createAdminMembership(leagueId: string, userId: string): Promise<void> {
  logWithTimestamp(`Creating admin membership for user in league`)
  
  try {
    // Check if membership already exists
    const membershipExists = await checkExistingMembership(leagueId, userId)
    if (membershipExists) {
      logWithTimestamp(`✓ User already has membership in this league`)
      return
    }
    
    const membership = await createLeagueMembership(
      leagueId,
      userId,
      TEAM_NAME,
      true // isAdmin
    )
    
    logWithTimestamp(`✓ Created admin membership: ${membership.teamName} (ID: ${membership.id})`)
  } catch (error) {
    logWithTimestamp(`ERROR: Failed to create admin membership: ${error.message}`)
    throw error
  }
}

// Main execution function
async function main() {
  const startTime = new Date()
  
  try {
    logWithTimestamp('=== EPL 2025/2026 League Creation Started ===')
    
    // Step 1: Validate environment
    logWithTimestamp('Validating environment variables...')
    validateEnvironment()
    logWithTimestamp('✓ Environment validation passed')
    
    // Step 2: Find existing user
    const user = await findExistingUser()
    
    // Step 3: Check for existing league
    let league = await checkExistingLeague()
    
    // Step 4: Create league if it doesn't exist
    if (!league) {
      league = await createEplLeague(user.id)
    }
    
    // Step 5: Create admin membership
    await createAdminMembership(league.id, user.id)
    
    const endTime = new Date()
    const totalDuration = Math.round((endTime.getTime() - startTime.getTime()) / 1000)
    
    logWithTimestamp('=== EPL 2025/2026 League Creation Completed Successfully ===')
    logWithTimestamp('Setup Summary:')
    logWithTimestamp(`  • User: ${user.email} (ID: ${user.id})`)
    logWithTimestamp(`  • League: ${league.name} (ID: ${league.id})`)
    logWithTimestamp(`  • Sport: ${league.sportsLeague}`)
    logWithTimestamp(`  • Season: ${league.season}`)
    logWithTimestamp(`  • Admin Status: Confirmed`)
    logWithTimestamp(`  • Total execution time: ${totalDuration} seconds`)
    logWithTimestamp(`  • Completed at: ${endTime.toISOString()}`)
    
    logWithTimestamp('\n🎮 League Setup Complete!')
    logWithTimestamp('────────────────────────────────────────────')
    logWithTimestamp('Admin Details:')
    logWithTimestamp(`  📧 Email: ${user.email}`)
    logWithTimestamp(`  👤 Username: ${user.username}`)
    logWithTimestamp('\n✨ The EPL 2025/2026 survivor league is ready!')
    
    process.exit(0)
    
  } catch (error) {
    const endTime = new Date()
    const totalDuration = Math.round((endTime.getTime() - startTime.getTime()) / 1000)
    
    logWithTimestamp('=== EPL 2025/2026 League Creation Failed ===')
    logWithTimestamp(`Error: ${error.message}`)
    logWithTimestamp(`Total execution time: ${totalDuration} seconds`)
    logWithTimestamp(`Failed at: ${endTime.toISOString()}`)
    
    process.exit(1)
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
