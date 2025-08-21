"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useLeague } from "@/hooks/use-league"
import { getUpcomingGamesWithPicks, makePick, getPicksRemaining } from "@/lib/api"
import type { Game } from "@/types/game"
import type { Team } from "@/types/team"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { format, isPast, addHours } from "date-fns"
import { CheckCircle, AlertCircle, Clock, ListChecks, X } from "lucide-react"
import { BatteryIndicator } from "@/components/ui/battery-indicator"
import { 
  computeGameStatus,
  canPickFromGame,
  canChangeExistingPick,
  getGameStatusDisplay,
  getGameCardClasses,
  getTeamSelectionClasses
} from "@/lib/game-utils"
import type { GameStatus } from "@/types/game"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import Image from "next/image"
import { LeagueGuard } from "@/components/league-guard"

function MakePicksContent() {
  const { user } = useAuth()
  const { currentLeague } = useLeague()
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null)
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentWeek, setCurrentWeek] = useState(currentLeague?.current_pick_week || 1)
  const [picksRemaining, setPicksRemaining] = useState<{ team: Team; remaining: number }[]>([])
  const [loadingPicksRemaining, setLoadingPicksRemaining] = useState(true)
  const [userPickForWeek, setUserPickForWeek] = useState<number | null>(null)
  const [showTeamsModal, setShowTeamsModal] = useState(false)

  // Weeks for the season
  const weeks = Array.from({ length: 38 }, (_, i) => i + 1)

  useEffect(() => {
    const fetchData = async () => {
      if (user && currentLeague) {
        try {
          setLoading(true)
          const data = await getUpcomingGamesWithPicks(currentWeek, currentLeague.id, user.id)
          setGames(data)

          // Check if user has already made a pick for this week
          const userPick = data.find((game) => game.userPick && game.userPick.user === user?.id)

          if (userPick) {
            setUserPickForWeek(userPick.userPick.team.id)
            setSelectedTeam(userPick.userPick.team.id)
            setSelectedGameId(userPick.id)
          } else {
            setUserPickForWeek(null)
            setSelectedTeam(null)
            setSelectedGameId(null)
          }
        } catch (error) {
          console.error("Error fetching games data:", error)
        } finally {
          setLoading(false)
        }

        try {
          setLoadingPicksRemaining(true)
          const remainingData = await getPicksRemaining(user.id, currentLeague.id)
          setPicksRemaining(remainingData)
        } catch (error) {
          console.error("Error fetching picks remaining data:", error)
        } finally {
          setLoadingPicksRemaining(false)
        }
      }
    }

    fetchData()
  }, [user, currentLeague, currentWeek])

  const handleTeamSelect = (gameId: number, teamId: number) => {
    // Check if user has existing pick and if it can be changed
    if (userPickForWeek) {
      const existingGame = games.find(g => g.userPick?.user === user?.id)
      if (existingGame && !canChangeExistingPick(existingGame)) {
        setError("Cannot change pick because your selected game has already started")
        return
      }
    }
    
    // Clear any previous errors
    setError(null)
    
    // In survivor league, you can only pick one team per week
    // Replace any previous selection with the new one
    setSelectedTeam(teamId)
    setSelectedGameId(gameId)
  }

  const handleSubmitPick = async () => {
    if (!user || !currentLeague || !selectedTeam || !selectedGameId) return

    // Additional validation before submit
    if (userPickForWeek) {
      const existingGame = games.find(g => g.userPick?.user === user?.id)
      if (existingGame && !canChangeExistingPick(existingGame)) {
        setError("Cannot change pick because your selected game has already started")
        return
      }
    }

    setSubmitting(true)
    setSuccess(null)
    setError(null)

    try {
      const game = games.find((g) => g.id === selectedGameId)
      const team = game?.homeTeam.id === selectedTeam ? game.homeTeam : game?.awayTeam

      const newPick = await makePick(user.id, selectedGameId, selectedTeam, currentLeague.id, currentWeek)
      setSuccess(`Successfully picked ${team?.name} for Week ${currentWeek}`)

      // Update the user's pick for this week
      setUserPickForWeek(selectedTeam)

      // Update the games array to include the new userPick
      setGames(prevGames => 
        prevGames.map(game => 
          game.id === selectedGameId 
            ? {
                ...game,
                userPick: {
                  id: newPick.id,
                  user: user.id,
                  team: newPick.team,
                  result: newPick.result,
                  week: newPick.week,
                }
              }
            : game
        )
      )

      // Refresh picks remaining
      const remainingData = await getPicksRemaining(user.id, currentLeague.id)
      setPicksRemaining(remainingData)
    } catch (error) {
      console.error("Error submitting pick:", error)
      const errorMessage = error instanceof Error ? error.message : "Failed to submit pick. Please try again."
      setError(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  // Get the name of the team the user picked for current week
  const getUserPickedTeamName = () => {
    if (!userPickForWeek) return null
    
    const gameWithPick = games.find(game => 
      game.userPick && 
      game.userPick.user === user?.id && 
      game.userPick.team.id === userPickForWeek
    )
    
    return gameWithPick?.userPick.team.name || null
  }

  // Check if there are any games that can still be picked from
  const hasPickableGames = () => {
    return games.some(game => canPickFromGame(game))
  }

  // Check if a team has already been used (no picks remaining)
  const isTeamUsed = (teamId: number) => {
    const team = picksRemaining.find((p) => p.team.id === teamId)
    return team ? team.remaining === 0 : false
  }

  // Get remaining picks for a specific team
  const getTeamRemaining = (teamId: number) => {
    const team = picksRemaining.find((p) => p.team.id === teamId)
    return team ? team.remaining : 0
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <h1 className="text-2xl font-heading mr-4">Make Picks</h1>

          <Button variant="outline" size="sm" className="border-2 border-black" onClick={() => setShowTeamsModal(true)}>
            <ListChecks className="h-4 w-4 mr-2" />
            Available Teams
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-sm text-muted-foreground">{currentLeague?.sportsLeague}</div>
            <div className="font-heading text-sm">{currentLeague?.name}</div>
          </div>
          <Image src="/images/tharakan-bros-logo.png" alt="Tharakan Bros Logo" width={60} height={60} />
        </div>
      </div>

      {/* Custom Modal for Available Teams */}
      {showTeamsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-background border-4 border-black max-w-md w-full max-h-[80vh] overflow-hidden rounded-none">
            <div className="p-4 bg-retro-orange text-white border-b-4 border-black flex justify-between items-center">
              <h2 className="font-heading text-xl">Available Teams</h2>
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:bg-retro-orange/80"
                onClick={() => setShowTeamsModal(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {loadingPicksRemaining ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : picksRemaining.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {picksRemaining
                    .sort((a, b) => b.remaining - a.remaining)
                    .map((pick) => (
                      <div
                        key={pick.team.id}
                        className={`p-3 border-2 border-black flex justify-between items-center ${
                          pick.remaining > 0 ? "bg-white dark:bg-gray-900" : "bg-gray-100 dark:bg-gray-800"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <img src={pick.team.logo || "/placeholder.svg"} alt={pick.team.name} className="w-6 h-6" />
                          <span className="font-medium text-sm">{pick.team.name}</span>
                        </div>
                        <BatteryIndicator remaining={pick.remaining} />
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-muted-foreground">No team data available.</p>
                </div>
              )}
            </div>
            <div className="p-4 border-t-2 border-black">
              <Button variant="pixel" className="w-full" onClick={() => setShowTeamsModal(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {success && (
        <Alert variant="success" className="border-4 border-black">
          <CheckCircle className="h-4 w-4" />
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive" className="border-4 border-black">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="border-4 border-black">
        <CardHeader className="bg-retro-orange text-white border-b-4 border-black">
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl">
              Week {currentWeek}
              {getUserPickedTeamName() && (
                <span className="text-white/90"> - You chose {getUserPickedTeamName()}</span>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="bg-white text-black border-2 border-black"
                onClick={() => setCurrentWeek((prev) => Math.max(1, prev - 1))}
              >
                Prev
              </Button>
              <select
                value={currentWeek}
                onChange={(e) => setCurrentWeek(Number(e.target.value))}
                className="bg-white text-black border-2 border-black px-2 py-1 font-heading text-sm"
              >
                {weeks.map((week) => (
                  <option key={week} value={week}>
                    Week {week}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                size="sm"
                className="bg-white text-black border-2 border-black"
                onClick={() => setCurrentWeek((prev) => Math.min(38, prev + 1))}
              >
                Next
              </Button>
            </div>
          </div>
          <CardDescription className="text-white/80">
            {hasPickableGames() ? (
              "Choose one team for this week. Remember: You can pick each team up to twice per season!"
            ) : userPickForWeek ? (
              "You have made your pick for this week. You can change it if there are games that haven't started yet."
            ) : (
              "All games for this week have started or completed."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-[200px] w-full rounded-lg" />
              <Skeleton className="h-[200px] w-full rounded-lg" />
            </div>
          ) : games.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {games.map((game) => {
                const gameStatus = computeGameStatus(game)
                const statusDisplay = getGameStatusDisplay(gameStatus)
                const canPick = canPickFromGame(game)
                const isHomeTeamUsed = isTeamUsed(game.homeTeam.id)
                const isAwayTeamUsed = isTeamUsed(game.awayTeam.id)
                const isHomeSelected = selectedTeam === game.homeTeam.id && selectedGameId === game.id
                const isAwaySelected = selectedTeam === game.awayTeam.id && selectedGameId === game.id

                return (
                  <Card
                    key={game.id}
                    className={getGameCardClasses(game)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-lg">Match {game.id}</CardTitle>
                        {gameStatus !== "not_started" && (
                          <div className={`px-2 py-1 flex items-center gap-1 border-2 border-black ${statusDisplay.className}`}>
                            {statusDisplay.icon === "X" ? (
                              <X className="h-4 w-4" />
                            ) : (
                              <Clock className="h-4 w-4" />
                            )}
                            <span className="text-xs font-heading">{statusDisplay.label}</span>
                          </div>
                        )}
                      </div>
                      {gameStatus === "completed" && (game.homeScore !== null && game.awayScore !== null) && (
                        <div className="mt-2 text-center">
                          <div className="text-sm font-bold">
                            Final Score: {game.homeTeam.name} {game.homeScore} - {game.awayScore} {game.awayTeam.name}
                          </div>
                        </div>
                      )}
                      <CardDescription>{format(new Date(game.date), "EEEE, MMMM d, yyyy 'at' h:mm a")}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex justify-between items-center">
                        <div
                          className={getTeamSelectionClasses(game, isHomeSelected, isHomeTeamUsed)}
                          onClick={() => {
                            if (canPick && !isHomeTeamUsed) {
                              handleTeamSelect(game.id, game.homeTeam.id)
                            }
                          }}
                        >
                          <img
                            src={game.homeTeam.logo || "/placeholder.svg"}
                            alt={game.homeTeam.name}
                            className="w-12 h-12 mb-2"
                          />
                          <span className="font-medium">{game.homeTeam.name}</span>
                          <span className="text-sm">(Home)</span>
                          <BatteryIndicator remaining={getTeamRemaining(game.homeTeam.id)} className="mt-1" />
                        </div>

                        <div className="text-center">
                          <span className="text-xl font-bold font-heading">VS</span>
                        </div>

                        <div
                          className={getTeamSelectionClasses(game, isAwaySelected, isAwayTeamUsed)}
                          onClick={() => {
                            if (canPick && !isAwayTeamUsed) {
                              handleTeamSelect(game.id, game.awayTeam.id)
                            }
                          }}
                        >
                          <img
                            src={game.awayTeam.logo || "/placeholder.svg"}
                            alt={game.awayTeam.name}
                            className="w-12 h-12 mb-2"
                          />
                          <span className="font-medium">{game.awayTeam.name}</span>
                          <span className="text-sm">(Away)</span>
                          <BatteryIndicator remaining={getTeamRemaining(game.awayTeam.id)} className="mt-1" />
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter>
                      <Button
                        variant="pixel"
                        className="w-full"
                        disabled={
                          !selectedTeam ||
                          selectedGameId !== game.id ||
                          submitting ||
                          !canPick ||
                          (isHomeTeamUsed && selectedTeam === game.homeTeam.id) ||
                          (isAwayTeamUsed && selectedTeam === game.awayTeam.id)
                        }
                        onClick={() => handleSubmitPick()}
                      >
                        {submitting
                          ? "Submitting..."
                          : userPickForWeek === selectedTeam
                            ? "Change Pick"
                            : "Submit Pick"}
                      </Button>
                    </CardFooter>
                  </Card>
                )
              })}
            </div>
          ) : (
            <Card className="border-2 border-black">
              <CardContent className="text-center py-8">
                <p className="text-muted-foreground">
                  No games available for Week {currentWeek}.
                  {userPickForWeek && (
                    <span className="block mt-2 font-medium">
                      You have already picked {getUserPickedTeamName()} for this week.
                    </span>
                  )}
                </p>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function MakePicksPage() {
  return (
    <LeagueGuard>
      <MakePicksContent />
    </LeagueGuard>
  )
}
