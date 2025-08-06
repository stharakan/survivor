// Database initialization script
// Run this to set up initial data in MongoDB

import { initializeDefaultData, createUser, createLeague, createLeagueMembership, createGame, createPick } from '../lib/db'

async function initializeDatabase() {
  try {
    console.log('Initializing database...')
    
    // Initialize default teams
    await initializeDefaultData()
    console.log('✓ Default teams created')
    
    // Create a demo user
    const demoUser = await createUser(
      'sameerdemo@gmail.com',
      'stdemo',
      'password123'
    )
    console.log('✓ Demo user created:', demoUser.email)
    
    // Create 2nd demo user
    const demoUserV = await createUser(
      'vikramdemo@gmail.com',
      'vtdemo',
      'password123'
    )
    console.log('✓ Demo user created:', demoUserV.email)
    
    // Create a demo league
    const demoLeague = await createLeague(
      'Demo League',
      'A demo survivor league',
      'EPL',
      '2025-26',
      true,
      false,
      demoUser.id
    )
    console.log('✓ Demo league created:', demoLeague.name)
    
    // Add demo user to the league as admin
    const membership = await createLeagueMembership(
      demoLeague.id,
      demoUser.id,
      'Demo Team',
      true
    )
    console.log('✓ Demo membership created:', membership.teamName)
    
    // Add second demo user to the league
    const membershipV = await createLeagueMembership(
      demoLeague.id,
      demoUserV.id,
      'Vikram United',
      false
    )
    console.log('✓ Second demo membership created:', membershipV.teamName)
    
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
        game.homeScore,
        game.awayScore,
        game.status as "completed"
      )
    }
    console.log('✓ Week 2 games created (completed)')
    
    // Week 3 - upcoming games (future dates)
    const week3Games = [
      { homeTeam: 13, awayTeam: 14, status: 'scheduled', daysFromNow: 3 }, // Newcastle vs Nottingham Forest
      { homeTeam: 15, awayTeam: 16, status: 'scheduled', daysFromNow: 3 }, // Southampton vs Tottenham
      { homeTeam: 17, awayTeam: 18, status: 'scheduled', daysFromNow: 3 }, // West Ham vs Wolves
    ]
    
    for (const game of week3Games) {
      const gameDate = new Date()
      gameDate.setDate(gameDate.getDate() + game.daysFromNow)
      
      await createGame(
        3,
        game.homeTeam,
        game.awayTeam,
        gameDate,
        null,
        null,
        game.status as "scheduled"
      )
    }
    console.log('✓ Week 3 games created (upcoming)')
    
    // Week 4 - upcoming games (future dates)
    const week4Games = [
      { homeTeam: 19, awayTeam: 20, status: 'scheduled', daysFromNow: 10 }, // Leicester vs Ipswich
      { homeTeam: 1, awayTeam: 6, status: 'scheduled', daysFromNow: 10 }, // Arsenal vs Chelsea
      { homeTeam: 10, awayTeam: 11, status: 'scheduled', daysFromNow: 10 }, // Liverpool vs Man City
    ]
    
    for (const game of week4Games) {
      const gameDate = new Date()
      gameDate.setDate(gameDate.getDate() + game.daysFromNow)
      
      await createGame(
        4,
        game.homeTeam,
        game.awayTeam,
        gameDate,
        null,
        null,
        game.status as "scheduled"
      )
    }
    console.log('✓ Week 4 games created (upcoming)')
    
    // Create sample picks for both demo users
    console.log('\nCreating sample picks...')
    
    // Demo user picks (some winning, some losing)
    await createPick(demoUser.id, demoLeague.id, 1, 1, 1) // Week 1: Arsenal (won 2-1)
    await createPick(demoUser.id, demoLeague.id, 2, 4, 1) // Week 1: Brentford (won 3-1)
    await createPick(demoUser.id, demoLeague.id, 4, 7, 2) // Week 2: Crystal Palace (won 1-0)
    await createPick(demoUser.id, demoLeague.id, 5, 10, 2) // Week 2: Liverpool (won 3-2)
    await createPick(demoUser.id, demoLeague.id, 7, 13, 3) // Week 3: Newcastle (upcoming)
    console.log('✓ Demo user picks created')
    
    // Second demo user picks (mixed results)
    await createPick(demoUserV.id, demoLeague.id, 1, 2, 1) // Week 1: Aston Villa (lost 1-2)
    await createPick(demoUserV.id, demoLeague.id, 3, 6, 1) // Week 1: Chelsea (won 2-0)
    await createPick(demoUserV.id, demoLeague.id, 4, 8, 2) // Week 2: Everton (lost 0-1)
    await createPick(demoUserV.id, demoLeague.id, 6, 11, 2) // Week 2: Man City (won 4-1)
    await createPick(demoUserV.id, demoLeague.id, 8, 15, 3) // Week 3: Southampton (upcoming)
    console.log('✓ Second demo user picks created')
    
    console.log('\nDatabase initialization complete!')
    console.log('You can now login with:')
    console.log('  Email: sameerdemo@gmail.com or vikramdemo@gmail.com')
    console.log('  Password: password123')
    console.log('\nSample data includes:')
    console.log('  • 4 weeks of games (2 completed, 2 upcoming)')
    console.log('  • Picks for both users across multiple weeks')
    console.log('  • Mix of winning and losing picks for realistic scoring')
    
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
