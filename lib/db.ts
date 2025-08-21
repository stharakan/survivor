import { ObjectId } from 'mongodb'
import { getDatabase, Collections } from './mongodb'
import type { User } from '@/types/user'
import type { League, LeagueMembership, JoinRequest } from '@/types/league'
import type { Team } from '@/types/team'
import type { Game, GameStatus } from '@/types/game'
import type { Pick } from '@/types/pick'
import type { Player } from '@/types/player'
import type { LeagueInvitation, InvitationWithLeague, InvitationAcceptanceInfo } from '@/types/invitation'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

// User operations
export async function createUser(email: string, password: string): Promise<User> {
  const db = await getDatabase()
  const hashedPassword = await bcrypt.hash(password, 12)
  
  const result = await db.collection(Collections.USERS).insertOne({
    email,
    password: hashedPassword,
    createdAt: new Date(),
  })
  
  return {
    id: result.insertedId.toString(),
    email,
  } as User
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const db = await getDatabase()
  const user = await db.collection(Collections.USERS).findOne({ email })
  
  if (!user) return null
  
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
  } as User
}

export async function getUserById(id: string): Promise<User | null> {
  const db = await getDatabase()
  const user = await db.collection(Collections.USERS).findOne({ _id: new ObjectId(id) })
  
  if (!user) return null
  
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
  } as User
}

export async function verifyPassword(email: string, password: string): Promise<User | null> {
  const db = await getDatabase()
  const user = await db.collection(Collections.USERS).findOne({ email })
  
  if (!user) return null
  
  const isValid = await bcrypt.compare(password, user.password)
  if (!isValid) return null
  
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
  } as User
}

export async function updateUser(id: string, updates: Partial<Pick<User, 'name'>>): Promise<User | null> {
  const db = await getDatabase()
  
  const updateData: any = {}
  if (updates.name !== undefined) {
    updateData.name = updates.name?.trim() || null
  }
  
  const result = await db.collection(Collections.USERS).findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: updateData },
    { returnDocument: 'after' }
  )
  
  if (!result) return null
  
  return {
    id: result._id.toString(),
    email: result.email,
    name: result.name,
  } as User
}

// League operations
export async function createLeague(
  name: string,
  description: string,
  sportsLeague: string,
  season: string,
  isPublic: boolean,
  requiresApproval: boolean,
  createdBy: string
): Promise<League> {
  const db = await getDatabase()
  
  const result = await db.collection(Collections.LEAGUES).insertOne({
    name,
    description,
    sportsLeague,
    season,
    isPublic,
    requiresApproval,
    createdBy: new ObjectId(createdBy),
    isActive: true,
    memberCount: 0,
    createdAt: new Date(),
  })
  
  return {
    id: result.insertedId.toString(),
    name,
    description,
    sportsLeague,
    season,
    isPublic,
    requiresApproval,
    createdBy: createdBy,
    isActive: true,
    memberCount: 0,
    createdAt: new Date().toISOString(),
    current_game_week: null,
    current_pick_week: null,
    last_completed_week: null,
  } as League
}

export async function getLeagueById(id: string): Promise<League | null> {
  const db = await getDatabase()
  const league = await db.collection(Collections.LEAGUES).findOne({ _id: new ObjectId(id) })
  
  if (!league) return null
  
  return {
    id: league._id.toString(),
    name: league.name,
    description: league.description,
    sportsLeague: league.sportsLeague,
    season: league.season,
    isPublic: league.isPublic,
    requiresApproval: league.requiresApproval,
    createdBy: league.createdBy.toString(),
    isActive: league.isActive,
    memberCount: league.memberCount,
    createdAt: league.createdAt.toISOString(),
    current_game_week: league.current_game_week || null,
    current_pick_week: league.current_pick_week || null,
    last_completed_week: league.last_completed_week || null,
  } as League
}

export async function getAllLeagues(): Promise<League[]> {
  const db = await getDatabase()
  const leagues = await db.collection(Collections.LEAGUES).find({ isActive: true }).toArray()
  
  return leagues.map(league => ({
    id: league._id.toString(),
    name: league.name,
    description: league.description,
    sportsLeague: league.sportsLeague,
    season: league.season,
    isPublic: league.isPublic,
    requiresApproval: league.requiresApproval,
    createdBy: league.createdBy.toString(),
    isActive: league.isActive,
    memberCount: league.memberCount,
    createdAt: league.createdAt.toISOString(),
  })) as League[]
}

export async function getAvailableLeagues(userId: string): Promise<League[]> {
  const db = await getDatabase()
  
  // Get user's league memberships to find private leagues they can access
  const memberships = await db.collection(Collections.LEAGUE_MEMBERSHIPS)
    .find({ userId: new ObjectId(userId) }).toArray()
  
  const memberLeagueIds = memberships.map(m => m.leagueId)
  
  // Get leagues that are either public OR user is a member of
  const leagues = await db.collection(Collections.LEAGUES).aggregate([
    {
      $match: {
        isActive: true,
        $or: [
          { isPublic: true },
          { _id: { $in: memberLeagueIds } }
        ]
      }
    },
    {
      $lookup: {
        from: Collections.LEAGUE_MEMBERSHIPS,
        localField: '_id',
        foreignField: 'leagueId',
        as: 'memberships'
      }
    },
    {
      $addFields: {
        memberCount: { $size: '$memberships' }
      }
    }
  ]).toArray()
  
  return leagues.map(league => ({
    id: league._id.toString(),
    name: league.name,
    description: league.description,
    sportsLeague: league.sportsLeague,
    season: league.season,
    isPublic: league.isPublic,
    requiresApproval: league.requiresApproval,
    createdBy: league.createdBy.toString(),
    isActive: league.isActive,
    memberCount: league.memberCount,
    createdAt: league.createdAt.toISOString(),
    current_game_week: league.current_game_week || null,
    current_pick_week: league.current_pick_week || null,
    last_completed_week: league.last_completed_week || null,
  })) as League[]
}

