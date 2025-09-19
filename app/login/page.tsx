"use client"

import type React from "react"

import { useState, useEffect, Suspense } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useSearchParams, useRouter } from "next/navigation"
import { getSafeRedirectUrl } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import Image from "next/image"
import Link from "next/link"

function LoginContent() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const { login, loading } = useAuth()
  const searchParams = useSearchParams()
  const router = useRouter()
  const redirect = searchParams.get('redirect')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    try {
      await login(email, password)
      // Redirect to the specified URL after successful login (with security validation)
      const safeRedirectUrl = getSafeRedirectUrl(redirect)
      router.push(safeRedirectUrl)
    } catch (err) {
      setError("Invalid email or password. Please try again.")
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
          <CardTitle className="text-xl">Login</CardTitle>
          <CardDescription className="text-white/80">Enter your credentials to access your account</CardDescription>
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
              <Label htmlFor="password" className="font-heading text-sm">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="border-2 border-black"
              />
            </div>

            <Button type="submit" variant="pixel" className="w-full" disabled={loading}>
              {loading ? "Logging in..." : "Login"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center border-t-2 border-black pt-4">
          <p className="text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link 
              href={redirect ? `/register?redirect=${encodeURIComponent(redirect)}` : "/register"} 
              className="text-retro-orange hover:underline font-heading"
            >
              Sign up
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-[80vh] gap-8">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-retro-orange"></div>
        <p className="font-pixel text-lg">Loading...</p>
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}
