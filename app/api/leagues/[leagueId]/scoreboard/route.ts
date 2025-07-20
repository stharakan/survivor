import { NextRequest } from 'next/server'
import { getLeagueMembers } from '@/lib/db'
import { createApiResponse, handleApiError } from '@/lib/api-types'
import type { Player } from '@/types/player'

// GET /api/leagues/[leagueId]/scoreboard - Get league scoreboard
export async function GET(
  request: NextRequest,
  { params }: { params: { leagueId: string } }
) {
  try {
    const members = await getLeagueMembers(params.leagueId)
    
    // Convert memberships to player scoreboard format
    const players: Player[] = members
      .filter(member => member.status === 'active')
      .map(member => ({
        id: parseInt(member.user.toString()),
        name: member.teamName,
        points: member.points,
        strikes: member.strikes,
        rank: member.rank,
      }))
      .sort((a, b) => {
        // Sort by points (descending), then by strikes (ascending)
        if (a.points !== b.points) return b.points - a.points
        return a.strikes - b.strikes
      })
      .map((player, index) => ({ ...player, rank: index + 1 }))
    
    return Response.json(createApiResponse(true, players))
  } catch (error) {
    return handleApiError(error)
  }
}