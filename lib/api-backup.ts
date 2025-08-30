// This file would normally contain actual API calls to your Django backend
// For demo purposes, we're using mock data

import type { User } from "@/types/user"
import type { Player } from "@/types/player"
import type { Pick } from "@/types/pick"
import type { Team } from "@/types/team"
import type { Game } from "@/types/game"
import type { League, LeagueMembership } from "@/types/league"
import type { JoinRequest } from "@/types/league"

// Mock leagues data - expanded to show more leagues
const mockLeagues: League[] = [
  {
    id: 1,
    name: "Tharakan Bros EPL League",
    description: "Premier League survivor league for the Tharakan family",
    sportsLeague: "EPL",
    season: "2024-25",
    isActive: true,
    memberCount: 10,
    isPublic: false,
    requiresApproval: true,
    createdBy: 1,
    createdAt: "2024-08-01T00:00:00Z",
  },
  {
    id: 2,
    name: "Friends NFL Survivor",
    description: "NFL survivor league with college friends",
    sportsLeague: "NFL",
    season: "2024",
    isActive: true,
    memberCount: 8,
    isPublic: true,
    requiresApproval: false,
    createdBy: 2,
    createdAt: "2024-09-01T00:00:00Z",
  },
  {
    id: 3,
    name: "Office NBA Challenge",
    description: "NBA survivor league with work colleagues",
    sportsLeague: "NBA",
    season: "2024-25",
    isActive: false,
    memberCount: 12,
    isPublic: true,
    requiresApproval: false,
    createdBy: 3,
    createdAt: "2024-07-15T00:00:00Z",
  },
  {
    id: 4,
    name: "Premier League Fanatics",
    description: "Open EPL survivor league for all fans",
    sportsLeague: "EPL",
    season: "2024-25",
    isActive: true,
    memberCount: 25,
    isPublic: true,
    requiresApproval: false,
    createdBy: 4,
    createdAt: "2024-08-10T00:00:00Z",
  },
  {
    id: 5,
    name: "Elite NFL Survivors",
    description: "High-stakes NFL survivor league",
    sportsLeague: "NFL",
    season: "2024",
    isActive: true,
    memberCount: 15,
    isPublic: false,
    requiresApproval: true,
    createdBy: 5,
    createdAt: "2024-08-20T00:00:00Z",
  },
  {
    id: 6,
    name: "MLS Soccer Survivors",
    description: "Major League Soccer survivor challenge",
    sportsLeague: "MLS",
    season: "2024",
    isActive: true,
    memberCount: 18,
    isPublic: true,
    requiresApproval: true,
    createdBy: 6,
    createdAt: "2024-09-05T00:00:00Z",
  },
]

// Mock league memberships - FIXED: Ensure user 1 is admin of league 1
const mockLeagueMemberships: LeagueMembership[] = [
  {
    id: 1,
    league: mockLeagues[0], // Tharakan Bros EPL League
    user: 1,
    teamName: "Tharakan Warriors",
    points: 6,
    strikes: 1,
    rank: 5,
    joinedAt: "2024-08-01T00:00:00Z",
    isActive: true,
    isAdmin: true, // EXPLICITLY SET TO TRUE
    isPaid: true,
    status: "active",
  },
  {
    id: 2,
    league: mockLeagues[1], // Friends NFL Survivor
    user: 1,
    teamName: "Demo Destroyers",
    points: 4,
    strikes: 2,
    rank: 3,
    joinedAt: "2024-09-01T00:00:00Z",
    isActive: true,
    isAdmin: false,
    isPaid: false,
    status: "active",
  },
  // Add a pending membership to show the pending state
  {
    id: 3,
    league: mockLeagues[4], // Elite NFL Survivors
    user: 1,
    teamName: "Pending Team",
    points: 0,
    strikes: 0,
    rank: 0,
    joinedAt: "2024-01-20T00:00:00Z",
    isActive: false,
    isAdmin: false,
    isPaid: false,
    status: "pending",
  },
]

