import jwt from 'jsonwebtoken'
import { getUserById, getLeagueMember } from './db'
import { NextRequest } from 'next/server'
import type { User } from '@/types/user'
import type { LeagueMembership } from '@/types/league'
import bcrypt from 'bcryptjs'

export type AuthUser = {
  userId: string
  email: string
}

export type AuthorizationContext = {
  user: User
  membership: LeagueMembership | null
  isAdmin: boolean
}

/**
 * Extract and verify JWT token from request cookies
 */
export async function verifyAuthToken(request: NextRequest): Promise<AuthUser> {
  const token = request.cookies.get('auth-token')?.value
  
  if (!token) {
    throw new Error('Authentication required')
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as AuthUser
    return decoded
  } catch (error) {
    throw new Error('Invalid authentication token')
  }
}

/**
 * Get user and their membership for a specific league
 */
export async function getAuthorizationContext(
  userId: string, 
  leagueId: string
): Promise<AuthorizationContext> {
  const user = await getUserById(userId)
  if (!user) {
    throw new Error('User not found')
  }
  
  // Get user's membership in the target league
  const membership = await getUserLeagueMembership(userId, leagueId)
  
  return {
    user,
    membership,
    isAdmin: membership?.isAdmin || false
  }
}

/**
 * Get user's membership in a specific league
 */
async function getUserLeagueMembership(userId: string, leagueId: string): Promise<LeagueMembership | null> {
  try {
    const { getDatabase, Collections } = await import('./mongodb')
    const { ObjectId } = await import('mongodb')
    const db = await getDatabase()
    
    const membership = await db.collection(Collections.LEAGUE_MEMBERSHIPS)
      .aggregate([
        { 
          $match: { 
            userId: new ObjectId(userId),
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
      ]).limit(1).toArray()
    
    if (membership.length === 0) {
      return null
    }
    
    const m = membership[0]
    return {
      id: m._id.toString(),
      league: {
        id: m.league._id.toString(),
        name: m.league.name,
        description: m.league.description,
        sportsLeague: m.league.sportsLeague,
        season: m.league.season,
        isPublic: m.league.isPublic,
        requiresApproval: m.league.requiresApproval,
        createdBy: m.league.createdBy.toString(),
        isActive: m.league.isActive,
        memberCount: m.league.memberCount,
        createdAt: m.league.createdAt.toISOString(),
      },
      user: m.userId.toString(),
      teamName: m.teamName,
      points: m.points,
      strikes: m.strikes,
      rank: m.rank,
      isActive: m.isActive,
      isAdmin: m.isAdmin,
      isPaid: m.isPaid,
      status: m.status,
      joinedAt: m.joinedAt.toISOString(),
    } as LeagueMembership
  } catch (error) {
    console.error('Error fetching user league membership:', error)
    return null
  }
}

/**
 * Validate that user can modify member admin status
 */
export async function validateAdminPermission(
  requestingUserId: string,
  leagueId: string,
  targetMemberId: string,
  newAdminStatus?: boolean
): Promise<void> {
  // Get requesting user's authorization context
  const requestingUserAuth = await getAuthorizationContext(requestingUserId, leagueId)
  
  // Check if requesting user is a member of the league
  if (!requestingUserAuth.membership) {
    throw new Error('You are not a member of this league')
  }
  
  // Check if requesting user is an admin
  if (!requestingUserAuth.isAdmin) {
    throw new Error('Only league administrators can modify member admin status')
  }
  
  // If modifying admin status, apply additional business rules
  if (typeof newAdminStatus === 'boolean') {
    const targetMember = await getLeagueMember(leagueId, targetMemberId)
    if (!targetMember) {
      throw new Error('Target member not found')
    }
    
    // Prevent self-admin removal
    if (requestingUserAuth.membership.id === targetMemberId && !newAdminStatus) {
      throw new Error('You cannot remove your own admin privileges')
    }
    
    // Prevent removing admin from league creator
    if (targetMember.league.createdBy === targetMember.user && !newAdminStatus) {
      throw new Error('Cannot remove admin privileges from league creator')
    }
  }
}

/**
 * Log admin privilege changes for audit trail
 */
export async function logAdminPrivilegeChange(
  requestingUserId: string,
  leagueId: string,
  targetMemberId: string,
  oldAdminStatus: boolean,
  newAdminStatus: boolean,
  additionalContext?: Record<string, any>
): Promise<void> {
  if (oldAdminStatus === newAdminStatus) {
    return // No change to log
  }
  
  const logEntry = {
    timestamp: new Date().toISOString(),
    action: 'admin_privilege_change',
    requestingUserId,
    leagueId,
    targetMemberId,
    changes: {
      isAdmin: {
        from: oldAdminStatus,
        to: newAdminStatus
      }
    },
    context: additionalContext
  }
  
  // Log to console for now - in production, this should go to a proper audit log
  console.log('AUDIT LOG:', JSON.stringify(logEntry, null, 2))
  
  // TODO: In production, store this in a dedicated audit_logs collection
  try {
    const { getDatabase, Collections } = await import('./mongodb')
    const db = await getDatabase()
    
    // For now, we'll create a simple audit log collection
    await db.collection('audit_logs').insertOne(logEntry)
  } catch (error) {
    console.error('Failed to store audit log:', error)
    // Don't throw - audit logging failure shouldn't break the main operation
  }
}

/**
 * Complete authorization check for member modification requests
 */
export async function authorizeRequest(
  request: NextRequest,
  leagueId: string,
  memberId: string,
  updates: { isAdmin?: boolean; isPaid?: boolean; teamName?: string }
): Promise<AuthorizationContext> {
  // Verify authentication
  const authUser = await verifyAuthToken(request)
  
  // Get authorization context
  const authContext = await getAuthorizationContext(authUser.userId, leagueId)
  
  // If modifying admin status, validate admin permission
  if (typeof updates.isAdmin === 'boolean') {
    await validateAdminPermission(authUser.userId, leagueId, memberId, updates.isAdmin)
  }
  
  return authContext
}

