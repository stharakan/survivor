"use client"

import type React from "react"

import { createContext, useContext, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { loginUser, registerUser, logoutUser, verifyUser } from "@/lib/api-client"
import type { User } from "@/types/user"

// Define auth context type
type AuthContextType = {
  user: User | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, username: string, password: string, confirmPassword: string) => Promise<void>
  logout: () => void
  loading: boolean
}

// Create auth context
const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Auth provider component
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  // Check if user is logged in on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Verify token with backend API
        const { user } = await verifyUser()
        setUser(user)
      } catch (error) {
        console.error("Authentication error:", error)
        // Clear any stale auth state
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [])

  // Login function
  const login = async (email: string, password: string) => {
    setLoading(true)
    try {
      // Call the real API
      const { user } = await loginUser(email, password)
      setUser(user)
      router.push("/leagues")
    } catch (error) {
      console.error("Login error:", error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  // Register function
  const register = async (email: string, username: string, password: string, confirmPassword: string) => {
    setLoading(true)
    try {
      // Call the register API
      const { user } = await registerUser(email, username, password, confirmPassword)
      setUser(user)
      router.push("/leagues")
    } catch (error) {
      console.error("Registration error:", error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  // Logout function
  const logout = async () => {
    try {
      await logoutUser()
    } catch (error) {
      console.error("Logout error:", error)
    }
    
    // Clear local state regardless of API call success
    localStorage.removeItem("selectedLeagueId")
    setUser(null)
    router.push("/")
  }

  return <AuthContext.Provider value={{ user, login, register, logout, loading }}>{children}</AuthContext.Provider>
}

// Custom hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