// Mock EPL teams data
const mockTeams: Team[] = [
  {
    id: 1,
    name: "Arsenal",
    abbreviation: "ARS",
    logo: "https://resources.premierleague.com/premierleague/badges/t3.png",
  },
  {
    id: 2,
    name: "Aston Villa",
    abbreviation: "AVL",
    logo: "https://resources.premierleague.com/premierleague/badges/t7.png",
  },
  {
    id: 3,
    name: "Bournemouth",
    abbreviation: "BOU",
    logo: "https://resources.premierleague.com/premierleague/badges/t91.png",
  },
  {
    id: 4,
    name: "Brentford",
    abbreviation: "BRE",
    logo: "https://resources.premierleague.com/premierleague/badges/t94.png",
  },
  {
    id: 5,
    name: "Brighton",
    abbreviation: "BHA",
    logo: "https://resources.premierleague.com/premierleague/badges/t36.png",
  },
  {
    id: 6,
    name: "Chelsea",
    abbreviation: "CHE",
    logo: "https://resources.premierleague.com/premierleague/badges/t8.png",
  },
  {
    id: 7,
    name: "Crystal Palace",
    abbreviation: "CRY",
    logo: "https://resources.premierleague.com/premierleague/badges/t31.png",
  },
  {
    id: 8,
    name: "Everton",
    abbreviation: "EVE",
    logo: "https://resources.premierleague.com/premierleague/badges/t11.png",
  },
  {
    id: 9,
    name: "Fulham",
    abbreviation: "FUL",
    logo: "https://resources.premierleague.com/premierleague/badges/t54.png",
  },
  {
    id: 10,
    name: "Liverpool",
    abbreviation: "LIV",
    logo: "https://resources.premierleague.com/premierleague/badges/t14.png",
  },
  {
    id: 11,
    name: "Manchester City",
    abbreviation: "MCI",
    logo: "https://resources.premierleague.com/premierleague/badges/t43.png",
  },
  {
    id: 12,
    name: "Manchester United",
    abbreviation: "MUN",
    logo: "https://resources.premierleague.com/premierleague/badges/t1.png",
  },
  {
    id: 13,
    name: "Newcastle",
    abbreviation: "NEW",
    logo: "https://resources.premierleague.com/premierleague/badges/t4.png",
  },
  {
    id: 14,
    name: "Nottingham Forest",
    abbreviation: "NFO",
    logo: "https://resources.premierleague.com/premierleague/badges/t17.png",
  },
  {
    id: 15,
    name: "Southampton",
    abbreviation: "SOU",
    logo: "https://resources.premierleague.com/premierleague/badges/t20.png",
  },
  {
    id: 16,
    name: "Tottenham",
    abbreviation: "TOT",
    logo: "https://resources.premierleague.com/premierleague/badges/t6.png",
  },
  {
    id: 17,
    name: "West Ham",
    abbreviation: "WHU",
    logo: "https://resources.premierleague.com/premierleague/badges/t21.png",
  },
  {
    id: 18,
    name: "Wolves",
    abbreviation: "WOL",
    logo: "https://resources.premierleague.com/premierleague/badges/t39.png",
  },
  {
    id: 19,
    name: "Leicester City",
    abbreviation: "LEI",
    logo: "https://resources.premierleague.com/premierleague/badges/t13.png",
  },
  {
    id: 20,
    name: "Ipswich Town",
    abbreviation: "IPS",
    logo: "https://resources.premierleague.com/premierleague/badges/t133.png",
  },
]

// Mock players data (league-specific)
const mockPlayers: Player[] = [
  { id: 1, name: "Arun Tharakan", points: 8, strikes: 0, rank: 1 },
  { id: 2, name: "Anoop Tharakan", points: 8, strikes: 0, rank: 2 },
  { id: 3, name: "Vinod Kurup", points: 7, strikes: 0, rank: 3 },
  { id: 4, name: "Sanjay Nair", points: 7, strikes: 0, rank: 4 },
  { id: 5, name: "Ravi Krishnan", points: 6, strikes: 1, rank: 5 },
  { id: 6, name: "Sunil Mathew", points: 6, strikes: 1, rank: 6 },
  { id: 7, name: "Ajay Menon", points: 5, strikes: 1, rank: 7 },
  { id: 8, name: "Priya Thomas", points: 5, strikes: 1, rank: 8 },
  { id: 9, name: "Maya Pillai", points: 4, strikes: 2, rank: 9 },
  { id: 10, name: "Deepa Nair", points: 3, strikes: 3, rank: 10 },
]

