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

export async function getLeagueMembers(leagueId: number): Promise<LeagueMembership[]> {
  return apiRequest(`/leagues/${leagueId}/members`)
}

export async function getScoreboard(leagueId: number): Promise<Player[]> {
  return apiRequest(`/leagues/${leagueId}/scoreboard`)
}

export async function getProfile(userId: string, leagueId: number): Promise<User> {
  return apiRequest(`/users/${userId}?league_id=${leagueId}`)
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

export async function getLeagueMember(leagueId: number, memberId: number): Promise<LeagueMembership | null> {
  throw new Error('getLeagueMember not implemented yet')
}

export async function updateMemberStatus(
  leagueId: number,
  memberId: number,
  updates: { isPaid?: boolean; isAdmin?: boolean },
): Promise<void> {
  throw new Error('updateMemberStatus not implemented yet')
}

export async function removeMemberFromLeague(leagueId: number, memberId: number): Promise<void> {
  throw new Error('removeMemberFromLeague not implemented yet')
}

export async function getJoinRequests(leagueId: number): Promise<JoinRequest[]> {
  throw new Error('getJoinRequests not implemented yet')
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
  throw new Error('getUserPicks not implemented yet')
}

export async function getPicksRemaining(
  userId: string,
  leagueId: number,
): Promise<{ team: Team; remaining: number }[]> {
  throw new Error('getPicksRemaining not implemented yet')
}

export async function getUpcomingGames(week: number, leagueId: number): Promise<Game[]> {
  throw new Error('getUpcomingGames not implemented yet')
}

export async function makePick(userId: string, gameId: number, teamId: number, leagueId: number): Promise<Pick> {
  throw new Error('makePick not implemented yet')
}

export async function getPlayerProfile(playerId: number, leagueId: number): Promise<Player | null> {
  throw new Error('getPlayerProfile not implemented yet')
}