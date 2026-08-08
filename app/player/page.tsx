"use client"

import { Suspense, useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useLeague } from "@/hooks/use-league"
import { getPlayerProfile } from "@/lib/api"
import type { PlayerProfile } from "@/types/player-profile"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { UserIcon, Shield, ArrowLeft } from "lucide-react"
import { useSearchParams, useRouter } from "next/navigation"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { LeagueGuard } from "@/components/league-guard"

// CR-106 AC4: was app/player/[id]/page.tsx. Static export requires every
// dynamic route segment to be resolvable via generateStaticParams() at build
// time, which is impossible for a player id that only exists at runtime.
// Moved to a query-string route (`/player?id=...`) -- no path-style links to
// this page were circulating.
//
// The picks-history card/progress-bar UI that used to live here has been
// dropped entirely: it called getUserPicks for another user, but picks are
// self-only per CR-105-FINDINGS.md Addendum 2's privacy boundary, and there's
// no public route to build that view from. getPlayerProfile returns a public
// PlayerProfile (no pick history) instead of the old permanently-throwing
// Player stub.
function PlayerProfileContent() {
  const { user } = useAuth()
  const { currentLeague } = useLeague()
  const [player, setPlayer] = useState<PlayerProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const searchParams = useSearchParams()
  const router = useRouter()
  const playerId = searchParams.get("id") ?? ""

  useEffect(() => {
    const fetchData = async () => {
      if (user && currentLeague && playerId) {
        try {
          const playerData = await getPlayerProfile(playerId, String(currentLeague.id))

          if (playerData) {
            setPlayer(playerData)
          } else {
            // Player not found
            router.push("/scoreboard")
          }
        } catch (error) {
          console.error("Error fetching player data:", error)
        } finally {
          setLoading(false)
        }
      }
    }

    fetchData()
  }, [user, currentLeague, playerId, router])

  const handleBackClick = () => {
    router.push("/scoreboard")
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[200px] w-full rounded-lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handleBackClick} className="border-2 border-black">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-heading">{player?.name || "Player"} Profile</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-sm text-muted-foreground">{currentLeague?.sportsLeague}</div>
            <div className="font-heading text-sm">{currentLeague?.name}</div>
          </div>
          <Image src="/images/tharakan-bros-logo.png" alt="Tharakan Bros Logo" width={60} height={60} />
        </div>
      </div>

      <Card className="border-4 border-black max-w-2xl">
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
                <p className="text-lg font-bold">{player?.name || "Player"}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="bg-retro-green p-3 rounded-none border-2 border-black">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Team Name</p>
                <p className="text-lg font-bold">{player?.teamName || "-"}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mt-6">
              <div className="border-2 border-black p-3 text-center">
                <p className="text-sm font-medium text-muted-foreground">Points</p>
                <p className="text-2xl font-bold">{player?.points || 0}</p>
              </div>

              <div className="border-2 border-black p-3 text-center">
                <p className="text-sm font-medium text-muted-foreground">Strikes</p>
                <p className="text-2xl font-bold">{player?.strikes || 0}</p>
              </div>

              <div className="border-2 border-black p-3 text-center">
                <p className="text-sm font-medium text-muted-foreground">Rank</p>
                <p className="text-2xl font-bold">#{player?.rank || "-"}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function PlayerProfilePage() {
  return (
    <LeagueGuard>
      <Suspense fallback={
        <div className="space-y-4">
          <Skeleton className="h-[200px] w-full rounded-lg" />
        </div>
      }>
        <PlayerProfileContent />
      </Suspense>
    </LeagueGuard>
  )
}