// Mock picks data - one pick per week for survivor league (league-specific)
const mockPicks: Pick[] = [
  { id: 1, user: 1, game: null as any, team: mockTeams[0], result: "win", week: 1 },
  { id: 2, user: 1, game: null as any, team: mockTeams[10], result: "win", week: 2 },
  { id: 3, user: 1, game: null as any, team: mockTeams[11], result: "win", week: 3 },
  { id: 4, user: 1, game: null as any, team: mockTeams[9], result: "win", week: 4 },
  { id: 5, user: 1, game: null as any, team: mockTeams[5], result: "win", week: 5 },
  { id: 6, user: 1, game: null as any, team: mockTeams[2], result: "win", week: 6 },
  { id: 7, user: 1, game: null as any, team: mockTeams[16], result: "draw", week: 7 },
]

// Function to generate future dates
const generateFutureDate = (weekOffset: number) => {
  // Use current date as base for future games to ensure they're in the future
  const now = new Date()
  const futureDate = new Date(now)
  futureDate.setDate(now.getDate() + weekOffset * 7)
  return futureDate.toISOString()
}

// Generate game pairs for future weeks
const generateFutureGames = () => {
  const futureGames: Game[] = []
  let gameId = 19 // Start after the last defined game ID

  // Generate games for weeks 10-38
  for (let week = 10; week <= 38; week++) {
    // Create 2 games per week
    for (let i = 0; i < 2; i++) {
      // Randomly select teams that haven't been picked yet
      const usedTeamIds = mockPicks.map((pick) => pick.team.id)
      const availableTeams = mockTeams.filter((team) => !usedTeamIds.includes(team.id))

      // Randomly select home and away teams
      const randomTeams = [...mockTeams].sort(() => 0.5 - Math.random()).slice(0, 2)

      futureGames.push({
        id: gameId++,
        week,
        homeTeam: randomTeams[0],
        awayTeam: randomTeams[1],
        homeScore: null,
        awayScore: null,
        status: "scheduled",
        date: generateFutureDate(week - 8), // Relative to current week
      })

      // Second game with different teams
      const otherTeams = mockTeams
        .filter((t) => t.id !== randomTeams[0].id && t.id !== randomTeams[1].id)
        .sort(() => 0.5 - Math.random())
        .slice(0, 2)

      futureGames.push({
        id: gameId++,
        week,
        homeTeam: otherTeams[0],
        awayTeam: otherTeams[1],
        homeScore: null,
        awayScore: null,
        status: "scheduled",
        date: generateFutureDate(week - 8), // Relative to current week
      })
    }
  }

  return futureGames
}

// Get current date for future games
const currentDate = new Date()
const tomorrow = new Date(currentDate)
tomorrow.setDate(currentDate.getDate() + 1)
const nextWeek = new Date(currentDate)
nextWeek.setDate(currentDate.getDate() + 7)

