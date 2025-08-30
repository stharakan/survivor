import { addHours, isAfter, parseISO } from "date-fns"
import type { GameStatus } from "@/types/game"

export interface GameStatusDisplay {
  label: string
  className: string
  icon?: string
}

/**
 * Computes the current status of a game based on its start time and current time.
 * This is the single source of truth for game status logic.
 * 
 * - "not_started": Game hasn't started yet (current time < start time)
 * - "in_progress": Game has started but within 2.5 hours (start time <= current time < start time + 2.5 hours)  
 * - "completed": Game is more than 2.5 hours past start time (current time >= start time + 2.5 hours)
 * 
 * Manual status overrides (from database) take precedence over time-based logic.
 */
export function computeGameStatus(game: { 
  startTime?: string; 
  date?: string; 
  status?: GameStatus;
  manualStatusOverride?: GameStatus 
}): GameStatus {
  const now = new Date()
  
  // Manual override always takes precedence (for admin control)
  if (game.manualStatusOverride) {
    return game.manualStatusOverride
  }
  
  // If we have a stored status and it's "completed", trust it
  if (game.status === "completed") {
    return "completed"
  }
  
  // Use startTime if available, fallback to date for backward compatibility
  const gameStartTime = game.startTime || game.date
  
  if (!gameStartTime) {
    // If no time information available, use stored status or default
    return game.status || "not_started"
  }
  
  const startTime = gameStartTime instanceof Date ? gameStartTime : parseISO(gameStartTime)
  const gameEndBuffer = addHours(startTime, 2.5)
  
  // Time-based status computation
  if (now > gameEndBuffer) {
    return "completed"
  } else if (now > startTime) {
    return "in_progress"
  } else {
    return "not_started"
  }
}

/**
 * Determines if a user can make a pick from this game
 * Only "not_started" games are pickable
 */
export function canPickFromGame(game: { startTime?: string; date?: string; status?: GameStatus; manualStatusOverride?: GameStatus }): boolean {
  return computeGameStatus(game) === "not_started"
}

/**
 * Gets the display configuration for a game status
 */
export function getGameStatusDisplay(status: GameStatus): GameStatusDisplay {
  switch (status) {
    case "not_started":
      return {
        label: "Not Started",
        className: "bg-green-500 text-white",
        icon: "Clock"
      }
    case "in_progress":
      return {
        label: "LIVE",
        className: "bg-red-500 text-white", 
        icon: "Clock"
      }
    case "completed":
      return {
        label: "FINAL",
        className: "bg-gray-600 text-white",
        icon: "X"
      }
  }
}

/**
 * Checks if a game should be grayed out (not pickable)
 */
export function isGameDisabled(game: { startTime?: string; date?: string; status?: GameStatus; manualStatusOverride?: GameStatus }): boolean {
  const status = computeGameStatus(game)
  return status === "in_progress" || status === "completed"
}

/**
 * Gets the appropriate styling classes for a game card based on its status
 */
export function getGameCardClasses(
  game: { startTime?: string; date?: string; status?: GameStatus; manualStatusOverride?: GameStatus },
  isSelected: boolean = false
): string {
  const baseClasses = "border-2 border-black shadow-pixel"
  const status = computeGameStatus(game)
  
  if (status === "not_started") {
    return `${baseClasses} ${isSelected ? "bg-retro-orange text-white" : "hover:bg-accent"}`
  } else {
    return `${baseClasses} opacity-60 cursor-not-allowed bg-gray-100 dark:bg-gray-800`
  }
}

/**
 * Checks if a user can change their existing pick by verifying
 * the original picked game hasn't started yet (based on game time, not status)
 */
export function canChangeExistingPick(existingPickGame: { 
  startTime?: string; 
  date?: string; 
  status?: GameStatus; 
  manualStatusOverride?: GameStatus 
}): boolean {
  const now = new Date()
  const gameStartTime = existingPickGame.startTime || existingPickGame.date
  
  if (!gameStartTime) {
    return true // If no time info, allow change
  }
  
  const startTime = gameStartTime instanceof Date ? gameStartTime : parseISO(gameStartTime)
  return now <= startTime // Can change if game hasn't started yet
}

/**
 * Gets the team selection styling classes based on game status and selection state
 */
export function getTeamSelectionClasses(
  game: { startTime?: string; date?: string; status?: GameStatus; manualStatusOverride?: GameStatus },
  isSelected: boolean = false,
  isTeamUsed: boolean = false,
  isPicksLocked: boolean = false
): string {
  const baseClasses = "flex flex-col items-center p-4 rounded-none border-2 transition-colors"
  const isDisabled = isGameDisabled(game)
  
  if (isPicksLocked) {
    return `${baseClasses} border-gray-400 cursor-not-allowed bg-gray-100 dark:bg-gray-800 opacity-60`
  }
  
  if (isDisabled) {
    return `${baseClasses} border-gray-300 cursor-not-allowed bg-gray-50 dark:bg-gray-900/20`
  }
  
  if (isTeamUsed) {
    return `${baseClasses} border-red-300 bg-red-50 dark:bg-red-900/20 cursor-not-allowed`
  }
  
  if (isSelected) {
    return `${baseClasses} bg-retro-orange text-white border-black cursor-pointer`
  }
  
  return `${baseClasses} hover:bg-accent border-transparent cursor-pointer`
}

/**
 * Checks if the gameweek has started by comparing current_pick_week with current_game_week
 * Gameweek is considered "started" when current_pick_week === current_game_week
 */
export function hasGameweekStarted(league: { 
  current_pick_week?: number | null; 
  current_game_week?: number | null 
}): boolean {
  const pickWeek = league.current_pick_week || 0
  const gameWeek = league.current_game_week || 0
  
  return pickWeek === gameWeek && pickWeek > 0
}

/**
 * Determines if the user's picks are locked for the current week
 * Picks are locked if the gameweek has started AND the user has an existing pick
 */
export function arePicksLocked(hasExistingPick: boolean, gameweekStarted: boolean): boolean {
  return gameweekStarted && hasExistingPick
}

/**
 * Determines if the user can make their first pick after gameweek has started
 * This is only allowed if they have no existing pick and gameweek has started
 */
export function canMakeFirstPick(hasExistingPick: boolean, gameweekStarted: boolean): boolean {
  return gameweekStarted && !hasExistingPick
}

/**
 * Determines if pick changes should be completely disabled
 * This happens when picks are locked (user has pick + gameweek started)
 */
export function shouldDisablePickChanges(hasExistingPick: boolean, gameweekStarted: boolean): boolean {
  return arePicksLocked(hasExistingPick, gameweekStarted)
}