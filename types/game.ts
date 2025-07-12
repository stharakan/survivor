import type { Team } from "./team"

export type Game = {
  id: number
  week: number
  homeTeam: Team
  awayTeam: Team
  homeScore: number | null
  awayScore: number | null
  status: "scheduled" | "in_progress" | "completed"
  date: string
  userPick?: {
    id: number
    user: number
    team: Team
    result: "win" | "loss" | "draw" | null
    week: number
  }
}
