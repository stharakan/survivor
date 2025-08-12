// Database initialization script
// Run this to set up initial data in MongoDB
// Safe to run multiple times - will clear and recreate games/picks data

import { initializeDefaultData, createUser, createLeague, createLeagueMembership, createGame, createPick, getUserByEmail } from '../lib/db'
import { getDatabase, Collections } from '../lib/mongodb'
import { ObjectId } from 'mongodb'
import type { User } from '../types/user'
import type { League } from '../types/league'

// Helper functions for safe re-initialization
async function clearGamesAndPicks(): Promise<void> {
  const db = await getDatabase()
  
  console.log('Clearing existing games and picks...')
  
  // Delete all picks first (to maintain referential integrity)
  const picksResult = await db.collection(Collections.PICKS).deleteMany({})
  console.log(`  ✓ Cleared ${picksResult.deletedCount} picks`)
  
  // Delete all games
  const gamesResult = await db.collection(Collections.GAMES).deleteMany({})
  console.log(`  ✓ Cleared ${gamesResult.deletedCount} games`)
}

async function getOrCreateUser(email: string, username: string, password: string): Promise<User> {
  try {
    const existingUser = await getUserByEmail(email)
    if (existingUser) {
      console.log(`✓ Using existing user: ${existingUser.email}`)
      return existingUser
    }
  } catch (error) {
    // User doesn't exist, create new one
  }
  
  const newUser = await createUser(email, username, password)
  console.log(`✓ Created new user: ${newUser.email}`)
  return newUser
}

async function getOrCreateLeague(name: string, description: string, sportsLeague: string, season: string, isPublic: boolean, requiresApproval: boolean, createdBy: string): Promise<League> {
  const db = await getDatabase()
  
  try {
    const existingLeague = await db.collection(Collections.LEAGUES).findOne({ name })
    if (existingLeague) {
      console.log(`✓ Using existing league: ${existingLeague.name}`)
      return {
        id: existingLeague._id.toString(),
        name: existingLeague.name,
        description: existingLeague.description,
        sportsLeague: existingLeague.sportsLeague,
        season: existingLeague.season,
        isPublic: existingLeague.isPublic,
        requiresApproval: existingLeague.requiresApproval,
        createdBy: existingLeague.createdBy,
        createdAt: existingLeague.createdAt,
      } as League
    }
  } catch (error) {
    // League doesn't exist, create new one
  }
  
  const newLeague = await createLeague(name, description, sportsLeague, season, isPublic, requiresApproval, createdBy)
  console.log(`✓ Created new league: ${newLeague.name}`)
  return newLeague
}

async function getOrCreateMembership(leagueId: string, userId: string, teamName: string, isAdmin: boolean = false) {
  const db = await getDatabase()
  
  try {
    const existingMembership = await db.collection(Collections.LEAGUE_MEMBERSHIPS).findOne({ 
      leagueId: new ObjectId(leagueId), 
      userId: new ObjectId(userId) 
    })
    
    if (existingMembership) {
      console.log(`✓ Using existing membership: ${teamName}`)
      return existingMembership
    }
  } catch (error) {
    // Membership doesn't exist, create new one
  }
  
  const newMembership = await createLeagueMembership(leagueId, userId, teamName, isAdmin)
  console.log(`✓ Created new membership: ${newMembership.teamName}`)
  return newMembership
}

