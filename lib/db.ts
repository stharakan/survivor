import { ObjectId } from 'mongodb'
import { getDatabase, Collections } from './mongodb'
import type { User } from '@/types/user'
import type { League, LeagueMembership, JoinRequest } from '@/types/league'
import type { Team } from '@/types/team'
import type { Game } from '@/types/game'
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