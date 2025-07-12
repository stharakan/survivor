"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useLeague } from "@/hooks/use-league"
import { getProfile, getUserPicks } from "@/lib/api"
import type { User } from "@/types/user"
import type { Pick } from "@/types/pick"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { CheckCircle2, XCircle, MinusCircle, UserIcon, Shield } from "lucide-react"
import { format } from "date-fns"
import Image from "next/image"
import { LeagueGuard } from "@/components/league-guard"

function ProfileContent() {
  const { user } = useAuth()
  const { currentLeague, currentMembership } = useLeague()
  const [profile, setProfile] = useState<User | null>(null)
  const [picks, setPicks] = useState<Pick[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      if (user && currentLeague) {
        try {
          const [profileData, picksData] = await Promise.all([
            getProfile(user.id, currentLeague.id),
            getUserPicks(user.id, currentLeague.id),
          ])
          setProfile(profileData)
          setPicks(picksData)
        } catch (error) {
          console.error("Error fetching profile data:", error)
        } finally {
          setLoading(false)
        }
      }
    }

    fetchData()
  }, [user, currentLeague])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[200px] w-full rounded-lg" />
        <Skeleton className="h-[350px] w-full rounded-lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading">My Profile</h1>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-sm text-muted-foreground">{currentLeague?.sportsLeague}</div>
            <div className="font-heading text-sm">{currentLeague?.name}</div>
          </div>
          <Image src="/images/tharakan-bros-logo.png" alt="Tharakan Bros Logo" width={60} height={60} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left box: User info */}
        <Card className="border-4 border-black">
          <CardHeader className="pb-2 bg-retro-orange text-white border-b-4 border-black">
            <CardTitle className="text-lg">Player Profile</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="bg-retro-blue p-3 rounded-none border-2 border-black">
                  <UserIcon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Username</p>
                  <p className="text-lg font-bold">{profile?.username || "Player"}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="bg-retro-green p-3 rounded-none border-2 border-black">
                  <Shield className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Team Name</p>
                  <p className="text-lg font-bold">{currentMembership?.teamName || "Team Name"}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-6">
                <div className="border-2 border-black p-3 text-center">
                  <p className="text-sm font-medium text-muted-foreground">Points</p>
                  <p className="text-2xl font-bold">{currentMembership?.points || 0}</p>
                </div>

                <div className="border-2 border-black p-3 text-center">
                  <p className="text-sm font-medium text-muted-foreground">Strikes</p>
                  <p className="text-2xl font-bold">{currentMembership?.strikes || 0}</p>
                </div>

                <div className="border-2 border-black p-3 text-center">
                  <p className="text-sm font-medium text-muted-foreground">Survived</p>
                  <p className="text-2xl font-bold">{picks.filter((p) => p.result === "win").length}</p>
                </div>
              </div>

              <div className="mt-4 border-2 border-black p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Season Progress</p>
                  <p className="text-sm font-medium">{picks.length} / 38 weeks</p>
                </div>
                <div className="w-full bg-gray-200 h-4 mt-2 border-2 border-black">
                  <div className="bg-retro-orange h-full" style={{ width: `${(picks.length / 38) * 100}%` }}></div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right box: Picks history */}
        <Card className="border-4 border-black">
          <CardHeader className="pb-2 bg-retro-orange text-white border-b-4 border-black">
            <CardTitle className="text-lg">My Picks</CardTitle>
            <CardDescription className="text-white/80">Your weekly picks for the season</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[500px] overflow-y-auto">
              {picks.length > 0 ? (
                <div className="space-y-0 divide-y-2 divide-black">
                  {picks.map((pick) => (
                    <div key={pick.id} className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <div className="font-heading text-sm bg-retro-blue text-white px-2 py-1 border-2 border-black">
                          W{pick.week}
                        </div>
                        <div className="flex items-center gap-2">
                          <img src={pick.team.logo || "/placeholder.svg"} alt={pick.team.name} className="w-8 h-8" />
                          <span className="font-medium">{pick.team.name}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {pick.result === "win" && (
                          <Badge variant="success" className="flex items-center gap-1 border-2 border-black">
                            <CheckCircle2 className="h-3 w-3" />
                            Win
                          </Badge>
                        )}
                        {pick.result === "loss" && (
                          <Badge variant="destructive" className="flex items-center gap-1 border-2 border-black">
                            <XCircle className="h-3 w-3" />
                            Loss
                          </Badge>
                        )}
                        {pick.result === "draw" && (
                          <Badge variant="outline" className="flex items-center gap-1 border-2 border-black">
                            <MinusCircle className="h-3 w-3" />
                            Draw
                          </Badge>
                        )}
                        {pick.result === null && (
                          <Badge variant="outline" className="border-2 border-black">
                            {pick.game && format(new Date(pick.game.date), "MMM d, h:mm a")}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">You haven't made any picks yet.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function ProfilePage() {
  return (
    <LeagueGuard>
      <ProfileContent />
    </LeagueGuard>
  )
}
