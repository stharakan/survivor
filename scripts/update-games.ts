#!/usr/bin/env npx tsx

import { updateGameScores } from '../lib/game-updater'

async function main() {
  console.log('Starting game score update...')
  
  try {
    const result = await updateGameScores()
    console.log('Game update completed successfully:', result)
    process.exit(0)
  } catch (error) {
    console.error('Game update failed:', error)
    process.exit(1)
  }
}

main()