// Mock games data with more games per week (league-specific)
const mockGames: Game[] = [
  // Week 1 games (completed)
  {
    id: 1,
    week: 1,
    homeTeam: mockTeams[0],
    awayTeam: mockTeams[5],
    homeScore: 2,
    awayScore: 0,
    status: "completed",
    date: "2023-08-12T15:00:00Z",
    userPick: { id: 1, user: 1, team: mockTeams[0], result: "win", week: 1 },
  },
  {
    id: 2,
    week: 1,
    homeTeam: mockTeams[9],
    awayTeam: mockTeams[11],
    homeScore: 3,
    awayScore: 1,
    status: "completed",
    date: "2023-08-12T17:30:00Z",
  },

  // Week 2 games (completed)
  {
    id: 3,
    week: 2,
    homeTeam: mockTeams[10],
    awayTeam: mockTeams[15],
    homeScore: 4,
    awayScore: 1,
    status: "completed",
    date: "2023-08-19T15:00:00Z",
    userPick: { id: 2, user: 1, team: mockTeams[10], result: "win", week: 2 },
  },
  {
    id: 4,
    week: 2,
    homeTeam: mockTeams[6],
    awayTeam: mockTeams[8],
    homeScore: 1,
    awayScore: 1,
    status: "completed",
    date: "2023-08-19T17:30:00Z",
  },

  // Week 3 games (completed)
  {
    id: 5,
    week: 3,
    homeTeam: mockTeams[11],
    awayTeam: mockTeams[7],
    homeScore: 2,
    awayScore: 0,
    status: "completed",
    date: "2023-08-26T15:00:00Z",
    userPick: { id: 3, user: 1, team: mockTeams[11], result: "win", week: 3 },
  },
  {
    id: 6,
    week: 3,
    homeTeam: mockTeams[13],
    awayTeam: mockTeams[12],
    homeScore: 1,
    awayScore: 3,
    status: "completed",
    date: "2023-08-26T17:30:00Z",
  },

  // Week 4 games (completed)
  {
    id: 7,
    week: 4,
    homeTeam: mockTeams[9],
    awayTeam: mockTeams[12],
    homeScore: 2,
    awayScore: 1,
    status: "completed",
    date: "2023-09-02T15:00:00Z",
    userPick: { id: 4, user: 1, team: mockTeams[9], result: "win", week: 4 },
  },
  {
    id: 8,
    week: 4,
    homeTeam: mockTeams[0],
    awayTeam: mockTeams[4],
    homeScore: 3,
    awayScore: 1,
    status: "completed",
    date: "2023-09-02T17:30:00Z",
  },

  // Week 5 games (completed)
  {
    id: 9,
    week: 5,
    homeTeam: mockTeams[5],
    awayTeam: mockTeams[14],
    homeScore: 3,
    awayScore: 0,
    status: "completed",
    date: "2023-09-09T15:00:00Z",
    userPick: { id: 5, user: 1, team: mockTeams[5], result: "win", week: 5 },
  },
  {
    id: 10,
    week: 5,
    homeTeam: mockTeams[15],
    awayTeam: mockTeams[9],
    homeScore: 1,
    awayScore: 2,
    status: "completed",
    date: "2023-09-09T17:30:00Z",
  },

  // Week 6 games (completed)
  {
    id: 11,
    week: 6,
    homeTeam: mockTeams[2],
    awayTeam: mockTeams[1],
    homeScore: 3,
    awayScore: 0,
    status: "completed",
    date: "2023-09-16T15:00:00Z",
    userPick: { id: 6, user: 1, team: mockTeams[2], result: "win", week: 6 },
  },
  {
    id: 12,
    week: 6,
    homeTeam: mockTeams[5],
    awayTeam: mockTeams[1],
    homeScore: 3,
    awayScore: 0,
    status: "completed",
    date: "2023-09-16T17:30:00Z",
  },

  // Week 7 games (completed)
  {
    id: 13,
    week: 7,
    homeTeam: mockTeams[16],
    awayTeam: mockTeams[0],
    homeScore: 2,
    awayScore: 2,
    status: "completed",
    date: "2023-09-23T15:00:00Z",
    userPick: { id: 7, user: 1, team: mockTeams[16], result: "draw", week: 7 },
  },
  {
    id: 14,
    week: 7,
    homeTeam: mockTeams[10],
    awayTeam: mockTeams[3],
    homeScore: 4,
    awayScore: 0,
    status: "completed",
    date: "2023-09-23T17:30:00Z",
  },

  // Week 8 games (upcoming - CURRENT WEEK)
  {
    id: 15,
    week: 8,
    homeTeam: mockTeams[9], // Liverpool
    awayTeam: mockTeams[7], // Everton
    homeScore: null,
    awayScore: null,
    status: "scheduled",
    date: tomorrow.toISOString(), // Tomorrow
  },
  {
    id: 16,
    week: 8,
    homeTeam: mockTeams[11], // Man United
    awayTeam: mockTeams[5], // Chelsea
    homeScore: null,
    awayScore: null,
    status: "scheduled",
    date: tomorrow.toISOString(), // Tomorrow
  },
  {
    id: 17,
    week: 8,
    homeTeam: mockTeams[3], // Brentford
    awayTeam: mockTeams[4], // Brighton
    homeScore: null,
    awayScore: null,
    status: "scheduled",
    date: tomorrow.toISOString(), // Tomorrow
  },
  {
    id: 18,
    week: 8,
    homeTeam: mockTeams[13], // Newcastle
    awayTeam: mockTeams[14], // Nottingham Forest
    homeScore: null,
    awayScore: null,
    status: "scheduled",
    date: tomorrow.toISOString(), // Tomorrow
  },

  // Week 9 games (upcoming)
  {
    id: 19,
    week: 9,
    homeTeam: mockTeams[0], // Arsenal
    awayTeam: mockTeams[11], // Man United
    homeScore: null,
    awayScore: null,
    status: "scheduled",
    date: nextWeek.toISOString(), // Next week
  },
  {
    id: 20,
    week: 9,
    homeTeam: mockTeams[10], // Man City
    awayTeam: mockTeams[9], // Liverpool
    homeScore: null,
    awayScore: null,
    status: "scheduled",
    date: nextWeek.toISOString(), // Next week
  },

  // Add future games
  ...generateFutureGames(),
]

