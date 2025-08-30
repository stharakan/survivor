"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useLeague } from "@/hooks/use-league"
import { getScoreboard, getUserPicks } from "@/lib/api"
import type { Player } from "@/types/player"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Trophy } from "lucide-react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { LeagueGuard } from "@/components/league-guard"
import { hasGameweekStarted } from "@/lib/game-utils"

function ScoreboardContent() {
  const { user } = useAuth()
  const { currentLeague } = useLeague()
  const [players, setPlayers] = useState<Player[]>([])
  const [displayWeek, setDisplayWeek] = useState<number>(1)
  const [loading, setLoading] = useState(true)
  const [currentUserHasPick, setCurrentUserHasPick] = useState<boolean>(false)
  const [showLockScreen, setShowLockScreen] = useState<boolean>(false)
  const router = useRouter()

  useEffect(() => {
    const fetchData = async () => {
      if (user && currentLeague) {
        try {
          // Check if gameweek is active
          const gameweekStarted = hasGameweekStarted(currentLeague)
          
          if (gameweekStarted) {
            // Check if current user has made a pick for the pick week first
            const userPicks = await getUserPicks(user.id, currentLeague.id)
            const hasPickForWeek = userPicks.some(pick => pick.week === (currentLeague.current_pick_week || 1))
            setCurrentUserHasPick(hasPickForWeek)
            
            if (!hasPickForWeek) {
              // Show lock screen and skip scoreboard data fetching
              setShowLockScreen(true)
              setLoading(false)
              return
            }
          }
          
          // Normal flow - fetch scoreboard data
          setShowLockScreen(false)
          const data = await getScoreboard(currentLeague.id)
          setDisplayWeek(currentLeague.current_pick_week || 1)
          
          // Check if current user has made a pick for the pick week (for non-active gameweeks)
          if (!gameweekStarted) {
            const userPicks = await getUserPicks(user.id, currentLeague.id)
            const hasPickForWeek = userPicks.some(pick => pick.week === (currentLeague.current_pick_week || 1))
            setCurrentUserHasPick(hasPickForWeek)
            
            // Update scoreboard data to reflect actual user pick status
            const updatedPlayers = data.players.map(player => {
              // Now player IDs should match user IDs properly
              if (player.id === user.id) {
                return {
                  ...player,
                  weeklyPick: hasPickForWeek ? player.weeklyPick : null
                }
              }
              return player
            })
            setPlayers(updatedPlayers)
          } else {
            setPlayers(data.players)
          }
        } catch (error) {
          console.error("Error fetching scoreboard data:", error)
        } finally {
          setLoading(false)
        }
      }
    }

    fetchData()
  }, [user, currentLeague])

  const handleRowClick = (playerId: string) => {
    router.push(`/player/${playerId}`)
  }

  const getPickDisplay = (player: Player) => {
    const pickWeek = currentLeague?.current_pick_week || 1
    const gameWeek = currentLeague?.current_game_week || 0
    const hasPick = player.weeklyPick && player.weeklyPick !== '??'
    
    
    // Determine if gameweek is active (pick week matches game week)
    const isGameweekActive = pickWeek === gameWeek
    
    if (!isGameweekActive) {
      // Gameweek is not active - show hidden icons or ??
      return hasPick ? "🔒" : "??"
    }
    
    // Gameweek is active
    if (!currentUserHasPick) {
      // Current user hasn't made pick - show locks for players with picks, ?? for players without
      return hasPick ? "🔒" : "??"
    }
    
    // Current user has made pick - reveal all picks except ??
    return hasPick ? player.weeklyPick : "??"
  }

  const shouldShowWeekPickColumn = (weekNumber: number) => {
    const gameWeek = currentLeague?.current_game_week || 0
    const completedWeek = currentLeague?.last_completed_week || 0
    
    // Show if week has started but not fully completed
    return weekNumber > completedWeek && weekNumber <= gameWeek
  }

  const LockScreen = () => (
    <div className="text-center py-16">
      <div className="text-8xl mb-6">🔒</div>
      <h3 className="text-2xl font-heading mb-3">Gameweek Active</h3>
      <p className="text-muted-foreground mb-6">
        Scoreboard is locked until you make a pick
      </p>
      <Button 
        onClick={() => router.push('/make-picks')}
        className="bg-retro-orange hover:bg-retro-orange/90 text-white"
      >
        Make Your Pick
      </Button>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading">League Scoreboard</h1>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-sm text-muted-foreground">{currentLeague?.sportsLeague}</div>
            <div className="font-heading text-sm">{currentLeague?.name}</div>
          </div>
          <Image src="/images/tharakan-bros-logo.png" alt="Tharakan Bros Logo" width={60} height={60} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Standings</CardTitle>
          <CardDescription>Current standings for all players in the league</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : showLockScreen ? (
            <LockScreen />
          ) : currentLeague?.hideScoreboard ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🔒</div>
              <h3 className="text-xl font-heading mb-2">Scoreboard is Hidden</h3>
              <p className="text-muted-foreground">The scoreboard is currently hidden by the administrator.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b-2 border-black">
                  <TableHead className="w-16 font-heading">Rank</TableHead>
                  <TableHead className="font-heading">Player</TableHead>
                  <TableHead className="font-heading">
                    Week {displayWeek} pick
                  </TableHead>
                  <TableHead className="text-right font-heading">Points</TableHead>
                  <TableHead className="text-right font-heading">Strikes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {players.map((player, index) => (
                  <TableRow
                    key={`${player.id}-${index}`}
                    className="border-b-2 border-black cursor-pointer hover:bg-accent/50"
                    onClick={() => handleRowClick(player.id)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center">
                        {player.rank === 1 && <Trophy className="h-4 w-4 mr-1 text-retro-yellow" />}
                        {player.rank}
                      </div>
                    </TableCell>
                    <TableCell>{player.name}</TableCell>
                    <TableCell>{getPickDisplay(player)}</TableCell>
                    <TableCell className="text-right">{player.points}</TableCell>
                    <TableCell className="text-right">{player.strikes}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function ScoreboardPage() {
  return (
    <LeagueGuard>
      <ScoreboardContent />
    </LeagueGuard>
  )
}
