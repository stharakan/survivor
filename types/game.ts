import type { Team } from "./team"

// Unified game status that works for both database storage and UI display
export type GameStatus = "not_started" | "in_progress" | "completed"

export type Game = {
  id: number
  week: number
  homeTeam: Team
  awayTeam: Team
  homeScore: number | null
  awayScore: number | null
  status: GameStatus
  date: string
  startTime?: string // ISO datetime string for precise game timing
  sportsLeague: string // e.g., "EPL", "NFL", "NBA"
  season: string // e.g., "2024/2025", "2025/2026"
  userPick?: {
    id: string
    user: number
    team: Team
    result: "win" | "loss" | "draw" | null
    week: number
  }
}