// League membership operations
export async function createLeagueMembership(
  leagueId: string,
  userId: string,
  teamName: string,
  isAdmin: boolean = false
): Promise<LeagueMembership> {
  const db = await getDatabase()
  
  const result = await db.collection(Collections.LEAGUE_MEMBERSHIPS).insertOne({
    leagueId: new ObjectId(leagueId),
    userId: new ObjectId(userId),
    teamName,
    points: 0,
    strikes: 0,
    rank: 0,
    isActive: true,
    isAdmin,
    isPaid: false,
    status: 'active',
    joinedAt: new Date(),
  })
  
  // Update league member count
  await db.collection(Collections.LEAGUES).updateOne(
    { _id: new ObjectId(leagueId) },
    { $inc: { memberCount: 1 } }
  )
  
  const league = await getLeagueById(leagueId)
  
  return {
    id: result.insertedId.toString(),
    league: league!,
    user: userId,
    teamName,
    points: 0,
    strikes: 0,
    rank: 0,
    isActive: true,
    isAdmin,
    isPaid: false,
    status: 'active',
    joinedAt: new Date().toISOString(),
  } as LeagueMembership
}

export async function getUserLeagueMemberships(userId: string): Promise<LeagueMembership[]> {
  const db = await getDatabase()
  
  const memberships = await db.collection(Collections.LEAGUE_MEMBERSHIPS)
    .aggregate([
      { $match: { userId: new ObjectId(userId) } },
      {
        $lookup: {
          from: Collections.LEAGUES,
          localField: 'leagueId',
          foreignField: '_id',
          as: 'league'
        }
      },
      { $unwind: '$league' }
    ]).toArray()
  
  return memberships.map(membership => ({
    id: membership._id.toString(),
    league: {
      id: membership.league._id.toString(),
      name: membership.league.name,
      description: membership.league.description,
      sportsLeague: membership.league.sportsLeague,
      season: membership.league.season,
      isPublic: membership.league.isPublic,
      requiresApproval: membership.league.requiresApproval,
      createdBy: membership.league.createdBy.toString(),
      isActive: membership.league.isActive,
      memberCount: membership.league.memberCount,
      createdAt: membership.league.createdAt.toISOString(),
      current_game_week: membership.league.current_game_week || null,
      current_pick_week: membership.league.current_pick_week || null,
      last_completed_week: membership.league.last_completed_week || null,
    },
    user: membership.userId.toString(),
    teamName: membership.teamName,
    points: membership.points,
    strikes: membership.strikes,
    rank: membership.rank,
    isActive: membership.isActive,
    isAdmin: membership.isAdmin,
    isPaid: membership.isPaid,
    status: membership.status,
    joinedAt: membership.joinedAt.toISOString(),
  })) as LeagueMembership[]
}

export async function getLeagueMembers(leagueId: string): Promise<LeagueMembership[]> {
  const db = await getDatabase()
  
  const memberships = await db.collection(Collections.LEAGUE_MEMBERSHIPS)
    .aggregate([
      { $match: { leagueId: new ObjectId(leagueId) } },
      {
        $lookup: {
          from: Collections.LEAGUES,
          localField: 'leagueId',
          foreignField: '_id',
          as: 'league'
        }
      },
      { $unwind: '$league' }
    ]).toArray()
  
  return memberships.map(membership => ({
    id: membership._id.toString(),
    league: {
      id: membership.league._id.toString(),
      name: membership.league.name,
      description: membership.league.description,
      sportsLeague: membership.league.sportsLeague,
      season: membership.league.season,
      isPublic: membership.league.isPublic,
      requiresApproval: membership.league.requiresApproval,
      createdBy: membership.league.createdBy.toString(),
      isActive: membership.league.isActive,
      memberCount: membership.league.memberCount,
      createdAt: membership.league.createdAt.toISOString(),
      current_game_week: membership.league.current_game_week || null,
      current_pick_week: membership.league.current_pick_week || null,
      last_completed_week: membership.league.last_completed_week || null,
    },
    user: membership.userId.toString(),
    teamName: membership.teamName,
    points: membership.points,
    strikes: membership.strikes,
    rank: membership.rank,
    isActive: membership.isActive,
    isAdmin: membership.isAdmin,
    isPaid: membership.isPaid,
    status: membership.status,
    joinedAt: membership.joinedAt.toISOString(),
  })) as LeagueMembership[]
}

