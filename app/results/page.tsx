"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useLeague } from "@/hooks/use-league"
import { getLeagueResults, getSeasonSummary } from "@/lib/api-client"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { LeagueGuard } from "@/components/league-guard"
import { SubtabNav } from "@/components/subtab-nav"
import { Trophy, Medal, Shield, Star } from "lucide-react"
import type { SeasonSummary, PrizeWinner } from "@/types/season-summary"

interface ResultsData {
  users: Array<{
    id: string
    name: string
    picks: Array<{
      week: number
      teamName: string
      result: "win" | "loss" | "draw" | "dnp" | null
    }>
  }>
  completedWeeks: number[]
}

type TabId = "pick-history" | "season-summary"

// Ordered subtabs, navigated via the arrow stepper (see SubtabNav).
const RESULTS_TABS: { id: TabId; label: string }[] = [
  { id: "pick-history", label: "Pick History" },
  { id: "season-summary", label: "Season Summary" },
]

const prizeIcons: Record<string, React.ReactNode> = {
  trophy: <Trophy className="h-8 w-8" />,
  medal: <Medal className="h-8 w-8" />,
  shield: <Shield className="h-8 w-8" />,
  star: <Star className="h-8 w-8" />,
}

const prizeColors: Record<string, string> = {
  first_place: "border-retro-yellow bg-yellow-50 dark:bg-yellow-950 text-retro-yellow",
  second_place: "border-gray-400 bg-gray-50 dark:bg-gray-900 text-gray-500",
  longest_survivor: "border-retro-green bg-green-50 dark:bg-green-950 text-retro-green",
  highest_total_points: "border-retro-blue bg-blue-50 dark:bg-blue-950 text-retro-blue",
}

function PrizeCard({ prize }: { prize: PrizeWinner }) {
  const colorClass = prizeColors[prize.prize] || "border-black bg-white text-black"
  const icon = prizeIcons[prize.icon] || <Trophy className="h-8 w-8" />

  return (
    <Card className={`border-4 ${colorClass}`}>
      <CardContent className="p-6 text-center">
        <div className="mb-3">{icon}</div>
        <h3 className="font-heading text-sm mb-2">{prize.prizeName}</h3>
        <p className="font-bold text-lg text-foreground mb-1">{prize.playerName}</p>
        <p className="text-sm text-muted-foreground">{prize.stat}</p>
        {prize.payout && (
          <Badge variant="outline" className="mt-2 border-2 border-black">
            {prize.payout}
          </Badge>
        )}
      </CardContent>
    </Card>
  )
}

