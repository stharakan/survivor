import type { User } from "@/types/user"
import type { Player } from "@/types/player"
import type { Pick } from "@/types/pick"
import type { Team } from "@/types/team"
import type { Game } from "@/types/game"
import type { League, LeagueMembership } from "@/types/league"
import type { JoinRequest } from "@/types/league"
import type { ApiResponse } from "@/lib/api-types"

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

export async function getLeague(leagueId: number): Promise<League> {
  return apiRequest(`/leagues/${leagueId}`)
}

export async function getUserLeagues(userId: string): Promise<LeagueMembership[]> {
  return apiRequest(`/users/${userId}/leagues`)
}

export async function getLeagueMembers(leagueId: number | string): Promise<LeagueMembership[]> {
  return apiRequest(`/leagues/${leagueId}/members`)
}

export async function getScoreboard(leagueId: number): Promise<{
  players: Player[]
  currentGameWeek: number | null
}> {
  return apiRequest(`/leagues/${leagueId}/scoreboard`)
}

export async function getProfile(userId: string, leagueId: number): Promise<User> {
  return apiRequest(`/users/${userId}?league_id=${leagueId}`)
}

export async function updateUserProfile(userId: string, updates: { name?: string }): Promise<User> {
  return apiRequest(`/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

// Placeholder functions for features not yet implemented in the API
// These maintain the same interface as the original API but throw "not implemented" errors

export async function requestToJoinLeague(
  leagueId: number,
  userId: string,
  teamName: string,
  message?: string,
): Promise<void> {
  throw new Error('requestToJoinLeague not implemented yet')
}

export async function getLeagueMember(leagueId: number | string, memberId: number | string): Promise<LeagueMembership | null> {
  return apiRequest(`/leagues/${leagueId}/members/${memberId}`)
}

export async function updateMemberStatus(
  leagueId: number,
  memberId: string,
  updates: { isPaid?: boolean; isAdmin?: boolean; teamName?: string },
): Promise<LeagueMembership> {
  return apiRequest(`/leagues/${leagueId}/members/${memberId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

export async function removeMemberFromLeague(leagueId: number | string, memberId: number | string): Promise<void> {
  return apiRequest(`/leagues/${leagueId}/members/${memberId}`, {
    method: 'DELETE',
  })
}

export async function getJoinRequests(leagueId: number): Promise<JoinRequest[]> {
  // TODO: Implement join requests API when needed
  // For now, return empty array to prevent console errors
  return []
}

export async function approveJoinRequest(requestId: number): Promise<void> {
  throw new Error('approveJoinRequest not implemented yet')
}

export async function rejectJoinRequest(requestId: number): Promise<void> {
  throw new Error('rejectJoinRequest not implemented yet')
}

export async function updateLeagueSettings(
  leagueId: number,
  updates: {
    name?: string
    description?: string
    logo?: string
    sportsLeague?: string
    isPublic?: boolean
    requiresApproval?: boolean
  },
): Promise<void> {
  throw new Error('updateLeagueSettings not implemented yet')
}

export async function getUserPicks(userId: string, leagueId: number): Promise<Pick[]> {
  return apiRequest(`/picks?user_id=${userId}&league_id=${leagueId}`)
}

export async function getPicksRemaining(
  userId: string,
  leagueId: number,
): Promise<{ team: Team; remaining: number }[]> {
  return apiRequest(`/picks/remaining?user_id=${userId}&league_id=${leagueId}`)
}

export async function getUpcomingGames(week: number, leagueId: number): Promise<Game[]> {
  return apiRequest(`/games?week=${week}&league_id=${leagueId}`)
}

export async function getUpcomingGamesWithPicks(week: number, leagueId: number, userId: string): Promise<Game[]> {
  return apiRequest(`/games?week=${week}&league_id=${leagueId}&user_id=${userId}`)
}

export async function makePick(userId: string, gameId: number, teamId: number, leagueId: number, week?: number): Promise<Pick> {
  // If week is not provided, we need to find it by looking up the game
  let gameWeek = week
  
  if (!gameWeek) {
    // Find the game to get its week - this is expensive but necessary
    for (let w = 1; w <= 38; w++) {
      try {
        const weekGames = await apiRequest<Game[]>(`/games?week=${w}&league_id=${leagueId}`)
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
      leagueId,
      gameId,
      teamId,
      week: gameWeek,
    }),
  })
}

export async function getPlayerProfile(playerId: number, leagueId: number): Promise<Player | null> {
  throw new Error('getPlayerProfile not implemented yet')
}

// Invitation API functions
export async function createLeagueInvitation(
  leagueId: number,
  maxUses: number | null,
  expiresAt: string | null
): Promise<any> {
  return apiRequest(`/leagues/${leagueId}/invitations`, {
    method: 'POST',
    body: JSON.stringify({ maxUses, expiresAt }),
  })
}

export async function getLeagueInvitations(leagueId: number): Promise<any[]> {
  return apiRequest(`/leagues/${leagueId}/invitations`)
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
    body: JSON.stringify({ leagueId }),
  })
}

