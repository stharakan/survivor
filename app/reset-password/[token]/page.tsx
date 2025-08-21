"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import type { PasswordResetValidationInfo } from "@/types/password-reset"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { KeyRound, AlertCircle, CheckCircle, XCircle, Eye, EyeOff } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

export default function PasswordResetPage() {
  const params = useParams()
  const token = params.token as string
  const router = useRouter()
  
  const [resetInfo, setResetInfo] = useState<PasswordResetValidationInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const fetchResetInfo = async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/reset-password/${token}`)
        const data = await response.json()
        
        if (data.success) {
          setResetInfo(data.data)
        } else {
          setError(data.error || 'Password reset token not found')
        }
      } catch (error) {
        console.error("Error fetching reset info:", error)
        setError('Failed to load password reset information')
      } finally {
        setLoading(false)
      }
    }

    if (token) {
      fetchResetInfo()
    }
  }, [token])

  const handlePasswordReset = async () => {
    if (!resetInfo) return
    
    if (!newPassword.trim()) {
      setError('Please enter a new password')
      return
    }
    
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    
    setResetting(true)
    setError(null)
    
    try {
      const response = await fetch(`/api/reset-password/${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          newPassword,
          confirmPassword
        }),
      })
      
      const data = await response.json()
      
      if (data.success) {
        setSuccess(true)
        // Redirect to login after a short delay
        setTimeout(() => {
          router.push('/login?message=Password reset successful')
        }, 3000)
      } else {
        setError(data.error || 'Failed to reset password')
      }
    } catch (error) {
      console.error("Error resetting password:", error)
      setError('Failed to reset password')
    } finally {
      setResetting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] gap-8">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-retro-orange"></div>
        <p className="font-pixel text-lg">Loading password reset...</p>
      </div>
    )
  }

  if (error && !resetInfo) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] gap-8">
        <div className="text-center space-y-6">
          <Image
            src="/images/tharakan-bros-logo.png"
            alt="Tharakan Bros Logo"
            width={200}
            height={200}
            className="mx-auto"
          />
          <h1 className="font-heading tracking-tight">
            <span className="text-2xl md:text-3xl text-retro-red block">RESET ERROR</span>
          </h1>
        </div>
        
        <Card className="border-4 border-red-500 shadow-pixel max-w-md mx-auto">
          <CardHeader className="bg-red-500 text-white border-b-4 border-black">
            <CardTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5" />
              Invalid Reset Link
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <Alert variant="destructive" className="border-2 border-black mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-4">
                The password reset link may have expired or is no longer valid.
              </p>
              <Link href="/login">
                <Button variant="pixel" className="w-full">
                  Return to Login
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!resetInfo) {
    return null
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] gap-8">
        <div className="text-center space-y-6">
          <Image
            src="/images/tharakan-bros-logo.png"
            alt="Tharakan Bros Logo"
            width={200}
            height={200}
            className="mx-auto"
          />
          <h1 className="font-heading tracking-tight">
            <span className="text-2xl md:text-3xl text-retro-green block">SUCCESS!</span>
          </h1>
        </div>
        
        <Card className="border-4 border-green-500 shadow-pixel max-w-md mx-auto">
          <CardHeader className="bg-green-500 text-white border-b-4 border-black">
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Password Reset Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 text-center">
            <p className="font-pixel mb-4">
              Your password has been reset successfully!
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Redirecting you to the login page...
            </p>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto"></div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!resetInfo.token.isValid) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] gap-8">
        <div className="text-center space-y-6">
          <Image
            src="/images/tharakan-bros-logo.png"
            alt="Tharakan Bros Logo"
            width={200}
            height={200}
            className="mx-auto"
          />
          <h1 className="font-heading tracking-tight">
            <span className="text-2xl md:text-3xl text-retro-red block">RESET UNAVAILABLE</span>
          </h1>
        </div>

        <Card className="border-4 border-red-500 shadow-pixel max-w-md mx-auto">
          <CardHeader className="bg-red-500 text-white border-b-4 border-black">
            <CardTitle>Reset Link Invalid</CardTitle>
            <CardDescription className="text-white/80">
              This password reset link cannot be used
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <Alert variant="destructive" className="border-2 border-black mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {resetInfo.token.isExpired 
                  ? "This password reset link has expired" 
                  : resetInfo.token.isUsed
                  ? "This password reset link has already been used"
                  : "This password reset link is no longer valid"
                }
              </AlertDescription>
            </Alert>

            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-4">
                Please contact your league administrator to generate a new password reset link.
              </p>
              <Link href="/login">
                <Button variant="outline" className="border-2 border-black bg-transparent" size="sm">
                  Return to Login
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-8">
      <div className="text-center space-y-6">
        <Image
          src="/images/tharakan-bros-logo.png"
          alt="Tharakan Bros Logo"
          width={200}
          height={200}
          className="mx-auto"
        />
        <h1 className="font-heading tracking-tight">
          <span className="text-2xl md:text-3xl text-retro-blue block">RESET PASSWORD</span>
        </h1>
      </div>

      <Card className="border-4 border-black shadow-pixel max-w-md mx-auto">
        <CardHeader className="bg-retro-blue text-white border-b-4 border-black">
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Reset Your Password
          </CardTitle>
          <CardDescription className="text-white/80">
            Set a new password for {resetInfo.user.username}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                League: <strong>{resetInfo.league.name}</strong>
              </p>
              <p className="text-sm text-muted-foreground">
                Account: <strong>{resetInfo.user.email}</strong>
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="new-password">New Password</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="border-2 border-black pr-10"
                    placeholder="Enter new password"
                    disabled={resetting}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1 h-7 w-7"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="border-2 border-black pr-10"
                    placeholder="Confirm new password"
                    disabled={resetting}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1 h-7 w-7"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {error && (
                <Alert variant="destructive" className="border-2 border-black">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button 
                variant="pixel" 
                className="w-full" 
                onClick={handlePasswordReset}
                disabled={resetting || !newPassword.trim() || !confirmPassword.trim()}
              >
                {resetting ? "Resetting Password..." : "Reset Password"}
              </Button>
            </div>

            <div className="text-center">
              <Link href="/login">
                <Button variant="outline" className="border-2 border-black bg-transparent" size="sm">
                  Back to Login
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}