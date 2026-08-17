import type { User } from "@/types/user"
import type { Player } from "@/types/player"
import type { PlayerProfile } from "@/types/player-profile"
import type { Pick } from "@/types/pick"
import type { Team } from "@/types/team"
import type { Game } from "@/types/game"
import type { League, LeagueMembership, InnerCircleMember, AIPromptData } from "@/types/league"
import type { ApiResponse } from "@/lib/api-types"
import type { SeasonSummary } from "@/types/season-summary"

// Base API URL
const API_BASE = '/api'

// Helper function to handle API responses
async function apiRequest<T>(
  url: string, 
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include', // Include cookies for authentication
    ...options,
  })
  
  const data: ApiResponse<T> = await response.json()
  
  if (!data.success) {
    throw new Error(data.error || 'API request failed')
  }
  
  return data.data as T
}

// Authentication API functions
export async function loginUser(email: string, password: string): Promise<{ user: User; token: string }> {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function registerUser(
  email: string, 
  password: string, 
  confirmPassword: string,
  displayName?: string
): Promise<{ user: User; token: string }> {
  const payload: any = { email, password, confirmPassword }
  if (displayName?.trim()) {
    payload.displayName = displayName.trim()
  }
  
  return apiRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function logoutUser(): Promise<void> {
  return apiRequest('/auth/logout', {
    method: 'POST',
  })
}

export async function verifyUser(): Promise<{ user: User }> {
  return apiRequest('/auth/verify')
}

// League API functions
export async function getAllLeagues(): Promise<League[]> {
  return apiRequest('/leagues')
}

export async function createLeague(
  name: string,
  description: string,
  sportsLeague: string,
  season: string,
  isPublic: boolean = false,
  requiresApproval: boolean = true
): Promise<League> {
  return apiRequest('/leagues', {
    method: 'POST',
    body: JSON.stringify({
      name,
      description,
      sportsLeague,
      season,
      isPublic,
      requiresApproval,
    }),
  })
}

export async function getLeague(leagueId: string): Promise<League> {
  return apiRequest(`/leagues/${leagueId}`)
}

export async function getUserLeagues(userId: string): Promise<LeagueMembership[]> {
  return apiRequest(`/users/${userId}/leagues`)
}

export async function getLeagueMembers(leagueId: string): Promise<LeagueMembership[]> {
  return apiRequest(`/league-seasons/${leagueId}/members`)
}

export async function getScoreboard(leagueId: string): Promise<{
  players: Player[]
  currentGameWeek: number | null
}> {
  return apiRequest(`/league-seasons/${leagueId}/scoreboard`)
}

export async function getLeagueResults(leagueId: string): Promise<{
  users: Array<{
    id: string
    name: string
    picks: Array<{
      week: number
      teamName: string
      result: "win" | "loss" | "draw" | "dnp" | null
    }>
  }>
  completedWeeks: number[]
}> {
  return apiRequest(`/league-seasons/${leagueId}/results`)
}

export async function getProfile(userId: string, leagueId: string): Promise<User> {
  return apiRequest(`/users/${userId}?league_id=${leagueId}`)
}

export async function updateUserProfile(userId: string, updates: { name?: string }): Promise<User> {
  return apiRequest(`/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

export async function getLeagueMember(leagueId: string, memberId: string): Promise<LeagueMembership | null> {
  return apiRequest(`/league-seasons/${leagueId}/members/${memberId}`)
}

export async function updateMemberStatus(
  leagueId: string,
  memberId: string,
  updates: { isPaid?: boolean; isAdmin?: boolean; teamName?: string },
): Promise<LeagueMembership> {
  return apiRequest(`/league-seasons/${leagueId}/members/${memberId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

export async function removeMemberFromLeague(leagueId: string, memberId: string): Promise<void> {
  return apiRequest(`/league-seasons/${leagueId}/members/${memberId}`, {
    method: 'DELETE',
  })
}

// "Inner Circle" scoreboard filter -- self-scoped only (memberId must be the
// caller's own membership; enforced server-side).
export async function getInnerCircle(leagueId: string, memberId: string): Promise<InnerCircleMember[]> {
  return apiRequest(`/league-seasons/${leagueId}/members/${memberId}/inner-circle`)
}

export async function addToInnerCircle(
  leagueId: string,
  memberId: string,
  userId: string,
): Promise<InnerCircleMember[]> {
  return apiRequest(`/league-seasons/${leagueId}/members/${memberId}/inner-circle`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  })
}

export async function removeFromInnerCircle(
  leagueId: string,
  memberId: string,
  userId: string,
): Promise<InnerCircleMember[]> {
  return apiRequest(`/league-seasons/${leagueId}/members/${memberId}/inner-circle/${userId}`, {
    method: 'DELETE',
  })
}

// Admin-only "AI Teams" management -- server-side gated to isAI-flagged
// members only, even for admins (see app/routers/members.py's
// _require_ai_management_permission).
export async function getAIPrompt(leagueId: string, memberId: string): Promise<AIPromptData> {
  return apiRequest(`/league-seasons/${leagueId}/members/${memberId}/ai-prompt`)
}

export async function submitAIPick(
  leagueId: string,
  memberId: string,
  body: { gameId: number; teamId: number; week: number },
): Promise<Pick> {
  return apiRequest(`/league-seasons/${leagueId}/members/${memberId}/ai-pick`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateLeagueSettings(
  leagueId: string,
  updates: {
    name?: string
    description?: string
    logo?: string
    sportsLeague?: string
    isPublic?: boolean
    requiresApproval?: boolean
    hideScoreboard?: boolean
  },
): Promise<League> {
  return apiRequest(`/league-seasons/${leagueId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

export async function getUserPicks(userId: string, leagueId: string): Promise<Pick[]> {
  return apiRequest(`/picks?user_id=${userId}&league_season_id=${leagueId}`)
}

export async function getPicksRemaining(
  userId: string,
  leagueId: string,
): Promise<{ team: Team; remaining: number }[]> {
  return apiRequest(`/picks/remaining?user_id=${userId}&league_season_id=${leagueId}`)
}

export async function getUpcomingGames(week: number, leagueId: string): Promise<Game[]> {
  return apiRequest(`/games?week=${week}&league_season_id=${leagueId}`)
}

export async function getUpcomingGamesWithPicks(week: number, leagueId: string, userId: string): Promise<Game[]> {
  return apiRequest(`/games?week=${week}&league_season_id=${leagueId}&user_id=${userId}`)
}

export async function makePick(userId: string, gameId: number, teamId: number, leagueId: string, week?: number): Promise<Pick> {
  // If week is not provided, we need to find it by looking up the game
  let gameWeek = week

  if (!gameWeek) {
    // Find the game to get its week - this is expensive but necessary
    for (let w = 1; w <= 38; w++) {
      try {
        const weekGames = await apiRequest<Game[]>(`/games?week=${w}&league_season_id=${leagueId}`)
        const game = weekGames.find(g => g.id === gameId)
        if (game) {
          gameWeek = w
          break
        }
      } catch (error) {
        // Continue searching other weeks
      }
    }

    if (!gameWeek) {
      throw new Error('Could not find game to determine week')
    }
  }

  return apiRequest('/picks', {
    method: 'POST',
    body: JSON.stringify({
      userId,
      leagueSeasonId: leagueId,
      gameId,
      teamId,
      week: gameWeek,
    }),
  })
}

export async function getPlayerProfile(playerId: string, leagueId: string): Promise<PlayerProfile | null> {
  // CR-106: wired up for real. Was a permanently-throwing stub -- the Python
  // route (api/app/routers/results.py) didn't exist under the old TS backend,
  // so there was nothing to call. Any active league member may look up any
  // other member's profile; picks are NOT included (self-only, see
  // getUserPicks) per CR-105-FINDINGS.md Addendum 2's privacy boundary.
  return apiRequest(`/league-seasons/${leagueId}/players/${playerId}/profile`)
}

export async function getSeasonSummary(leagueId: string): Promise<SeasonSummary> {
  return apiRequest(`/league-seasons/${leagueId}/season-summary`)
}

// Invitation API functions
export async function createLeagueInvitation(
  leagueId: string,
  maxUses: number | null,
  expiresAt: string | null
): Promise<any> {
  return apiRequest(`/league-seasons/${leagueId}/invitations`, {
    method: 'POST',
    body: JSON.stringify({ maxUses, expiresAt }),
  })
}

export async function getLeagueInvitations(leagueId: string): Promise<any[]> {
  return apiRequest(`/league-seasons/${leagueId}/invitations`)
}

export async function getInvitationByToken(token: string): Promise<any> {
  return apiRequest(`/invite/${token}`)
}

export async function acceptInvitation(token: string, teamName: string): Promise<any> {
  return apiRequest(`/invite/${token}/accept`, {
    method: 'POST',
    body: JSON.stringify({ teamName }),
  })
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  return apiRequest(`/invitations/${invitationId}`, {
    method: 'DELETE',
  })
}

// Generate password reset link API function
export async function generatePasswordResetLink(
  userId: string, 
  leagueId: string
): Promise<{ resetLink: string; userEmail: string; expiresAt: string }> {
  return apiRequest(`/admin/users/${userId}/generate-reset-link`, {
    method: 'POST',
    body: JSON.stringify({ leagueSeasonId: leagueId }),
  })
}

