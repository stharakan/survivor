"use client"

import type React from "react"

import { AuthProvider } from "@/hooks/use-auth"
import { LeagueProvider } from "@/hooks/use-league"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <LeagueProvider>{children}</LeagueProvider>
    </AuthProvider>
  )
}
