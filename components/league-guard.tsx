"use client"

import type React from "react"

import { useEffect } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useLeague } from "@/hooks/use-league"
import { redirect } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"

export function LeagueGuard({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const { currentLeague, loading: leagueLoading } = useLeague()

  useEffect(() => {
    // Only redirect if we're certain about the auth and league state
    if (!authLoading && !leagueLoading) {
      if (!user) {
        redirect("/login")
        return
      }

      if (!currentLeague) {
        redirect("/leagues")
        return
      }
    }
  }, [user, currentLeague, authLoading, leagueLoading])

  if (authLoading || leagueLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    )
  }

  if (!user || !currentLeague) {
    return null
  }

  return <>{children}</>
}
