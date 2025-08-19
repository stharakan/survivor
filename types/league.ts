export type League = {
  id: number
  name: string
  description: string
  sportsLeague: string // e.g., "EPL", "NFL", "NBA"
  logo?: string
  season: string
  isActive: boolean
  memberCount: number
  isPublic: boolean
  requiresApproval: boolean
  createdBy: number
  createdAt: string
  current_game_week: number | null
  current_pick_week: number | null
  last_completed_week: number | null
}

export type LeagueMembership = {
  id: number
  league: League
  user: number
  teamName: string
  points: number
  strikes: number
  rank: number
  joinedAt: string
  isActive: boolean
  isAdmin: boolean
  isPaid: boolean
  status: "active" | "pending" | "rejected"
}

export type JoinRequest = {
  id: number
  league: League
  user: {
    id: number
    username: string
    email: string
  }
  teamName: string
  message?: string
  status: "pending" | "approved" | "rejected"
  requestedAt: string
  reviewedAt?: string
  reviewedBy?: number
}

export type SportsLeagueOption = {
  id: string
  name: string
  abbreviation: string
  description: string
}
