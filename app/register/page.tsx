"use client"

import type React from "react"

import { useState, Suspense } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useSearchParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import Image from "next/image"
import Link from "next/link"

function RegisterContent() {
  const [email, setEmail] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const { register, loading } = useAuth()
  const searchParams = useSearchParams()
  const router = useRouter()
  const redirect = searchParams.get('redirect')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    // Client-side validation
    if (password !== confirmPassword) {
      setError("Passwords don't match")
      return
    }

    try {
      await register(email, username, password, confirmPassword)
      // Redirect to the specified URL after successful registration
      if (redirect) {
        router.push(redirect)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.")
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-8">
      <div className="text-center">
        <Image
          src="/images/tharakan-bros-logo.png"
          alt="Tharakan Bros Logo"
          width={150}
          height={150}
          className="mx-auto mb-2"
        />
        <h1 className="font-heading tracking-tight">
          <span className="text-xl text-retro-orange block"></span>
          <span className="text-lg text-retro-blue block mt-1">SURVIVOR LEAGUE</span>
        </h1>
      </div>

      <Card className="w-full max-w-md border-4 border-black shadow-pixel-lg">
        <CardHeader className="bg-retro-orange text-white border-b-4 border-black">
          <CardTitle className="text-xl">Create Account</CardTitle>
          <CardDescription className="text-white/80">Join the league and start picking teams</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive" className="border-2 border-black">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="font-heading text-sm">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="border-2 border-black"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="username" className="font-heading text-sm">
                Username
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="Choose a username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="border-2 border-black"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="font-heading text-sm">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Create a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="border-2 border-black"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="font-heading text-sm">
                Confirm Password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="border-2 border-black"
              />
            </div>

            <Button type="submit" variant="pixel" className="w-full" disabled={loading}>
              {loading ? "Creating Account..." : "Create Account"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center border-t-2 border-black pt-4">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link 
              href={redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : "/login"} 
              className="text-retro-orange hover:underline font-heading"
            >
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-[80vh] gap-8">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-retro-orange"></div>
        <p className="font-pixel text-lg">Loading...</p>
      </div>
    }>
      <RegisterContent />
    </Suspense>
  )
}