// Initialize game references in picks
mockPicks.forEach((pick) => {
  const gameForWeek = mockGames.find((game) => game.week === pick.week && game.userPick?.id === pick.id)
  if (gameForWeek) {
    pick.game = gameForWeek
  }
})

// Calculate picks remaining based on used teams (league-specific)
const mockPicksRemaining: { team: Team; remaining: number }[] = mockTeams.map((team) => {
  // Check if team has been picked already
  const isPicked = mockPicks.some((pick) => pick.team.id === team.id)
  return {
    team,
    // In survivor league, you can only pick a team once
    remaining: isPicked ? 0 : 1,
  }
})

// New API function to get all leagues
export async function getAllLeagues(): Promise<League[]> {
  // In a real app, this would be an API call to your Django backend
  return mockLeagues
}

export async function requestToJoinLeague(
  leagueId: number,
  userId: number,
  teamName: string,
  message?: string,
): Promise<void> {
  // In a real app, this would be an API call to your Django backend
  console.log(`User ${userId} requested to join league ${leagueId} with team name "${teamName}"`)

  // For demo purposes, we'll just log the request
  // In a real app, this would create a join request record
}

// Admin API functions
export async function getLeagueMembers(leagueId: number): Promise<LeagueMembership[]> {
  // In a real app, this would be an API call to your Django backend
  return mockLeagueMemberships.filter((membership) => membership.league.id === leagueId)
}

export async function getLeagueMember(leagueId: number, memberId: number): Promise<LeagueMembership | null> {
  // In a real app, this would be an API call to your Django backend
  const member = mockLeagueMemberships.find((m) => m.id === memberId && m.league.id === leagueId)
  return member || null
}

export async function updateMemberStatus(
  leagueId: number,
  memberId: number,
  updates: { isPaid?: boolean; isAdmin?: boolean },
): Promise<void> {
  // In a real app, this would be an API call to your Django backend
  const memberIndex = mockLeagueMemberships.findIndex((m) => m.id === memberId && m.league.id === leagueId)
  if (memberIndex !== -1) {
    mockLeagueMemberships[memberIndex] = { ...mockLeagueMemberships[memberIndex], ...updates }
  }
}

export async function removeMemberFromLeague(leagueId: number, memberId: number): Promise<void> {
  // In a real app, this would be an API call to your Django backend
  const memberIndex = mockLeagueMemberships.findIndex((m) => m.id === memberId && m.league.id === leagueId)
  if (memberIndex !== -1) {
    mockLeagueMemberships.splice(memberIndex, 1)
  }
}