export async function getLeagueMembersWithUserData(leagueId: string): Promise<Array<LeagueMembership & { userDetails: User }>> {
  const db = await getDatabase()
  
  const memberships = await db.collection(Collections.LEAGUE_MEMBERSHIPS)
    .aggregate([
      { $match: { leagueId: new ObjectId(leagueId) } },
      {
        $lookup: {
          from: Collections.LEAGUES,
          localField: 'leagueId',
          foreignField: '_id',
          as: 'league'
        }
      },
      {
        $lookup: {
          from: Collections.USERS,
          localField: 'userId',
          foreignField: '_id',
          as: 'userDetails'
        }
      },
      { $unwind: '$league' },
      { $unwind: '$userDetails' }
    ]).toArray()
  
  return memberships.map(membership => ({
    id: membership._id.toString(),
    league: {
      id: membership.league._id.toString(),
      name: membership.league.name,
      description: membership.league.description,
      sportsLeague: membership.league.sportsLeague,
      season: membership.league.season,
      isPublic: membership.league.isPublic,
      requiresApproval: membership.league.requiresApproval,
      createdBy: membership.league.createdBy.toString(),
      isActive: membership.league.isActive,
      memberCount: membership.league.memberCount,
      createdAt: membership.league.createdAt.toISOString(),
    },
    user: membership.userId.toString(),
    teamName: membership.teamName,
    points: membership.points,
    strikes: membership.strikes,
    rank: membership.rank,
    isActive: membership.isActive,
    isAdmin: membership.isAdmin,
    isPaid: membership.isPaid,
    status: membership.status,
    joinedAt: membership.joinedAt.toISOString(),
    userDetails: {
      id: membership.userDetails._id.toString(),
      email: membership.userDetails.email,
      name: membership.userDetails.name,
    }
  }))
}

export async function getLeagueMember(leagueId: string, memberId: string): Promise<LeagueMembership | null> {
  const db = await getDatabase()
  
  const memberships = await db.collection(Collections.LEAGUE_MEMBERSHIPS)
    .aggregate([
      { 
        $match: { 
          _id: new ObjectId(memberId),
          leagueId: new ObjectId(leagueId)
        } 
      },
      {
        $lookup: {
          from: Collections.LEAGUES,
          localField: 'leagueId',
          foreignField: '_id',
          as: 'league'
        }
      },
      { $unwind: '$league' }
    ]).toArray()
  
  if (memberships.length === 0) {
    return null
  }
  
  const membership = memberships[0]
  return {
    id: membership._id.toString(),
    league: {
      id: membership.league._id.toString(),
      name: membership.league.name,
      description: membership.league.description,
      sportsLeague: membership.league.sportsLeague,
      season: membership.league.season,
      isPublic: membership.league.isPublic,
      requiresApproval: membership.league.requiresApproval,
      createdBy: membership.league.createdBy.toString(),
      isActive: membership.league.isActive,
      memberCount: membership.league.memberCount,
      createdAt: membership.league.createdAt.toISOString(),
      current_game_week: membership.league.current_game_week || null,
      current_pick_week: membership.league.current_pick_week || null,
      last_completed_week: membership.league.last_completed_week || null,
    },
    user: membership.userId.toString(),
    teamName: membership.teamName,
    points: membership.points,
    strikes: membership.strikes,
    rank: membership.rank,
    isActive: membership.isActive,
    isAdmin: membership.isAdmin,
    isPaid: membership.isPaid,
    status: membership.status,
    joinedAt: membership.joinedAt.toISOString(),
  } as LeagueMembership
}

export async function updateMemberStatus(
  leagueId: string,
  memberId: string,
  updates: { isPaid?: boolean; isAdmin?: boolean; teamName?: string }
): Promise<void> {
  const db = await getDatabase()
  
  const updateDoc: any = {}
  if (typeof updates.isPaid === 'boolean') {
    updateDoc.isPaid = updates.isPaid
  }
  if (typeof updates.isAdmin === 'boolean') {
    updateDoc.isAdmin = updates.isAdmin
  }
  if (typeof updates.teamName === 'string') {
    const trimmedTeamName = updates.teamName.trim()
    if (!trimmedTeamName) {
      throw new Error('Team name cannot be empty')
    }
    
    // Check if team name is already taken in this league by another member
    const existingMember = await db.collection(Collections.LEAGUE_MEMBERSHIPS).findOne({
      leagueId: new ObjectId(leagueId),
      teamName: trimmedTeamName,
      _id: { $ne: new ObjectId(memberId) }
    })
    
    if (existingMember) {
      throw new Error('Team name is already taken in this league')
    }
    
    updateDoc.teamName = trimmedTeamName
  }
  
  await db.collection(Collections.LEAGUE_MEMBERSHIPS).updateOne(
    {
      _id: new ObjectId(memberId),
      leagueId: new ObjectId(leagueId)
    },
    { $set: updateDoc }
  )
}

export async function removeMemberFromLeague(
  leagueId: string,
  memberId: string,
  removedBy: string
): Promise<void> {
  const db = await getDatabase()
  
  // Get the member to verify they exist and get current status
  const existingMember = await db.collection(Collections.LEAGUE_MEMBERSHIPS).findOne({
    _id: new ObjectId(memberId),
    leagueId: new ObjectId(leagueId)
  })
  
  if (!existingMember) {
    throw new Error('Member not found')
  }
  
  if (!existingMember.isActive) {
    throw new Error('Member is already inactive')
  }
  
  // Soft delete the member by marking as inactive
  await db.collection(Collections.LEAGUE_MEMBERSHIPS).updateOne(
    {
      _id: new ObjectId(memberId),
      leagueId: new ObjectId(leagueId)
    },
    {
      $set: {
        isActive: false,
        status: 'removed',
        removedAt: new Date(),
        removedBy: new ObjectId(removedBy)
      }
    }
  )
  
  // Update league member count (only count active members)
  await db.collection(Collections.LEAGUES).updateOne(
    { _id: new ObjectId(leagueId) },
    { $inc: { memberCount: -1 } }
  )
}

