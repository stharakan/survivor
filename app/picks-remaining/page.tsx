"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { getPicksRemaining } from "@/lib/api"
import type { Team } from "@/types/team"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { redirect } from "next/navigation"
import Image from "next/image"

type PickRemaining = {
  team: Team
  remaining: number
}

export default function PicksRemainingPage() {
  const { user, loading: authLoading } = useAuth()
  const [picksRemaining, setPicksRemaining] = useState<PickRemaining[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!authLoading && !user) {
      redirect("/login")
    }

    const fetchData = async () => {
      if (user) {
        try {
          const data = await getPicksRemaining(user.id)
          setPicksRemaining(data)
        } catch (error) {
          console.error("Error fetching picks remaining data:", error)
        } finally {
          setLoading(false)
        }
      }
    }

    if (user) {
      fetchData()
    }
  }, [user, authLoading])

  if (authLoading) {
    return <div>Loading...</div>
  }

  if (!user) {
    return null // Redirect handled in useEffect
  }

  // Sort teams by availability (available first)
  const sortedPicks = [...picksRemaining].sort((a, b) => b.remaining - a.remaining)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading">Available Teams</h1>
        <Image src="/images/tharakan-bros-logo.png" alt="Tharakan Bros Logo" width={60} height={60} />
      </div>

      <Card>
        <CardHeader className="bg-retro-orange text-white border-b-4 border-black">
          <CardTitle>Teams You Can Still Pick</CardTitle>
          <CardDescription className="text-white/80">
            In Survivor League, you can only pick each team once per season
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {loading ? (
            <div className="space-y-6">
              <Skeleton className="h-[50px] w-full" />
              <Skeleton className="h-[50px] w-full" />
              <Skeleton className="h-[50px] w-full" />
              <Skeleton className="h-[50px] w-full" />
              <Skeleton className="h-[50px] w-full" />
              <Skeleton className="h-[50px] w-full" />
              <Skeleton className="h-[50px] w-full" />
              <Skeleton className="h-[50px] w-full" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sortedPicks.map((pick) => (
                <div
                  key={pick.team.id}
                  className={`p-4 border-2 border-black ${pick.remaining > 0 ? "bg-white" : "bg-gray-100 dark:bg-gray-800"}`}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <img src={pick.team.logo || "/placeholder.svg"} alt={pick.team.name} className="w-8 h-8" />
                      <span className="font-medium">{pick.team.name}</span>
                    </div>
                    <span
                      className={`font-bold ${pick.remaining > 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}
                    >
                      {pick.remaining > 0 ? "Available" : "Used"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
