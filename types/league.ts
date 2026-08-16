export type League = {
  id: string
  name: string
  description: string
  sportsLeague: string // e.g., "EPL", "NFL", "NBA"
  logo?: string
  season: string
  isActive: boolean
  memberCount: number
  isPublic: boolean
  requiresApproval: boolean
  hideScoreboard: boolean
  createdBy: string
  createdAt: string
  current_game_week: number | null
  current_pick_week: number | null
  last_completed_week: number | null
}

export type LeagueMembership = {
  id: string
  league: League
  user: string
  teamName: string
  points: number
  strikes: number
  lossStrikes?: number
  missingPickStrikes?: number
  rank: number
  joinedAt: string
  isActive: boolean
  isAdmin: boolean
  isPaid: boolean
  status: "active" | "pending" | "rejected" | "removed"
}

// NOTE: JoinRequest used to live here. Dropped (CR-105-FINDINGS.md Table 3/4,
// decided 2026-08-06): the request-to-join flow it modeled had no backing
// lib/db.ts function -- getJoinRequests/approveJoinRequest/rejectJoinRequest/
// requestToJoinLeague were permanently-stubbed or hardcoded-empty
// (lib/api-client.ts, pre-CR-106) and there is no Python route for it either.
// Registration is invite-only; removed under CR-106 along with its UI
// (app/admin/requests/[id], the admin "Requests" tab, and the "Ask to Join"
// button on app/leagues) rather than ported as dead weight.

// NEW, no lib/db.ts twin -- self-service "Inner Circle" scoreboard filter
// (personal, per-membership; see api/app/models/league.py's InnerCircleMember).
export type InnerCircleMember = {
  userId: string
  name: string
}

export type SportsLeagueOption = {
  id: string
  name: string
  abbreviation: string
  description: string
}