// Game operations
export async function createGame(
  week: number,
  homeTeamId: number,
  awayTeamId: number,
  date: Date,
  sportsLeague: string,
  season: string,
  homeScore: number | null = null,
  awayScore: number | null = null,
  status: "not_started" | "in_progress" | "completed" = "not_started"
): Promise<Game> {
  const db = await getDatabase()
  
  // Get team details
  const homeTeam = await db.collection(Collections.TEAMS).findOne({ id: homeTeamId })
  const awayTeam = await db.collection(Collections.TEAMS).findOne({ id: awayTeamId })
  
  if (!homeTeam || !awayTeam) {
    throw new Error('Team not found')
  }
  
  const gameId = await getNextGameId()
  
  const result = await db.collection(Collections.GAMES).insertOne({
    id: gameId,
    week,
    homeTeamId,
    awayTeamId,
    homeScore,
    awayScore,
    status,
    date,
    sportsLeague,
    season,
    createdAt: new Date(),
  })
  
  return {
    id: gameId,
    week,
    homeTeam: {
      id: homeTeam.id,
      name: homeTeam.name,
      abbreviation: homeTeam.abbreviation,
      logo: homeTeam.logo,
    },
    awayTeam: {
      id: awayTeam.id,
      name: awayTeam.name,
      abbreviation: awayTeam.abbreviation,
      logo: awayTeam.logo,
    },
    homeScore,
    awayScore,
    status,
    date: date.toISOString(),
    sportsLeague,
    season,
  } as Game
}

export async function getGamesByWeek(week: number, leagueId: string): Promise<Game[]> {
  const db = await getDatabase()
  
  // Get league details first
  const league = await getLeagueById(leagueId)
  if (!league) throw new Error('League not found')
  
  const games = await db.collection(Collections.GAMES)
    .aggregate([
      { $match: { week, sportsLeague: league.sportsLeague, season: league.season } },
      {
        $lookup: {
          from: Collections.TEAMS,
          localField: 'homeTeamId',
          foreignField: 'id',
          as: 'homeTeam'
        }
      },
      {
        $lookup: {
          from: Collections.TEAMS,
          localField: 'awayTeamId',
          foreignField: 'id',
          as: 'awayTeam'
        }
      },
      { $unwind: '$homeTeam' },
      { $unwind: '$awayTeam' }
    ]).toArray()
  
  return games.map(game => ({
    id: game.id,
    week: game.week,
    homeTeam: {
      id: game.homeTeam.id,
      name: game.homeTeam.name,
      abbreviation: game.homeTeam.abbreviation,
      logo: game.homeTeam.logo,
    },
    awayTeam: {
      id: game.awayTeam.id,
      name: game.awayTeam.name,
      abbreviation: game.awayTeam.abbreviation,
      logo: game.awayTeam.logo,
    },
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    status: game.status,
    date: game.date.toISOString(),
    sportsLeague: game.sportsLeague,
    season: game.season,
  })) as Game[]
}

// Pick operations
export async function createPick(
  userId: string,
  leagueId: string,
  gameId: number,
  teamId: number,
  week: number
): Promise<Pick> {
  const db = await getDatabase()
  
  // Get game and team details
  const game = await db.collection(Collections.GAMES)
    .aggregate([
      { $match: { id: gameId } },
      {
        $lookup: {
          from: Collections.TEAMS,
          localField: 'homeTeamId',
          foreignField: 'id',
          as: 'homeTeam'
        }
      },
      {
        $lookup: {
          from: Collections.TEAMS,
          localField: 'awayTeamId',
          foreignField: 'id',
          as: 'awayTeam'
        }
      },
      { $unwind: '$homeTeam' },
      { $unwind: '$awayTeam' }
    ]).limit(1).toArray()
  
  const team = await db.collection(Collections.TEAMS).findOne({ id: teamId })
  
  if (!game[0] || !team) {
    throw new Error('Game or team not found')
  }
  
  // Determine result if game is completed
  let result: "win" | "loss" | null = null
  if (game[0].status === "completed" && game[0].homeScore !== null && game[0].awayScore !== null) {
    if (teamId === game[0].homeTeamId) {
      result = game[0].homeScore > game[0].awayScore ? "win" : "loss"
    } else {
      result = game[0].awayScore > game[0].homeScore ? "win" : "loss"
    }
  }
  
  // Use replaceOne with upsert to enforce one pick per user per week per league
  const result2 = await db.collection(Collections.PICKS).replaceOne(
    {
      userId: new ObjectId(userId),
      leagueId: new ObjectId(leagueId),
      week: week
    },
    {
      userId: new ObjectId(userId),
      leagueId: new ObjectId(leagueId),
      gameId,
      teamId,
      result,
      week,
      createdAt: new Date(),
    },
    { upsert: true }
  )
  
  // Get the upserted or updated document's _id
  const pickId = result2.upsertedId ? result2.upsertedId.toString() : 
    (await db.collection(Collections.PICKS).findOne({
      userId: new ObjectId(userId),
      leagueId: new ObjectId(leagueId),
      week: week
    }))!._id.toString()
  
  return {
    id: pickId,
    user: parseInt(userId), // Note: This should be fixed to use proper user ID handling
    game: {
      id: game[0].id,
      week: game[0].week,
      homeTeam: {
        id: game[0].homeTeam.id,
        name: game[0].homeTeam.name,
        abbreviation: game[0].homeTeam.abbreviation,
        logo: game[0].homeTeam.logo,
      },
      awayTeam: {
        id: game[0].awayTeam.id,
        name: game[0].awayTeam.name,
        abbreviation: game[0].awayTeam.abbreviation,
        logo: game[0].awayTeam.logo,
      },
      homeScore: game[0].homeScore,
      awayScore: game[0].awayScore,
      status: game[0].status,
      date: game[0].date.toISOString(),
    },
    team: {
      id: team.id,
      name: team.name,
      abbreviation: team.abbreviation,
      logo: team.logo,
    },
    result,
    week,
  } as Pick
}

