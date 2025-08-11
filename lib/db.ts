import { ObjectId } from 'mongodb'
import { getDatabase, Collections } from './mongodb'
import type { User } from '@/types/user'
import type { League, LeagueMembership, JoinRequest } from '@/types/league'
import type { Team } from '@/types/team'
import type { Game, GameStatus } from '@/types/game'
import type { Pick } from '@/types/pick'
import type { Player } from '@/types/player'
import bcrypt from 'bcryptjs'

// User operations
export async function createUser(email: string, username: string, password: string): Promise<User> {
  const db = await getDatabase()
  const hashedPassword = await bcrypt.hash(password, 12)
  
  const result = await db.collection(Collections.USERS).insertOne({
    email,
    username,
    password: hashedPassword,
    createdAt: new Date(),
  })
  
  return {
    id: result.insertedId.toString(),
    email,
    username,
  } as User
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const db = await getDatabase()
  const user = await db.collection(Collections.USERS).findOne({ email })
  
  if (!user) return null
  
  return {
    id: user._id.toString(),
    email: user.email,
    username: user.username,
  } as User
}

export async function getUserById(id: string): Promise<User | null> {
  const db = await getDatabase()
  const user = await db.collection(Collections.USERS).findOne({ _id: new ObjectId(id) })
  
  if (!user) return null
  
  return {
    id: user._id.toString(),
    email: user.email,
    username: user.username,
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
    username: user.username,
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
  updates: { isPaid?: boolean; isAdmin?: boolean }
): Promise<void> {
  const db = await getDatabase()
  
  const updateDoc: any = {}
  if (typeof updates.isPaid === 'boolean') {
    updateDoc.isPaid = updates.isPaid
  }
  if (typeof updates.isAdmin === 'boolean') {
    updateDoc.isAdmin = updates.isAdmin
  }
  
  await db.collection(Collections.LEAGUE_MEMBERSHIPS).updateOne(
    {
      _id: new ObjectId(memberId),
      leagueId: new ObjectId(leagueId)
    },
    { $set: updateDoc }
  )
}

// Game operations
export async function createGame(
  week: number,
  homeTeamId: number,
  awayTeamId: number,
  date: Date,
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
  } as Game
}

export async function getGamesByWeek(week: number): Promise<Game[]> {
  const db = await getDatabase()
  
  const games = await db.collection(Collections.GAMES)
    .aggregate([
      { $match: { week } },
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
  
  const games = await db.collection(Collections.GAMES)
    .aggregate([
      { $match: { week } },
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


// Initialize default data (teams, etc.)
export async function initializeDefaultData() {
  const db = await getDatabase()
  
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