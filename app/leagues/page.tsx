"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useLeague } from "@/hooks/use-league"
import { getAllLeagues, requestToJoinLeague } from "@/lib/api"
import type { League } from "@/types/league"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Users, Trophy, Calendar, Plus, Clock, CheckCircle } from "lucide-react"
import { redirect } from "next/navigation"
import Image from "next/image"

export default function LeagueSelectionPage() {
  const { user, loading: authLoading } = useAuth()
  const { userLeagues, selectLeague, loading: leagueLoading } = useLeague()
  const [allLeagues, setAllLeagues] = useState<League[]>([])
  const [loadingLeagues, setLoadingLeagues] = useState(false)
  const [joinRequests, setJoinRequests] = useState<Record<number, "pending" | "success" | "error">>({})

  useEffect(() => {
    if (!authLoading && !user) {
      redirect("/login")
    }
  }, [user, authLoading])

  useEffect(() => {
    const fetchAllLeagues = async () => {
      setLoadingLeagues(true)
      try {
        const leagues = await getAllLeagues()
        setAllLeagues(leagues)
      } catch (error) {
        console.error("Error fetching leagues:", error)
      } finally {
        setLoadingLeagues(false)
      }
    }

    if (user) {
      fetchAllLeagues()
    }
  }, [user])

  const handleJoinRequest = async (league: League) => {
    if (!user) return

    setJoinRequests((prev) => ({ ...prev, [league.id]: "pending" }))

    try {
      await requestToJoinLeague(league.id, user.id, `${user.username}'s Team`)
      setJoinRequests((prev) => ({ ...prev, [league.id]: "success" }))
    } catch (error) {
      console.error("Error requesting to join league:", error)
      setJoinRequests((prev) => ({ ...prev, [league.id]: "error" }))
    }
  }

  if (authLoading || leagueLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] gap-8">
        <Skeleton className="h-[200px] w-[200px] rounded-lg" />
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-6xl">
          <Skeleton className="h-[300px] w-full rounded-lg" />
          <Skeleton className="h-[300px] w-full rounded-lg" />
          <Skeleton className="h-[300px] w-full rounded-lg" />
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  const getUserMembershipStatus = (leagueId: number) => {
    return userLeagues.find((membership) => membership.league.id === leagueId)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-8">
      <div className="text-center space-y-6">
        <div className="relative">
          <Image
            src="/images/tharakan-bros-logo.png"
            alt="Tharakan Bros Logo"
            width={200}
            height={200}
            className="mx-auto"
          />
          <h1 className="font-heading tracking-tight mt-4">
            <span className="text-2xl md:text-3xl text-retro-orange block">SELECT LEAGUE</span>
          </h1>
        </div>
        <p className="text-xl max-w-md mx-auto font-pixel">
          Choose which Survivor League you want to enter
          <span className="animate-blink">_</span>
        </p>
      </div>

      {/* All Leagues */}
      <div className="w-full max-w-6xl">
        <h2 className="text-xl font-heading mb-4 text-center">All Leagues</h2>

        {loadingLeagues ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Skeleton className="h-[300px] w-full rounded-lg" />
            <Skeleton className="h-[300px] w-full rounded-lg" />
            <Skeleton className="h-[300px] w-full rounded-lg" />
          </div>
        ) : allLeagues.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {allLeagues.map((league) => {
              const membership = getUserMembershipStatus(league.id)
              const requestStatus = joinRequests[league.id]

              return (
                <Card
                  key={league.id}
                  className={`border-4 shadow-pixel hover:shadow-pixel-lg transition-all ${
                    membership?.status === "active"
                      ? "border-green-500"
                      : membership?.status === "pending"
                        ? "border-yellow-500"
                        : "border-black"
                  }`}
                >
                  <CardHeader
                    className={`text-white border-b-4 border-black ${
                      membership?.status === "active"
                        ? "bg-green-600"
                        : membership?.status === "pending"
                          ? "bg-yellow-500 text-black"
                          : "bg-retro-blue"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xl">{league.name}</CardTitle>
                      <div className="flex flex-col gap-1">
                        {membership?.status === "active" && (
                          <Badge variant="outline" className="bg-white text-green-600 border-green-600 text-xs">
                            MEMBER
                          </Badge>
                        )}
                        {membership?.status === "pending" && (
                          <Badge variant="outline" className="bg-white text-yellow-600 border-yellow-600 text-xs">
                            PENDING
                          </Badge>
                        )}
                        {membership?.isAdmin && (
                          <Badge variant="outline" className="bg-yellow-500 text-black border-black text-xs">
                            ADMIN
                          </Badge>
                        )}
                      </div>
                    </div>
                    <CardDescription className={membership?.status === "pending" ? "text-black/80" : "text-white/80"}>
                      {league.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Trophy className="h-5 w-5 text-retro-yellow" />
                        <span className="font-medium">{league.sportsLeague}</span>
                        <span className="text-sm text-muted-foreground">• {league.season}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-retro-blue" />
                        <span className="text-sm">{league.memberCount} players</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-retro-green" />
                        <span className="text-sm">{league.isActive ? "Active Season" : "Season Ended"}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge variant={league.isPublic ? "success" : "outline"} className="border-2 border-black">
                          {league.isPublic ? "PUBLIC" : "PRIVATE"}
                        </Badge>
                        {league.requiresApproval && (
                          <Badge variant="outline" className="border-2 border-black">
                            APPROVAL REQUIRED
                          </Badge>
                        )}
                      </div>

                      {/* Member-specific info */}
                      {membership?.status === "active" && (
                        <div className="border-2 border-black p-3 bg-gray-50 dark:bg-gray-800">
                          <div className="text-sm font-medium text-muted-foreground mb-2">Your Team</div>
                          <div className="font-bold">{membership.teamName}</div>
                          <div className="flex justify-between mt-2 text-sm">
                            <span>
                              Points: <strong>{membership.points}</strong>
                            </span>
                            <span>
                              Strikes: <strong>{membership.strikes}</strong>
                            </span>
                            <span>
                              Rank: <strong>#{membership.rank}</strong>
                            </span>
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-sm">Payment:</span>
                            <Badge variant={membership.isPaid ? "success" : "destructive"} className="text-xs">
                              {membership.isPaid ? "PAID" : "UNPAID"}
                            </Badge>
                          </div>
                        </div>
                      )}

                      {membership?.status === "pending" && (
                        <Alert className="border-2 border-black">
                          <Clock className="h-4 w-4" />
                          <AlertDescription>Your request is pending admin review.</AlertDescription>
                        </Alert>
                      )}

                      {/* Action Button */}
                      {membership?.status === "active" ? (
                        <Button
                          variant="pixel"
                          className="w-full"
                          onClick={() => selectLeague(league, membership)}
                          disabled={!league.isActive}
                        >
                          {league.isActive ? "Enter League" : "Season Ended"}
                        </Button>
                      ) : membership?.status === "pending" ? (
                        <Button variant="outline" className="w-full border-2 border-black bg-transparent" disabled>
                          <Clock className="h-4 w-4 mr-2" />
                          Request Pending
                        </Button>
                      ) : requestStatus === "success" ? (
                        <Alert variant="success" className="border-2 border-black">
                          <CheckCircle className="h-4 w-4" />
                          <AlertDescription>Join request submitted successfully!</AlertDescription>
                        </Alert>
                      ) : requestStatus === "error" ? (
                        <Alert variant="destructive" className="border-2 border-black">
                          <AlertDescription>Failed to submit request. Try again.</AlertDescription>
                        </Alert>
                      ) : (
                        <Button
                          variant="pixel"
                          className="w-full"
                          disabled={requestStatus === "pending" || !league.isActive}
                          onClick={() => handleJoinRequest(league)}
                        >
                          {requestStatus === "pending" ? (
                            <>
                              <Clock className="h-4 w-4 mr-2" />
                              Requesting...
                            </>
                          ) : !league.isActive ? (
                            "Season Ended"
                          ) : (
                            <>
                              <Plus className="h-4 w-4 mr-2" />
                              Ask to Join
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        ) : (
          <Card className="border-4 border-black shadow-pixel max-w-md mx-auto">
            <CardContent className="text-center py-8">
              <p className="text-muted-foreground mb-4">No leagues available at the moment.</p>
              <Button variant="outline" className="border-2 border-black bg-transparent">
                Create New League
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