export async function getUserPicksByLeague(userId: string, leagueId: string): Promise<Pick[]> {
  const db = await getDatabase()
  
  const picks = await db.collection(Collections.PICKS)
    .aggregate([
      { $match: { userId: new ObjectId(userId), leagueId: new ObjectId(leagueId) } },
      {
        $lookup: {
          from: Collections.GAMES,
          localField: 'gameId',
          foreignField: 'id',
          as: 'game'
        }
      },
      {
        $lookup: {
          from: Collections.TEAMS,
          localField: 'teamId',
          foreignField: 'id',
          as: 'team'
        }
      },
      { $unwind: '$game' },
      { $unwind: '$team' },
      {
        $lookup: {
          from: Collections.TEAMS,
          localField: 'game.homeTeamId',
          foreignField: 'id',
          as: 'game.homeTeam'
        }
      },
      {
        $lookup: {
          from: Collections.TEAMS,
          localField: 'game.awayTeamId',
          foreignField: 'id',
          as: 'game.awayTeam'
        }
      },
      { $unwind: '$game.homeTeam' },
      { $unwind: '$game.awayTeam' }
    ]).toArray()
  
  return picks.map(pick => ({
    id: pick._id.toString(),
    user: parseInt(pick.userId.toString()),
    game: {
      id: pick.game.id,
      week: pick.game.week,
      homeTeam: {
        id: pick.game.homeTeam.id,
        name: pick.game.homeTeam.name,
        abbreviation: pick.game.homeTeam.abbreviation,
        logo: pick.game.homeTeam.logo,
      },
      awayTeam: {
        id: pick.game.awayTeam.id,
        name: pick.game.awayTeam.name,
        abbreviation: pick.game.awayTeam.abbreviation,
        logo: pick.game.awayTeam.logo,
      },
      homeScore: pick.game.homeScore,
      awayScore: pick.game.awayScore,
      status: pick.game.status,
      date: pick.game.date.toISOString(),
    },
    team: {
      id: pick.team.id,
      name: pick.team.name,
      abbreviation: pick.team.abbreviation,
      logo: pick.team.logo,
    },
    result: pick.result,
    week: pick.week,
  })) as Pick[]
}

export async function getGameTimeInfoById(gameId: number): Promise<{ startTime?: string; date?: string; status?: GameStatus } | null> {
  const db = await getDatabase()
  
  const game = await db.collection(Collections.GAMES).findOne(
    { id: gameId },
    { projection: { startTime: 1, date: 1, status: 1 } }
  )
  
  if (!game) return null
  
  return {
    startTime: game.startTime,
    date: game.date,
    status: game.status
  }
}

// Get a specific user pick for a given week
export async function getUserPickForWeek(userId: string, leagueId: string, week: number): Promise<Pick | null> {
  const db = await getDatabase()
  
  const pick = await db.collection(Collections.PICKS)
    .aggregate([
      { $match: { userId: new ObjectId(userId), leagueId: new ObjectId(leagueId), week } },
      {
        $lookup: {
          from: Collections.GAMES,
          localField: 'gameId',
          foreignField: 'id',
          as: 'game'
        }
      },
      {
        $lookup: {
          from: Collections.TEAMS,
          localField: 'teamId',
          foreignField: 'id',
          as: 'team'
        }
      },
      { $unwind: '$game' },
      { $unwind: '$team' },
      {
        $lookup: {
          from: Collections.TEAMS,
          localField: 'game.homeTeamId',
          foreignField: 'id',
          as: 'game.homeTeam'
        }
      },
      {
        $lookup: {
          from: Collections.TEAMS,
          localField: 'game.awayTeamId',
          foreignField: 'id',
          as: 'game.awayTeam'
        }
      },
      { $unwind: '$game.homeTeam' },
      { $unwind: '$game.awayTeam' },
      { $limit: 1 }
    ])
    .toArray()

  if (pick.length === 0) {
    return null
  }

  const pickData = pick[0]
  const { result } = pickData

  return {
    id: pickData._id.toString(),
    user: userId,
    game: {
      id: pickData.game.id,
      week: pickData.game.week,
      homeTeam: {
        id: pickData.game.homeTeam.id,
        name: pickData.game.homeTeam.name,
        abbreviation: pickData.game.homeTeam.abbreviation,
        logo: pickData.game.homeTeam.logo,
      },
      awayTeam: {
        id: pickData.game.awayTeam.id,
        name: pickData.game.awayTeam.name,
        abbreviation: pickData.game.awayTeam.abbreviation,
        logo: pickData.game.awayTeam.logo,
      },
      homeScore: pickData.game.homeScore,
      awayScore: pickData.game.awayScore,
      status: pickData.game.status,
      date: pickData.game.date,
      startTime: pickData.game.startTime,
      sportsLeague: pickData.game.sportsLeague,
      season: pickData.game.season,
    },
    team: {
      id: pickData.team.id,
      name: pickData.team.name,
      abbreviation: pickData.team.abbreviation,
      logo: pickData.team.logo,
    },
    result,
    week: pickData.week,
  } as Pick
}

