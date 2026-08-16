"use client"

import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useLeague } from "@/hooks/use-league"
import { getScoreboard, getUserPicks, getInnerCircle, addToInnerCircle, removeFromInnerCircle } from "@/lib/api"
import type { Player } from "@/types/player"
import type { InnerCircleMember } from "@/types/league"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Trophy, UserPlus, X } from "lucide-react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { LeagueGuard } from "@/components/league-guard"
import { hasGameweekStarted } from "@/lib/game-utils"

function ScoreboardContent() {
  const { user } = useAuth()
  const { currentLeague, currentMembership } = useLeague()
  const [players, setPlayers] = useState<Player[]>([])
  const [displayWeek, setDisplayWeek] = useState<number>(1)
  const [loading, setLoading] = useState(true)
  const [currentUserHasPick, setCurrentUserHasPick] = useState<boolean>(false)
  const [showLockScreen, setShowLockScreen] = useState<boolean>(false)
  const [innerCircleOn, setInnerCircleOn] = useState(false)
  const [circle, setCircle] = useState<InnerCircleMember[]>([])
  const [addOpen, setAddOpen] = useState(false)
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

  // Independent of the scoreboard/pick-lock fetch above -- the circle is a
  // personal preference, not part of the scoreboard data itself.
  useEffect(() => {
    if (currentLeague && currentMembership) {
      getInnerCircle(currentLeague.id, currentMembership.id)
        .then(setCircle)
        .catch((error) => console.error("Error fetching inner circle:", error))
    }
  }, [currentLeague, currentMembership])

  const circleUserIds = useMemo(() => new Set(circle.map((c) => c.userId)), [circle])

  const displayedPlayers = innerCircleOn
    ? players.filter((p) => p.id === user?.id || circleUserIds.has(p.id))
    : players

  const availableToAdd = players.filter((p) => p.id !== user?.id && !circleUserIds.has(p.id))

  const handleAddToCircle = async (playerId: string) => {
    if (!currentLeague || !currentMembership) return
    try {
      const updated = await addToInnerCircle(currentLeague.id, currentMembership.id, playerId)
      setCircle(updated)
      setAddOpen(false)
    } catch (error) {
      console.error("Error adding to inner circle:", error)
    }
  }

  const handleRemoveFromCircle = async (userId: string) => {
    if (!currentLeague || !currentMembership) return
    try {
      const updated = await removeFromInnerCircle(currentLeague.id, currentMembership.id, userId)
      setCircle(updated)
    } catch (error) {
      console.error("Error removing from inner circle:", error)
    }
  }

  const handleRowClick = (playerId: string) => {
    router.push(`/player?id=${playerId}`)
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
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Standings</CardTitle>
              <CardDescription>
                {innerCircleOn
                  ? "Showing only you and your inner circle"
                  : "Current standings for all players in the league"}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm font-medium">Inner Circle:</span>
              <Switch checked={innerCircleOn} onCheckedChange={setInnerCircleOn} />
            </div>
          </div>
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
                {displayedPlayers.map((player, index) => (
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

      {innerCircleOn && !loading && !showLockScreen && !currentLeague?.hideScoreboard && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Manage Inner Circle</CardTitle>
            <CardDescription>Add or remove people you want to see on your filtered scoreboard</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Popover open={addOpen} onOpenChange={setAddOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="border-2 border-black bg-transparent">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add people to inner circle
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0">
                <Command>
                  <CommandInput placeholder="Search by team or player name..." />
                  <CommandList>
                    <CommandEmpty>No one found.</CommandEmpty>
                    <CommandGroup>
                      {availableToAdd.map((player) => (
                        <CommandItem key={player.id} value={player.name} onSelect={() => handleAddToCircle(player.id)}>
                          {player.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {circle.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {circle.map((member) => (
                  <Badge
                    key={member.userId}
                    variant="outline"
                    className="border-2 border-black flex items-center gap-1 pr-1"
                  >
                    {member.name}
                    <button
                      type="button"
                      onClick={() => handleRemoveFromCircle(member.userId)}
                      className="ml-1 hover:text-destructive"
                      aria-label={`Remove ${member.name} from inner circle`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
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
