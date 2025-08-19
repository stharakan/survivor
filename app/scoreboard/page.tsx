"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useLeague } from "@/hooks/use-league"
import { getScoreboard } from "@/lib/api"
import type { Player } from "@/types/player"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Trophy } from "lucide-react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { LeagueGuard } from "@/components/league-guard"

function ScoreboardContent() {
  const { user } = useAuth()
  const { currentLeague } = useLeague()
  const [players, setPlayers] = useState<Player[]>([])
  const [displayWeek, setDisplayWeek] = useState<number>(1)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const fetchData = async () => {
      if (user && currentLeague) {
        try {
          const data = await getScoreboard(currentLeague.id)
          setPlayers(data.players)
          setDisplayWeek(currentLeague.current_pick_week || 1)
        } catch (error) {
          console.error("Error fetching scoreboard data:", error)
        } finally {
          setLoading(false)
        }
      }
    }

    fetchData()
  }, [user, currentLeague])

  const handleRowClick = (playerId: number) => {
    router.push(`/player/${playerId}`)
  }

  const shouldShowWeekPickColumn = (weekNumber: number) => {
    const gameWeek = currentLeague?.current_game_week || 0
    const completedWeek = currentLeague?.last_completed_week || 0
    
    // Show if week has started but not fully completed
    return weekNumber > completedWeek && weekNumber <= gameWeek
  }

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
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b-2 border-black">
                  <TableHead className="w-16 font-heading">Rank</TableHead>
                  <TableHead className="font-heading">Player</TableHead>
                  {shouldShowWeekPickColumn(displayWeek) && (
                    <TableHead className="font-heading">
                      Week {displayWeek} pick
                    </TableHead>
                  )}
                  <TableHead className="text-right font-heading">Points</TableHead>
                  <TableHead className="text-right font-heading">Strikes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {players.map((player) => (
                  <TableRow
                    key={player.id}
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
                    {shouldShowWeekPickColumn(displayWeek) && (
                      <TableCell>{player.weeklyPick || '??'}</TableCell>
                    )}
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