// Get all teams
export async function getAllTeams(): Promise<Team[]> {
  const db = await getDatabase()
  const teams = await db.collection(Collections.TEAMS).find().toArray()
  
  return teams.map(team => ({
    id: team.id,
    name: team.name,
    abbreviation: team.abbreviation,
    logo: team.logo,
  })) as Team[]
}

// Get games by week with user picks
export async function getGamesByWeekWithPicks(week: number, userId: string, leagueId: string): Promise<Game[]> {
  const db = await getDatabase()
  
  // Get league details first
  const league = await getLeagueById(leagueId)
  if (!league) throw new Error('League not found')
  
  const games = await db.collection(Collections.GAMES)
    .aggregate([
      { $match: { week, sportsLeague: league.sportsLeague, season: league.season } },
      {
        $lookup: {
          from: Collections.TEAMS,
          localField: 'homeTeamId',
          foreignField: 'id',
          as: 'homeTeam'
        }
      },
      {
        $lookup: {
          from: Collections.TEAMS,
          localField: 'awayTeamId',
          foreignField: 'id',
          as: 'awayTeam'
        }
      },
      { $unwind: '$homeTeam' },
      { $unwind: '$awayTeam' },
      {
        $lookup: {
          from: Collections.PICKS,
          let: { gameId: '$id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$gameId', '$$gameId'] },
                    { $eq: ['$userId', new ObjectId(userId)] },
                    { $eq: ['$leagueId', new ObjectId(leagueId)] }
                  ]
                }
              }
            },
            {
              $lookup: {
                from: Collections.TEAMS,
                localField: 'teamId',
                foreignField: 'id',
                as: 'team'
              }
            },
            { $unwind: '$team' }
          ],
          as: 'userPick'
        }
      }
    ]).toArray()
  
  return games.map(game => ({
    id: game.id,
    week: game.week,
    homeTeam: {
      id: game.homeTeam.id,
      name: game.homeTeam.name,
      abbreviation: game.homeTeam.abbreviation,
      logo: game.homeTeam.logo,
    },
    awayTeam: {
      id: game.awayTeam.id,
      name: game.awayTeam.name,
      abbreviation: game.awayTeam.abbreviation,
      logo: game.awayTeam.logo,
    },
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    status: game.status,
    date: game.date.toISOString(),
    sportsLeague: game.sportsLeague,
    season: game.season,
    userPick: game.userPick.length > 0 ? {
      id: game.userPick[0]._id.toString(),
      user: game.userPick[0].userId.toString(),
      team: {
        id: game.userPick[0].team.id,
        name: game.userPick[0].team.name,
        abbreviation: game.userPick[0].team.abbreviation,
        logo: game.userPick[0].team.logo,
      },
      result: game.userPick[0].result,
      week: game.userPick[0].week,
    } : undefined
  })) as Game[]
}

// Helper functions for ID generation
async function getNextGameId(): Promise<number> {
  const db = await getDatabase()
  const lastGame = await db.collection(Collections.GAMES).findOne({}, { sort: { id: -1 } })
  return lastGame ? lastGame.id + 1 : 1
}


// Create database indexes for efficient querying
export async function createGameIndexes() {
  const db = await getDatabase()
  
  // Compound index for filtering games by sports league, season, and week
  await db.collection(Collections.GAMES).createIndex(
    { sportsLeague: 1, season: 1, week: 1 },
    { name: 'games_league_season_week' }
  )
  
  // Index for general sports league and season queries
  await db.collection(Collections.GAMES).createIndex(
    { sportsLeague: 1, season: 1 },
    { name: 'games_league_season' }
  )
  
  console.log('✓ Game indexes created')
}

// Get scoreboard data with weekly picks
export async function getScoreboardWithPicks(leagueId: string): Promise<{
  players: Player[]
  currentGameWeek: number | null
}> {
  const db = await getDatabase()
  
  // Get league info including current game week
  const league = await db.collection(Collections.LEAGUES).findOne({ 
    _id: new ObjectId(leagueId) 
  })
  
  const currentGameWeek = league?.current_game_week || null
  
  // Get league members with user data
  const members = await getLeagueMembersWithUserData(leagueId)
  
  // If no current game week, return basic player data
  if (!currentGameWeek) {
    const players: Player[] = members
      .filter(member => member.status === 'active')
      .map(member => {
        const displayName = member.userDetails.name 
          ? `${member.teamName} (${member.userDetails.name})`
          : member.teamName
        
        return {
          id: parseInt(member.user.toString()),
          name: displayName,
          points: member.points,
          strikes: member.strikes,
          rank: member.rank,
          weeklyPick: undefined,
        }
      })
      .sort((a, b) => {
        if (a.points !== b.points) return b.points - a.points
        return a.strikes - b.strikes
      })
      .map((player, index) => ({ ...player, rank: index + 1 }))
    
    return { players, currentGameWeek }
  }
  
  // Get all picks for current week for all league members
  const memberUserIds = members.map(m => new ObjectId(m.user.toString()))
  
  const weeklyPicks = await db.collection(Collections.PICKS)
    .aggregate([
      { 
        $match: { 
          userId: { $in: memberUserIds },
          leagueId: new ObjectId(leagueId),
          week: currentGameWeek
        } 
      },
      {
        $lookup: {
          from: Collections.TEAMS,
          localField: 'teamId',
          foreignField: 'id',
          as: 'team'
        }
      },
      { $unwind: '$team' },
      {
        $project: {
          userId: 1,
          teamName: '$team.name'
        }
      }
    ]).toArray()
  
  // Create a map of user picks for quick lookup
  const picksByUser = new Map<string, string>()
  weeklyPicks.forEach(pick => {
    picksByUser.set(pick.userId.toString(), pick.teamName)
  })
  
  // Build player data with weekly picks
  const players: Player[] = members
    .filter(member => member.status === 'active')
    .map(member => {
      const displayName = member.userDetails.name 
        ? `${member.teamName} (${member.userDetails.name})`
        : member.teamName
      
      const userId = member.user.toString()
      const weeklyPick = picksByUser.get(userId)
      
      return {
        id: parseInt(userId),
        name: displayName,
        points: member.points,
        strikes: member.strikes,
        rank: member.rank,
        weeklyPick,
      }
    })
    .sort((a, b) => {
      if (a.points !== b.points) return b.points - a.points
      return a.strikes - b.strikes
    })
    .map((player, index) => ({ ...player, rank: index + 1 }))
  
  return { players, currentGameWeek }
}