export async function getJoinRequests(leagueId: number): Promise<JoinRequest[]> {
  // In a real app, this would be an API call to your Django backend
  // Mock join requests data
  const mockJoinRequests: JoinRequest[] = [
    {
      id: 1,
      league: mockLeagues[0],
      user: {
        id: 5,
        username: "new_player",
        email: "new@example.com",
      },
      teamName: "New Team",
      message: "I'd love to join this league!",
      status: "pending",
      requestedAt: "2024-01-15T10:00:00Z",
    },
    {
      id: 2,
      league: mockLeagues[0],
      user: {
        id: 6,
        username: "another_player",
        email: "another@example.com",
      },
      teamName: "Another Team",
      status: "pending",
      requestedAt: "2024-01-16T14:30:00Z",
    },
  ]

  return mockJoinRequests.filter((request) => request.league.id === leagueId)
}

export async function approveJoinRequest(requestId: number): Promise<void> {
  // In a real app, this would be an API call to your Django backend
  console.log(`Approved join request ${requestId}`)
}

export async function rejectJoinRequest(requestId: number): Promise<void> {
  // In a real app, this would be an API call to your Django backend
  console.log(`Rejected join request ${requestId}`)
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
  // In a real app, this would be an API call to your Django backend
  const leagueIndex = mockLeagues.findIndex((league) => league.id === leagueId)
  if (leagueIndex !== -1) {
    mockLeagues[leagueIndex] = { ...mockLeagues[leagueIndex], ...updates }
  }
}

// League API functions
export async function getUserLeagues(userId: number): Promise<LeagueMembership[]> {
  // In a real app, this would be an API call to your Django backend
  return mockLeagueMemberships.filter((membership) => membership.user === userId)
}

export async function getLeague(leagueId: number): Promise<League | null> {
  // In a real app, this would be an API call to your Django backend
  return mockLeagues.find((league) => league.id === leagueId) || null
}

// Updated API functions with league context
export async function getProfile(userId: number, leagueId: number): Promise<User> {
  // In a real app, this would be an API call to your Django backend
  return {
    id: userId,
    username: "demo_user",
    email: "demo@example.com",
  }
}

export async function getScoreboard(leagueId: number): Promise<Player[]> {
  // In a real app, this would be an API call to your Django backend
  return mockPlayers
}

export async function getUserPicks(userId: number, leagueId: number): Promise<Pick[]> {
  // In a real app, this would be an API call to your Django backend
  return mockPicks
}

export async function getPicksRemaining(
  userId: number,
  leagueId: number,
): Promise<{ team: Team; remaining: number }[]> {
  // In a real app, this would be an API call to your Django backend

  // Make sure we're returning the full array of teams with their availability
  return mockTeams.map((team) => {
    // Check if team has been picked already by this user in this league
    const isPicked = mockPicks.some((pick) => pick.team.id === team.id && pick.user === userId)
    return {
      team,
      // In survivor league, you can only pick a team once
      remaining: isPicked ? 0 : 1,
    }
  })
}

export async function getUpcomingGames(week: number, leagueId: number): Promise<Game[]> {
  // In a real app, this would be an API call to your Django backend
  return mockGames.filter((game) => game.week === week)
}

export async function makePick(userId: number, gameId: number, teamId: number, leagueId: number): Promise<Pick> {
  // In a real app, this would be an API call to your Django backend
  const game = mockGames.find((g) => g.id === gameId)
  const team = mockTeams.find((t) => t.id === teamId)

  if (!game || !team) {
    throw new Error("Invalid game or team")
  }

  // Create a new pick
  const newPick: Pick = {
    id: Math.floor(Math.random() * 1000),
    user: userId,
    game,
    team,
    result: null,
    week: game.week,
  }

  // Update the game with the user's pick
  game.userPick = {
    id: newPick.id,
    user: userId,
    team,
    result: null,
    week: game.week,
  }

  // Update the picks remaining
  const teamIndex = mockPicksRemaining.findIndex((p) => p.team.id === teamId)
  if (teamIndex !== -1) {
    mockPicksRemaining[teamIndex].remaining = 0
  }

  return newPick
}

// Function to get a player's profile by ID (league-specific)
export async function getPlayerProfile(playerId: string, leagueId: string): Promise<Player | null> {
  const player = mockPlayers.find((p) => p.id === playerId)
  return player || null
}
