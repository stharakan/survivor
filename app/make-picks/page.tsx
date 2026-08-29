"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useLeague } from "@/hooks/use-league"
import { getUpcomingGamesWithPicks, makePick, getPicksRemaining, getSeasonSummary } from "@/lib/api"
import type { Game } from "@/types/game"
import type { Team } from "@/types/team"
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { format } from "date-fns"
import { CheckCircle, AlertCircle, ListChecks, X, ChevronLeft, ChevronRight, Unlock } from "lucide-react"
import { BatteryIndicator } from "@/components/ui/battery-indicator"
import {
  computeGameStatus,
  canPickFromGame,
  canChangeExistingPick,
  getGameStatusDisplay,
  getGameCardClasses,
  getTeamSelectionClasses,
  hasGameweekStarted,
  arePicksLocked,
} from "@/lib/game-utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import Link from "next/link"
import { LeagueGuard } from "@/components/league-guard"
import { Trophy, Award, Lock } from "lucide-react"

// Games within a section are sorted earliest-first by kickoff time.
const byStartTime = (a: Game, b: Game) =>
  new Date(a.startTime || a.date).getTime() - new Date(b.startTime || b.date).getTime()

function MakePicksContent() {
  const { user } = useAuth()
  const { currentLeague, currentMembership } = useLeague()
  // Explicit `=== false` (not just falsy) so we don't block while the
  // membership hasn't loaded yet -- undefined/null should not read as unpaid.
  const isUnpaid = currentMembership?.isPaid === false
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
  const [gameweekStarted, setGameweekStarted] = useState(false)
  const [picksLocked, setPicksLocked] = useState(false)
  const [isLeagueEnded, setIsLeagueEnded] = useState(false)

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
            setUserPickForWeek(userPick.userPick!.team.id)
            setSelectedTeam(userPick.userPick!.team.id)
            setSelectedGameId(userPick.id)
          } else {
            setUserPickForWeek(null)
            setSelectedTeam(null)
            setSelectedGameId(null)
          }

          // Calculate pick locking state
          const gameweekHasStarted = hasGameweekStarted(currentLeague, currentWeek)
          const hasExistingPick = !!userPick
          const locksEnabled = arePicksLocked(hasExistingPick, gameweekHasStarted)

          setGameweekStarted(gameweekHasStarted)
          setPicksLocked(locksEnabled)
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

  // Check if league has ended (only once per league, not per week change)
  useEffect(() => {
    const checkLeagueEnded = async () => {
      if (user && currentLeague) {
        try {
          const summary = await getSeasonSummary(currentLeague.id)
          setIsLeagueEnded(summary.isLeagueEnded)
        } catch (error) {
          console.error("Error fetching season summary:", error)
        }
      }
    }
    checkLeagueEnded()
  }, [user, currentLeague])

  // Keyboard shortcuts for gameweek navigation: Left/Right arrows step
  // back/forward a week. Skipped while a form control has focus (so typing
  // elsewhere on the page doesn't get hijacked) or while the teams modal is open.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showTeamsModal) return

      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return

      if (e.key === "ArrowRight") {
        setCurrentWeek((prev) => Math.min(38, prev + 1))
      } else if (e.key === "ArrowLeft") {
        setCurrentWeek((prev) => Math.max(1, prev - 1))
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [showTeamsModal])

  const handleTeamSelect = (gameId: number, teamId: number) => {
    if (isUnpaid) {
      setError("Picks are locked until your league payment is marked paid. Contact your league admin.")
      return
    }

    // Check if picks are locked due to gameweek starting
    if (picksLocked) {
      setError("Picks are locked because the gameweek has started and you already have a pick")
      return
    }

    // Check if user has existing pick and if it can be changed (existing logic)
    if (userPickForWeek) {
      const existingGame = games.find(g => g.userPick?.user === user?.id)
      if (existingGame && !canChangeExistingPick(existingGame)) {
        setError("Cannot change pick because your selected game has already started")
        return
      }
    }

    // If gameweek has started and user has no pick, only allow picks from games that haven't started
    if (gameweekStarted && !userPickForWeek) {
      const selectedGame = games.find(g => g.id === gameId)
      if (selectedGame && !canPickFromGame(selectedGame)) {
        setError("Cannot pick from this game because it has already started")
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

    if (isUnpaid) {
      setError("Picks are locked until your league payment is marked paid. Contact your league admin.")
      return
    }

    // Check if picks are locked due to gameweek starting
    if (picksLocked) {
      setError("Picks are locked because the gameweek has started and you already have a pick")
      return
    }

    // Additional validation before submit (existing logic)
    if (userPickForWeek) {
      const existingGame = games.find(g => g.userPick?.user === user?.id)
      if (existingGame && !canChangeExistingPick(existingGame)) {
        setError("Cannot change pick because your selected game has already started")
        return
      }
    }

    // If gameweek has started and user has no pick, validate selected game hasn't started
    if (gameweekStarted && !userPickForWeek) {
      const selectedGame = games.find(g => g.id === selectedGameId)
      if (selectedGame && !canPickFromGame(selectedGame)) {
        setError("Cannot pick from this game because it has already started")
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

    return gameWithPick?.userPick?.team.name || null
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

  // Bucket games by status into the three sections, each sorted earliest-first.
  const liveGames = games.filter((g) => computeGameStatus(g) === "in_progress").sort(byStartTime)
  const completedGames = games.filter((g) => computeGameStatus(g) === "completed").sort(byStartTime)
  const upcomingGames = games
    .filter((g) => {
      const status = computeGameStatus(g)
      return status === "not_started" || status === "postponed"
    })
    .sort(byStartTime)

  const renderGameCard = (game: Game) => {
    const gameStatus = computeGameStatus(game)
    const statusDisplay = getGameStatusDisplay(gameStatus)
    const canPick = canPickFromGame(game)
    const isHomeTeamUsed = isTeamUsed(game.homeTeam.id)
    const isAwayTeamUsed = isTeamUsed(game.awayTeam.id)
    const isHomeSelected = selectedTeam === game.homeTeam.id && selectedGameId === game.id
    const isAwaySelected = selectedTeam === game.awayTeam.id && selectedGameId === game.id

    return (
      <Card key={game.id} className={getGameCardClasses(game, false, picksLocked)}>
        <CardHeader className="pb-2">
          {gameStatus === "postponed" && (
            <div className="flex justify-end">
              <div className={`px-2 py-1 flex items-center gap-1 border-2 border-black ${statusDisplay.className}`}>
                <AlertCircle className="h-4 w-4" />
                <span className="text-xs font-heading">{statusDisplay.label}</span>
              </div>
            </div>
          )}
          {gameStatus === "postponed" && game.isPostponed && game.originalWeek && (
            <div className="mt-2 text-center text-xs text-muted-foreground">
              Originally week {game.originalWeek} — will be rescheduled
            </div>
          )}
          <CardDescription className="text-center">
            {gameStatus === "in_progress"
              ? "In progress"
              : gameStatus === "completed"
                ? format(new Date(game.date), "EEE, MMM d")
                : format(new Date(game.date), "EEEE, MMMM d, yyyy 'at' h:mm a")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Equal-width side columns (1fr/auto/1fr) so both team boxes are
              always the same size regardless of name length -- see
              getTeamSelectionClasses in lib/game-utils.ts for the matching
              w-full/min-h that lets them actually fill the column. */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div
              className={getTeamSelectionClasses(game, isHomeSelected, isHomeTeamUsed, picksLocked)}
              onClick={() => {
                if (canPick && !isHomeTeamUsed && !picksLocked) {
                  handleTeamSelect(game.id, game.homeTeam.id)
                }
              }}
            >
              <img
                src={game.homeTeam.logo || "/placeholder.svg"}
                alt={game.homeTeam.name}
                className="w-12 h-12 mb-2"
              />
              <span className="font-medium w-full text-center truncate" title={game.homeTeam.name}>
                {game.homeTeam.name}
              </span>
              <span className="text-sm">(Home)</span>
              <BatteryIndicator remaining={getTeamRemaining(game.homeTeam.id)} className="mt-1" />
            </div>

            <div className="text-center px-1">
              {(gameStatus === "in_progress" || gameStatus === "completed") &&
              game.homeScore !== null &&
              game.awayScore !== null ? (
                <span className="text-xl font-bold font-heading">
                  {game.homeScore}-{game.awayScore}
                </span>
              ) : (
                <span className="text-xl font-bold font-heading">VS</span>
              )}
            </div>

            <div
              className={getTeamSelectionClasses(game, isAwaySelected, isAwayTeamUsed, picksLocked)}
              onClick={() => {
                if (canPick && !isAwayTeamUsed && !picksLocked) {
                  handleTeamSelect(game.id, game.awayTeam.id)
                }
              }}
            >
              <img
                src={game.awayTeam.logo || "/placeholder.svg"}
                alt={game.awayTeam.name}
                className="w-12 h-12 mb-2"
              />
              <span className="font-medium w-full text-center truncate" title={game.awayTeam.name}>
                {game.awayTeam.name}
              </span>
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
              picksLocked ||
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
  }

  return (
    <div className="space-y-6">
      {/* Gameweek heading: lives outside the orange box now so the box can be
          reserved for the user's pick status + Available Teams button. */}
      <div className="text-center mt-2">
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous gameweek"
            className="border-2 border-black shrink-0"
            onClick={() => setCurrentWeek((prev) => Math.max(1, prev - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="font-heading text-2xl md:text-3xl">Gameweek {currentWeek}</h1>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next gameweek"
            className="border-2 border-black shrink-0"
            onClick={() => setCurrentWeek((prev) => Math.min(38, prev + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        {/* League name: only shown once there's room -- on narrow screens it
            just crowds the header. No logo here -- it's the same static
            Tharakan Bros image the navbar already shows top-left, so
            repeating it just duplicated that, not any league-specific art. */}
        <div className="hidden sm:flex items-center justify-center gap-2 mt-2">
          <span className="text-sm text-muted-foreground">{currentLeague?.sportsLeague}</span>
          <span className="text-sm text-muted-foreground">•</span>
          <span className="font-heading text-sm">{currentLeague?.name}</span>
        </div>
      </div>

      {/* League Ended Banner */}
      {isLeagueEnded && (
        <Alert className="border-4 border-red-600 bg-red-50 dark:bg-red-950">
          <Award className="h-5 w-5 text-red-600" />
          <AlertTitle className="font-heading text-red-600">League Over</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>This league has ended. All players have been eliminated.</p>
            <Link href="/results" className="inline-flex items-center gap-2 text-retro-blue hover:underline font-medium">
              <Trophy className="h-4 w-4" />
              View Season Summary & Prize Winners
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* Unpaid Banner */}
      {!isLeagueEnded && isUnpaid && (
        <Alert className="border-4 border-retro-orange bg-orange-50 dark:bg-orange-950">
          <Lock className="h-5 w-5 text-retro-orange" />
          <AlertTitle className="font-heading text-retro-orange">Payment Required</AlertTitle>
          <AlertDescription>
            Your league payment is marked unpaid, so picks are locked. Contact your league admin to get marked paid.
          </AlertDescription>
        </Alert>
      )}

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

      {isLeagueEnded ? (
        <Card className="border-4 border-black">
          <CardContent className="text-center py-12">
            <div className="text-6xl mb-4">
              <Trophy className="h-16 w-16 mx-auto text-retro-yellow" />
            </div>
            <h3 className="text-xl font-heading mb-2">Season Complete</h3>
            <p className="text-muted-foreground mb-4">
              Picks are no longer available. Check the results page for the final standings and prize winners.
            </p>
            <Link href="/results">
              <Button variant="pixel">View Season Summary</Button>
            </Link>
          </CardContent>
        </Card>
      ) : isUnpaid ? (
        <Card className="border-4 border-black">
          <CardContent className="text-center py-12">
            <div className="text-6xl mb-4">
              <Lock className="h-16 w-16 mx-auto text-retro-orange" />
            </div>
            <h3 className="text-xl font-heading mb-2">Picks Locked</h3>
            <p className="text-muted-foreground mb-4">
              Your league payment is marked unpaid. Contact your league admin to unlock picks.
            </p>
          </CardContent>
        </Card>
      ) : (
      <Card className="border-4 border-black">
        <CardHeader className="bg-retro-orange text-white border-b-4 border-black space-y-3">
          {/* Pick status: text + lock/unlock icon travel together as one
              centered unit (previously justify-between, which flung the
              lock icon out to the far edge on wide screens). */}
          <div className="flex items-center justify-center gap-2 text-center flex-wrap">
            <span className="font-heading text-sm md:text-base">
              {userPickForWeek ? (
                <>
                  Your pick:{" "}
                  <span className="text-base md:text-lg uppercase break-words">
                    {getUserPickedTeamName()}
                  </span>
                </>
              ) : (
                "No pick yet"
              )}
            </span>
            {/* Pick-status icon: reflects the gameweek/pick state, not just
                whether a pick exists -- unlocked whenever the week hasn't
                started yet, a warning once it's started with no pick, and
                locked only once a pick is made and locking has kicked in. */}
            {!gameweekStarted ? (
              <Unlock className="h-5 w-5 shrink-0" aria-label="Pick unlocked" />
            ) : !userPickForWeek ? (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="No pick made yet"
                    className="shrink-0 rounded-none focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <AlertCircle className="h-5 w-5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 text-sm border-2 border-black rounded-none">
                  ⚠️ The gameweek has started and you don't have a pick yet. You can still pick from games that haven't started.
                </PopoverContent>
              </Popover>
            ) : picksLocked ? (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Why is my pick locked?"
                    className="shrink-0 rounded-none focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <Lock className="h-5 w-5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 text-sm border-2 border-black rounded-none">
                  🔒 Picks are locked because the gameweek has started and you already have a pick for this week.
                </PopoverContent>
              </Popover>
            ) : (
              <Unlock className="h-5 w-5 shrink-0" aria-label="Pick unlocked" />
            )}
          </div>

          {/* Available Teams button */}
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              className="bg-white text-black border-2 border-black"
              onClick={() => setShowTeamsModal(true)}
            >
              <ListChecks className="h-4 w-4 mr-2" />
              Available Teams
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          {gameweekStarted && !userPickForWeek ? (
            <p className="text-xs text-muted-foreground -mt-2">
              ⚠️ The gameweek has started. You can still make your first pick, but only from games that haven't started yet.
            </p>
          ) : !picksLocked && !hasPickableGames() && userPickForWeek ? (
            <p className="text-xs text-muted-foreground -mt-2">
              You have made your pick for this week. You can change it if there are games that haven't started yet.
            </p>
          ) : !hasPickableGames() && !userPickForWeek ? (
            <p className="text-xs text-muted-foreground -mt-2">
              All games for this week have started or completed.
            </p>
          ) : null}

          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-[200px] w-full rounded-lg" />
              <Skeleton className="h-[200px] w-full rounded-lg" />
            </div>
          ) : games.length > 0 ? (
            <div className="space-y-8">
              {liveGames.length > 0 && (
                <div>
                  <h2 className="font-heading text-lg border-b-2 border-black inline-block mb-3">Live</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {liveGames.map(renderGameCard)}
                  </div>
                </div>
              )}
              {upcomingGames.length > 0 && (
                <div>
                  <h2 className="font-heading text-lg border-b-2 border-black inline-block mb-3">Upcoming</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {upcomingGames.map(renderGameCard)}
                  </div>
                </div>
              )}
              {completedGames.length > 0 && (
                <div>
                  <h2 className="font-heading text-lg border-b-2 border-black inline-block mb-3">Full Time</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {completedGames.map(renderGameCard)}
                  </div>
                </div>
              )}
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
      )}
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