// Initialize default data (teams, etc.)
export async function initializeDefaultData() {
  const db = await getDatabase()
  
  // Create indexes first
  await createGameIndexes()
  await createInvitationIndexes()
  
  // Check if teams already exist
  const teamCount = await db.collection(Collections.TEAMS).countDocuments()
  if (teamCount > 0) return
  
  // Insert default EPL teams
  const eplTeams = [
    { name: "Arsenal", abbreviation: "ARS", logo: "https://resources.premierleague.com/premierleague/badges/t3.png" },
    { name: "Aston Villa", abbreviation: "AVL", logo: "https://resources.premierleague.com/premierleague/badges/t7.png" },
    { name: "Bournemouth", abbreviation: "BOU", logo: "https://resources.premierleague.com/premierleague/badges/t91.png" },
    { name: "Brentford", abbreviation: "BRE", logo: "https://resources.premierleague.com/premierleague/badges/t94.png" },
    { name: "Brighton", abbreviation: "BHA", logo: "https://resources.premierleague.com/premierleague/badges/t36.png" },
    { name: "Chelsea", abbreviation: "CHE", logo: "https://resources.premierleague.com/premierleague/badges/t8.png" },
    { name: "Crystal Palace", abbreviation: "CRY", logo: "https://resources.premierleague.com/premierleague/badges/t31.png" },
    { name: "Everton", abbreviation: "EVE", logo: "https://resources.premierleague.com/premierleague/badges/t11.png" },
    { name: "Fulham", abbreviation: "FUL", logo: "https://resources.premierleague.com/premierleague/badges/t54.png" },
    { name: "Liverpool", abbreviation: "LIV", logo: "https://resources.premierleague.com/premierleague/badges/t14.png" },
    { name: "Manchester City", abbreviation: "MCI", logo: "https://resources.premierleague.com/premierleague/badges/t43.png" },
    { name: "Manchester United", abbreviation: "MUN", logo: "https://resources.premierleague.com/premierleague/badges/t1.png" },
    { name: "Newcastle", abbreviation: "NEW", logo: "https://resources.premierleague.com/premierleague/badges/t4.png" },
    { name: "Nottingham Forest", abbreviation: "NFO", logo: "https://resources.premierleague.com/premierleague/badges/t17.png" },
    { name: "Southampton", abbreviation: "SOU", logo: "https://resources.premierleague.com/premierleague/badges/t20.png" },
    { name: "Tottenham", abbreviation: "TOT", logo: "https://resources.premierleague.com/premierleague/badges/t6.png" },
    { name: "West Ham", abbreviation: "WHU", logo: "https://resources.premierleague.com/premierleague/badges/t21.png" },
    { name: "Wolves", abbreviation: "WOL", logo: "https://resources.premierleague.com/premierleague/badges/t39.png" },
    { name: "Leicester City", abbreviation: "LEI", logo: "https://resources.premierleague.com/premierleague/badges/t13.png" },
    { name: "Ipswich Town", abbreviation: "IPS", logo: "https://resources.premierleague.com/premierleague/badges/t133.png" },
  ]
  
  await db.collection(Collections.TEAMS).insertMany(eplTeams.map((team, index) => ({
    ...team,
    id: index + 1,
    sportsLeague: 'EPL'
  })))
}

