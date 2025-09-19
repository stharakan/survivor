"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useLeague } from "@/hooks/use-league"
import { getLeagueResults } from "@/lib/api-client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import Image from "next/image"
import { LeagueGuard } from "@/components/league-guard"

interface ResultsData {
  users: Array<{
    id: string
    name: string
    picks: Array<{
      week: number
      teamName: string
      result: "win" | "loss" | "draw" | null
    }>
  }>
  completedWeeks: number[]
}

function ResultsContent() {
  const { user } = useAuth()
  const { currentLeague } = useLeague()
  const [resultsData, setResultsData] = useState<ResultsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      if (user && currentLeague) {
        try {
          const data = await getLeagueResults(currentLeague.id)
          setResultsData(data)
        } catch (error) {
          console.error("Error fetching results data:", error)
        } finally {
          setLoading(false)
        }
      }
    }

    fetchData()
  }, [user, currentLeague])

  const getPickCellClassName = (result: "win" | "loss" | "draw" | null) => {
    switch (result) {
      case "win":
        return "bg-green-500 text-white"
      case "loss":
        return "bg-red-500 text-white"
      case "draw":
        return "bg-yellow-500 text-black"
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading">League Results</h1>
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
          <CardTitle>Pick Results by Week</CardTitle>
          <CardDescription>
            Complete history of all players' picks and their outcomes
          </CardDescription>
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
          ) : !resultsData || resultsData.completedWeeks.length === 0 ? (
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
                            title={`Week ${pick.week}: ${pick.teamName} (${pick.result || 'No result'})`}
                          >
                            <div className="font-medium">{pick.teamName}</div>
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
                  <div className="w-4 h-4 bg-gray-100 dark:bg-gray-800 border border-black"></div>
                  <span className="text-sm">No Pick</span>
                </div>
              </div>
            </div>
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