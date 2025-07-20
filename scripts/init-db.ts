// Database initialization script
// Run this to set up initial data in MongoDB

import { initializeDefaultData, createUser, createLeague, createLeagueMembership } from '../lib/db'

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
    
    console.log('\nDatabase initialization complete!')
    console.log('You can now login with:')
    console.log('  Email: <name>demo@example.com')
    console.log('  Password: password123')
    
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