// League invitation operations
export async function createLeagueInvitation(
  leagueId: string,
  createdBy: string,
  maxUses: number | null,
  expiresAt: Date | null
): Promise<LeagueInvitation> {
  const db = await getDatabase()
  const token = crypto.randomBytes(32).toString('hex')
  
  const result = await db.collection(Collections.LEAGUE_INVITATIONS).insertOne({
    leagueId: new ObjectId(leagueId),
    token,
    createdBy: new ObjectId(createdBy),
    maxUses,
    currentUses: 0,
    expiresAt,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  
  return {
    id: result.insertedId.toString(),
    leagueId,
    token,
    createdBy,
    maxUses,
    currentUses: 0,
    expiresAt: expiresAt?.toISOString() || null,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export async function getLeagueInvitations(leagueId: string): Promise<InvitationWithLeague[]> {
  const db = await getDatabase()
  
  const invitations = await db.collection(Collections.LEAGUE_INVITATIONS)
    .aggregate([
      { $match: { leagueId: new ObjectId(leagueId) } },
      {
        $lookup: {
          from: Collections.LEAGUES,
          localField: 'leagueId',
          foreignField: '_id',
          as: 'league'
        }
      },
      {
        $lookup: {
          from: Collections.USERS,
          localField: 'createdBy',
          foreignField: '_id',
          as: 'creator'
        }
      },
      { $unwind: '$league' },
      { $unwind: '$creator' },
      { $sort: { createdAt: -1 } }
    ]).toArray()
  
  return invitations.map(inv => ({
    id: inv._id.toString(),
    leagueId: inv.leagueId.toString(),
    token: inv.token,
    createdBy: inv.createdBy.toString(),
    maxUses: inv.maxUses,
    currentUses: inv.currentUses,
    expiresAt: inv.expiresAt?.toISOString() || null,
    isActive: inv.isActive,
    createdAt: inv.createdAt.toISOString(),
    updatedAt: inv.updatedAt.toISOString(),
    league: {
      id: inv.league._id.toString(),
      name: inv.league.name,
      description: inv.league.description,
      sportsLeague: inv.league.sportsLeague,
      memberCount: inv.league.memberCount,
    },
    creator: {
      id: inv.creator._id.toString(),
      username: inv.creator.username,
    },
  }))
}

export async function getInvitationByToken(token: string): Promise<InvitationAcceptanceInfo | null> {
  const db = await getDatabase()
  
  const invitations = await db.collection(Collections.LEAGUE_INVITATIONS)
    .aggregate([
      { $match: { token } },
      {
        $lookup: {
          from: Collections.LEAGUES,
          localField: 'leagueId',
          foreignField: '_id',
          as: 'league'
        }
      },
      {
        $lookup: {
          from: Collections.USERS,
          localField: 'createdBy',
          foreignField: '_id',
          as: 'creator'
        }
      },
      { $unwind: '$league' },
      { $unwind: '$creator' }
    ]).limit(1).toArray()
  
  if (invitations.length === 0) {
    return null
  }
  
  const inv = invitations[0]
  const now = new Date()
  const isExpired = inv.expiresAt && new Date(inv.expiresAt) < now
  const isAtMaxUses = inv.maxUses && inv.currentUses >= inv.maxUses
  
  return {
    invitation: {
      id: inv._id.toString(),
      token: inv.token,
      isValid: inv.isActive && !isExpired && !isAtMaxUses,
      isExpired: !!isExpired,
      isAtMaxUses: !!isAtMaxUses,
    },
    league: {
      id: inv.league._id.toString(),
      name: inv.league.name,
      description: inv.league.description,
      sportsLeague: inv.league.sportsLeague,
      memberCount: inv.league.memberCount,
    },
    creator: {
      username: inv.creator.username,
    },
  }
}

export async function acceptInvitation(
  token: string,
  userId: string,
  teamName: string
): Promise<{ success: boolean; membership?: LeagueMembership; error?: string }> {
  const db = await getDatabase()
  
  const invitation = await getInvitationByToken(token)
  if (!invitation) {
    return { success: false, error: 'Invitation not found' }
  }
  
  if (!invitation.invitation.isValid) {
    if (invitation.invitation.isExpired) {
      return { success: false, error: 'Invitation has expired' }
    }
    if (invitation.invitation.isAtMaxUses) {
      return { success: false, error: 'Invitation has reached maximum uses' }
    }
    return { success: false, error: 'Invitation is no longer valid' }
  }
  
  // Check if user is already a member
  const existingMembership = await db.collection(Collections.LEAGUE_MEMBERSHIPS).findOne({
    leagueId: new ObjectId(invitation.league.id),
    userId: new ObjectId(userId)
  })
  
  if (existingMembership) {
    return { success: false, error: 'You are already a member of this league' }
  }
  
  // Create league membership
  const membership = await createLeagueMembership(
    invitation.league.id,
    userId,
    teamName,
    false // not admin
  )
  
  // Update invitation usage
  await db.collection(Collections.LEAGUE_INVITATIONS).updateOne(
    { token },
    {
      $inc: { currentUses: 1 },
      $set: { updatedAt: new Date() }
    }
  )
  
  return { success: true, membership }
}

export async function revokeInvitation(invitationId: string): Promise<boolean> {
  const db = await getDatabase()
  
  const result = await db.collection(Collections.LEAGUE_INVITATIONS).updateOne(
    { _id: new ObjectId(invitationId) },
    {
      $set: {
        isActive: false,
        updatedAt: new Date()
      }
    }
  )
  
  return result.matchedCount > 0
}

export async function createInvitationIndexes() {
  const db = await getDatabase()
  
  // Index for invitation lookup by token
  await db.collection(Collections.LEAGUE_INVITATIONS).createIndex(
    { token: 1 },
    { name: 'invitations_token' }
  )
  
  // Index for admin listing invitations by league
  await db.collection(Collections.LEAGUE_INVITATIONS).createIndex(
    { leagueId: 1, isActive: 1 },
    { name: 'invitations_league_active' }
  )
  
  // Index for cleanup of expired invitations
  await db.collection(Collections.LEAGUE_INVITATIONS).createIndex(
    { expiresAt: 1 },
    { name: 'invitations_expires' }
  )
  
  console.log('✓ Invitation indexes created')
}