async function initializeDatabase() {
  try {
    console.log('=== Database Re-Initialization Started ===')
    console.log('This script is safe to run multiple times.\n')
    
    // Always clear games and picks data for fresh testing
    await clearGamesAndPicks()
    
    // Initialize default teams (safe to run multiple times)
    await initializeDefaultData()
    console.log('✓ Default teams initialized')
    
    // Get or create demo users (won't duplicate)
    const demoUser = await getOrCreateUser(
      'sameerdemo@gmail.com',
      'stdemo', 
      'password123'
    )
    
    const demoUserV = await getOrCreateUser(
      'vikramdemo@gmail.com',
      'vtdemo',
      'password123'
    )
    
    // Get or create demo league (won't duplicate)
    // Note: Demo league is private for accurate record keeping
    const demoLeague = await getOrCreateLeague(
      'Demo League',
      'A demo survivor league',
      'EPL',
      '2024/2025',
      false, // isPublic: false (private league)
      true,  // requiresApproval: true
      demoUser.id
    )
    
    // Get or create memberships (won't duplicate)
    await getOrCreateMembership(demoLeague.id, demoUser.id, 'Demo Team', true)
    await getOrCreateMembership(demoLeague.id, demoUserV.id, 'Vikram United', false)
    
    // Create sample games for different weeks
    console.log('\nCreating sample games...')
    
    // Week 1 - completed games (past dates)
    const week1Games = [
      { homeTeam: 1, awayTeam: 2, homeScore: 2, awayScore: 1, status: 'completed', daysAgo: 14 }, // Arsenal vs Aston Villa
      { homeTeam: 3, awayTeam: 4, homeScore: 1, awayScore: 3, status: 'completed', daysAgo: 14 }, // Bournemouth vs Brentford
      { homeTeam: 5, awayTeam: 6, homeScore: 0, awayScore: 2, status: 'completed', daysAgo: 14 }, // Brighton vs Chelsea
    ]
    
    for (const game of week1Games) {
      const gameDate = new Date()
      gameDate.setDate(gameDate.getDate() - game.daysAgo)
      
      await createGame(
        1,
        game.homeTeam,
        game.awayTeam,
        gameDate,
        'EPL',
        '2024/2025',
        game.homeScore,
        game.awayScore,
        game.status as "completed"
      )
    }
    console.log('✓ Week 1 games created (completed)')
    
    // Week 2 - completed games (past dates)
    const week2Games = [
      { homeTeam: 7, awayTeam: 8, homeScore: 1, awayScore: 0, status: 'completed', daysAgo: 7 }, // Crystal Palace vs Everton
      { homeTeam: 9, awayTeam: 10, homeScore: 2, awayScore: 3, status: 'completed', daysAgo: 7 }, // Fulham vs Liverpool
      { homeTeam: 11, awayTeam: 12, homeScore: 4, awayScore: 1, status: 'completed', daysAgo: 7 }, // Man City vs Man United
    ]
    
    for (const game of week2Games) {
      const gameDate = new Date()
      gameDate.setDate(gameDate.getDate() - game.daysAgo)
      
      await createGame(
        2,
        game.homeTeam,
        game.awayTeam,
        gameDate,
        'EPL',
        '2024/2025',
        game.homeScore,
        game.awayScore,
        game.status as "completed"
      )
    }
    console.log('✓ Week 2 games created (completed)')
    
    // Week 3 - upcoming games (future dates)
    const week3Games = [
      { homeTeam: 13, awayTeam: 14, status: 'not_started', daysFromNow: 3 }, // Newcastle vs Nottingham Forest
      { homeTeam: 15, awayTeam: 16, status: 'not_started', daysFromNow: 3 }, // Southampton vs Tottenham
      { homeTeam: 17, awayTeam: 18, status: 'not_started', daysFromNow: 3 }, // West Ham vs Wolves
    ]
    
    for (const game of week3Games) {
      const gameDate = new Date()
      gameDate.setDate(gameDate.getDate() + game.daysFromNow)
      
      await createGame(
        3,
        game.homeTeam,
        game.awayTeam,
        gameDate,
        'EPL',
        '2024/2025',
        null,
        null,
        game.status as "not_started"
      )
    }
    console.log('✓ Week 3 games created (upcoming)')
    
    // Week 4 - upcoming games (future dates)
    const week4Games = [
      { homeTeam: 19, awayTeam: 20, status: 'not_started', daysFromNow: 10 }, // Leicester vs Ipswich
      { homeTeam: 1, awayTeam: 6, status: 'not_started', daysFromNow: 10 }, // Arsenal vs Chelsea
      { homeTeam: 10, awayTeam: 11, status: 'not_started', daysFromNow: 10 }, // Liverpool vs Man City
    ]
    
    for (const game of week4Games) {
      const gameDate = new Date()
      gameDate.setDate(gameDate.getDate() + game.daysFromNow)
      
      await createGame(
        4,
        game.homeTeam,
        game.awayTeam,
        gameDate,
        'EPL',
        '2024/2025',
        null,
        null,
        game.status as "not_started"
      )
    }
    console.log('✓ Week 4 games created (upcoming)')
    
    // Create sample picks for both demo users
    console.log('\nCreating sample picks...')
    
    // Demo user picks (some winning, some losing)
    await createPick(demoUser.id, demoLeague.id, 1, 1, 1) // Week 1: Arsenal (won 2-1)
    await createPick(demoUser.id, demoLeague.id, 4, 7, 2) // Week 2: Crystal Palace (won 1-0)
    await createPick(demoUser.id, demoLeague.id, 7, 13, 3) // Week 3: Newcastle (upcoming)
    console.log('✓ Demo user picks created')
    
    // Second demo user picks (mixed results)
    await createPick(demoUserV.id, demoLeague.id, 1, 2, 1) // Week 1: Aston Villa (lost 1-2)
    await createPick(demoUserV.id, demoLeague.id, 6, 11, 2) // Week 2: Man City (won 4-1)
    await createPick(demoUserV.id, demoLeague.id, 8, 15, 3) // Week 3: Southampton (upcoming)
    console.log('✓ Second demo user picks created')
    
    console.log('\n=== Database Re-Initialization Complete! ===')
    console.log('\n🎮 Ready for Testing!')
    console.log('────────────────────────────────────────────')
    console.log('Login Credentials:')
    console.log('  📧 sameerdemo@gmail.com (Admin)')
    console.log('  📧 vikramdemo@gmail.com (Member)')
    console.log('  🔑 password123 (for both)')
    
    console.log('\n📊 Fresh Sample Data Created:')
    console.log('  🎯 4 weeks of games with different statuses')
    console.log('  📅 Week 1 & 2: Completed games (past)')  
    console.log('  📅 Week 3: Games in 3 days (pickable)')
    console.log('  📅 Week 4: Games in 10 days (pickable)')
    console.log('  🏆 Sample picks for both users')
    console.log('  ✨ Mix of winning/losing picks for realistic testing')
    
    console.log('\n🧪 Perfect for testing:')
    console.log('  • Game status system (not_started/in_progress/completed)')
    console.log('  • Pick restrictions by game status')
    console.log('  • One pick per week enforcement')
    console.log('  • Header pick display')
    console.log('  • Score display for completed games')
    
    console.log('\n💡 Run this script again anytime to reset games & picks!')
    console.log('   (Users and leagues will be preserved)')
    
  } catch (error) {
    console.error('Database initialization failed:', error)
  }
}

// Run if called directly
if (require.main === module) {
  initializeDatabase()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}
