"use client"

import type React from "react"

import { createContext, useContext, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

// Define user type
type User = {
  id: number
  username: string
  email: string
}

// Define auth context type
type AuthContextType = {
  user: User | null
  login: (email: string, password: string) => Promise<void>
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
        // In a real app, you would verify the token with your backend
        const storedUser = localStorage.getItem("user")
        if (storedUser) {
          setUser(JSON.parse(storedUser))
        }
      } catch (error) {
        console.error("Authentication error:", error)
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
      // In a real app, you would make an API call to your Django backend
      // For demo purposes, we'll simulate a successful login
      const mockUser = {
        id: 1,
        username: "demo_user",
        email: email,
      }

      // Store user in localStorage
      localStorage.setItem("user", JSON.stringify(mockUser))
      setUser(mockUser)
      router.push("/leagues")
    } catch (error) {
      console.error("Login error:", error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  // Logout function
  const logout = () => {
    localStorage.removeItem("user")
    localStorage.removeItem("selectedLeagueId")
    setUser(null)
    router.push("/")
  }

  return <AuthContext.Provider value={{ user, login, logout, loading }}>{children}</AuthContext.Provider>
}

// Custom hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
