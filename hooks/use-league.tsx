"use client"

import type React from "react"
import { createContext, useContext, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import type { League, LeagueMembership } from "@/types/league"
import { getUserLeagues } from "@/lib/api-client"
import { useAuth } from "./use-auth"

// Define league context type
type LeagueContextType = {
  currentLeague: League | null
  currentMembership: LeagueMembership | null
  userLeagues: LeagueMembership[]
  selectLeague: (league: League, membership: LeagueMembership) => void
  clearLeague: () => void
  isCurrentUserAdmin: boolean
  loading: boolean
  refreshLeagues: () => Promise<void>
}

// Create league context
const LeagueContext = createContext<LeagueContextType | undefined>(undefined)

// League provider component
export function LeagueProvider({ children }: { children: React.ReactNode }) {
  const [currentLeague, setCurrentLeague] = useState<League | null>(null)
  const [currentMembership, setCurrentMembership] = useState<LeagueMembership | null>(null)
  const [userLeagues, setUserLeagues] = useState<LeagueMembership[]>([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()
  const router = useRouter()

  // Load user's leagues when user changes
  const loadUserLeagues = async () => {
    if (user) {
      try {
        setLoading(true)
        const leagues = await getUserLeagues(user.id)
        setUserLeagues(leagues)

        // Check if there's a stored league selection
        const storedLeagueId = localStorage.getItem("selectedLeagueId")
        if (storedLeagueId) {
          const storedMembership = leagues.find((m) => m.league.id === Number.parseInt(storedLeagueId))
          if (storedMembership && storedMembership.status === "active") {
            setCurrentLeague(storedMembership.league)
            setCurrentMembership(storedMembership)
          } else {
            // Clear invalid stored league
            localStorage.removeItem("selectedLeagueId")
          }
        }
      } catch (error) {
        console.error("Error loading user leagues:", error)
        // Clear any stored league on error
        localStorage.removeItem("selectedLeagueId")
      } finally {
        setLoading(false)
      }
    } else {
      setUserLeagues([])
      setCurrentLeague(null)
      setCurrentMembership(null)
      localStorage.removeItem("selectedLeagueId")
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUserLeagues()
  }, [user])

  const selectLeague = (league: League, membership: LeagueMembership) => {
    if (membership.status !== "active") {
      console.error("Cannot select league with non-active membership")
      return
    }
    setCurrentLeague(league)
    setCurrentMembership(membership)
    localStorage.setItem("selectedLeagueId", league.id.toString())
    // Use router.push instead of redirect to avoid SSR issues
    router.push("/profile")
  }

  const clearLeague = () => {
    setCurrentLeague(null)
    setCurrentMembership(null)
    localStorage.removeItem("selectedLeagueId")
    // Use router.push instead of redirect
    router.push("/leagues")
  }

  const refreshLeagues = async () => {
    await loadUserLeagues()
  }

  const isCurrentUserAdmin = currentMembership?.isAdmin || false

  return (
    <LeagueContext.Provider
      value={{
        currentLeague,
        currentMembership,
        userLeagues,
        selectLeague,
        clearLeague,
        isCurrentUserAdmin,
        loading,
        refreshLeagues,
      }}
    >
      {children}
    </LeagueContext.Provider>
  )
}

// Custom hook to use league context
export function useLeague() {
  const context = useContext(LeagueContext)
  if (context === undefined) {
    throw new Error("useLeague must be used within a LeagueProvider")
  }
  return context
}
