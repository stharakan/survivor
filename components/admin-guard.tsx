"use client"

import type React from "react"

import { useEffect } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useLeague } from "@/hooks/use-league"
import { redirect } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ShieldX } from "lucide-react"

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const { currentLeague, currentMembership, isCurrentUserAdmin, loading: leagueLoading } = useLeague()

  // Debug logging
  console.log("AdminGuard Debug:", {
    user: user?.id,
    currentLeague: currentLeague?.id,
    currentMembership: currentMembership?.id,
    isAdmin: currentMembership?.isAdmin,
    isCurrentUserAdmin,
    authLoading,
    leagueLoading,
  })

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

  if (!isCurrentUserAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <Alert variant="destructive" className="border-4 border-black max-w-md">
          <ShieldX className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You need admin privileges to access this page.
            <br />
            <small className="text-xs">
              Debug: isAdmin={String(currentMembership?.isAdmin)}, league={currentLeague?.id}
            </small>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return <>{children}</>
}