function ResultsContent() {
  const { user } = useAuth()
  const { currentLeague } = useLeague()
  const [resultsData, setResultsData] = useState<ResultsData | null>(null)
  const [seasonSummary, setSeasonSummary] = useState<SeasonSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>("pick-history")

  useEffect(() => {
    const fetchData = async () => {
      if (user && currentLeague) {
        try {
          const [resultsRes, summaryRes] = await Promise.all([
            getLeagueResults(currentLeague.id),
            getSeasonSummary(currentLeague.id).catch(() => null),
          ])
          setResultsData(resultsRes)
          setSeasonSummary(summaryRes)

          // Default to Season Summary tab when league has ended
          if (summaryRes?.isLeagueEnded) {
            setActiveTab("season-summary")
          }
        } catch (error) {
          console.error("Error fetching results data:", error)
        } finally {
          setLoading(false)
        }
      }
    }

    fetchData()
  }, [user, currentLeague])

  const getPickCellClassName = (result: "win" | "loss" | "draw" | "dnp" | null) => {
    switch (result) {
      case "win":
        return "bg-green-500 text-white"
      case "loss":
        return "bg-red-500 text-white"
      case "draw":
        return "bg-yellow-500 text-black"
      case "dnp":
        return "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200"
      default:
        return "bg-gray-100 dark:bg-gray-800 text-muted-foreground"
    }
  }

  const EmptyState = () => (
    <div className="text-center py-16">
      <div className="text-6xl mb-4">📊</div>
      <h3 className="text-xl font-heading mb-2">No Results Yet</h3>
      <p className="text-muted-foreground">
        Results will appear here once gameweeks are completed.
      </p>
    </div>
  )

  const PickHistoryTab = () => (
    <>
      {!resultsData || resultsData.completedWeeks.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="relative">
          {/* Container for horizontal scrolling */}
          <div className="overflow-x-auto">
            <div className="min-w-full">
              {/* Sticky header */}
              <div className="results-sticky-header bg-background border-b-2 border-black">
                <div className="flex">
                  {/* Player name column header */}
                  <div className="flex-shrink-0 w-48 p-3 font-heading text-left border-r-2 border-black bg-retro-orange text-white">
                    Player
                  </div>
                  {/* Week columns headers */}
                  {resultsData.completedWeeks.map((week) => (
                    <div
                      key={week}
                      className="flex-shrink-0 w-32 p-3 text-center font-heading border-r-2 border-black bg-retro-orange text-white"
                    >
                      Week {week}
                    </div>
                  ))}
                </div>
              </div>

              {/* Data rows */}
              <div className="divide-y-2 divide-black">
                {resultsData.users.map((user) => (
                  <div key={user.id} className="flex hover:bg-accent/50">
                    {/* Player name column */}
                    <div className="flex-shrink-0 w-48 p-3 font-medium border-r-2 border-black bg-background">
                      {user.name}
                    </div>
                    {/* Pick columns */}
                    {user.picks.map((pick) => (
                      <div
                        key={pick.week}
                        className={`flex-shrink-0 w-32 p-3 text-center text-xs border-r-2 border-black flex items-center justify-center ${getPickCellClassName(
                          pick.result
                        )}`}
                        title={`Week ${pick.week}: ${pick.teamName} (${pick.result === "dnp" ? "DNP - game postponed" : pick.result || 'No result'})`}
                      >
                        <div className="font-medium">{pick.result === "dnp" ? "DNP" : pick.teamName}</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="mt-6 flex flex-wrap gap-4 justify-center">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-500 border border-black"></div>
              <span className="text-sm">Win</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-yellow-500 border border-black"></div>
              <span className="text-sm">Draw</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-500 border border-black"></div>
              <span className="text-sm">Loss</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-amber-100 dark:bg-amber-900/40 border border-black"></div>
              <span className="text-sm">DNP (Postponed)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-100 dark:bg-gray-800 border border-black"></div>
              <span className="text-sm">No Pick</span>
            </div>
          </div>
        </div>
      )}
    </>
  )

  const SeasonSummaryTab = () => {
    if (!seasonSummary) {
      return (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">📊</div>
          <h3 className="text-xl font-heading mb-2">Season Summary Not Available</h3>
          <p className="text-muted-foreground">
            The season summary will be available once the league has ended.
          </p>
        </div>
      )
    }

    return (
      <div className="space-y-8">
        {/* Prize Winners */}
        {seasonSummary.prizes.length > 0 && (
          <div>
            <h3 className="text-lg font-heading mb-4 text-center">
              {seasonSummary.isLeagueEnded ? "Prize Winners" : "Current Prize Leaders"}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {seasonSummary.prizes.map((prize) => (
                <PrizeCard key={prize.prize} prize={prize} />
              ))}
            </div>
          </div>
        )}

        {/* Final Standings Table */}
        {seasonSummary.standings.length > 0 && (
          <div>
            <h3 className="text-lg font-heading mb-4 text-center">
              {seasonSummary.isLeagueEnded ? "Final Standings" : "Current Standings"}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-retro-orange text-white border-b-2 border-black">
                    <th className="p-3 text-left font-heading border-r-2 border-black">Rank</th>
                    <th className="p-3 text-left font-heading border-r-2 border-black">Player</th>
                    <th className="p-3 text-center font-heading border-r-2 border-black">Pts (Elim)</th>
                    <th className="p-3 text-center font-heading border-r-2 border-black">Total Pts</th>
                    <th className="p-3 text-center font-heading border-r-2 border-black">Strikes</th>
                    <th className="p-3 text-center font-heading">Week Out</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-black">
                  {seasonSummary.standings.map((player) => (
                    <tr key={player.userId} className="hover:bg-accent/50">
                      <td className="p-3 border-r-2 border-black">
                        <div className="flex items-center gap-2">
                          {player.rank === 1 && <Trophy className="h-4 w-4 text-retro-yellow" />}
                          {player.rank === 2 && <Medal className="h-4 w-4 text-gray-400" />}
                          <span className="font-heading">#{player.rank}</span>
                        </div>
                      </td>
                      <td className="p-3 font-medium border-r-2 border-black">{player.playerName}</td>
                      <td className="p-3 text-center border-r-2 border-black font-bold">{player.pointsAtElimination}</td>
                      <td className="p-3 text-center border-r-2 border-black">{player.totalPoints}</td>
                      <td className="p-3 text-center border-r-2 border-black">
                        <span className={player.strikes >= 2 ? "text-red-500 font-bold" : ""}>
                          {player.strikes}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {player.weekEliminated ? (
                          <Badge variant="destructive" className="border-2 border-black">
                            Week {player.weekEliminated}
                          </Badge>
                        ) : (
                          <Badge variant="success" className="border-2 border-black">
                            Active
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    )
  }

  const tabIndex = RESULTS_TABS.findIndex((t) => t.id === activeTab)
  const prevTab = tabIndex > 0 ? RESULTS_TABS[tabIndex - 1] : undefined
  const nextTab = tabIndex < RESULTS_TABS.length - 1 ? RESULTS_TABS[tabIndex + 1] : undefined

  return (
    <div className="space-y-6">
      {/* Subtab stepper: current subtab is the heading, arrows step between
          subtabs (mirrors the make-picks gameweek nav). */}
      <SubtabNav
        title={RESULTS_TABS[tabIndex].label}
        prevLabel={prevTab?.label}
        nextLabel={nextTab?.label}
        onPrev={prevTab ? () => setActiveTab(prevTab.id) : undefined}
        onNext={nextTab ? () => setActiveTab(nextTab.id) : undefined}
      />

      {/* League line */}
      <div className="flex items-center justify-center gap-2">
        <span className="text-sm text-muted-foreground">{currentLeague?.sportsLeague}</span>
        <span className="text-sm text-muted-foreground">•</span>
        <span className="font-heading text-sm">{currentLeague?.name}</span>
      </div>

      {/* Tab Content -- heading lives in the stepper above, so no card header. */}
      <Card className="border-4 border-black">
        <CardContent className="pt-6">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : activeTab === "pick-history" ? (
            <PickHistoryTab />
          ) : (
            <SeasonSummaryTab />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function ResultsPage() {
  return (
    <LeagueGuard>
      <ResultsContent />
    </LeagueGuard>
  )
}
