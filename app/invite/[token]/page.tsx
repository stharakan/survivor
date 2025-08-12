"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/hooks/use-auth"
import { useLeague } from "@/hooks/use-league"
import type { InvitationAcceptanceInfo } from "@/types/invitation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Users, Trophy, Calendar, UserPlus, AlertCircle, CheckCircle, XCircle } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

export default function InvitationPage() {
  const params = useParams()
  const token = params.token as string
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { refreshLeagues } = useLeague()
  
  const [invitation, setInvitation] = useState<InvitationAcceptanceInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [teamName, setTeamName] = useState("")
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const fetchInvitation = async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/invite/${token}`)
        const data = await response.json()
        
        if (data.success) {
          setInvitation(data.data)
          // Set default team name if user is logged in
          if (user) {
            setTeamName(`${user.username}'s Team`)
          }
        } else {
          setError(data.error || 'Invitation not found')
        }
      } catch (error) {
        console.error("Error fetching invitation:", error)
        setError('Failed to load invitation')
      } finally {
        setLoading(false)
      }
    }

    if (token) {
      fetchInvitation()
    }
  }, [token, user])

  const handleAcceptInvitation = async () => {
    if (!user || !invitation) return
    
    if (!teamName.trim()) {
      setError('Please enter a team name')
      return
    }
    
    setAccepting(true)
    setError(null)
    
    try {
      const response = await fetch(`/api/invite/${token}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ teamName: teamName.trim() }),
      })
      
      const data = await response.json()
      
      if (data.success) {
        setSuccess(true)
        await refreshLeagues()
        // Redirect to league after a short delay
        setTimeout(() => {
          router.push('/leagues')
        }, 2000)
      } else {
        setError(data.error || 'Failed to join league')
      }
    } catch (error) {
      console.error("Error accepting invitation:", error)
      setError('Failed to join league')
    } finally {
      setAccepting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] gap-8">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-retro-orange"></div>
        <p className="font-pixel text-lg">Loading invitation...</p>
      </div>
    )
  }

  if (error && !invitation) {
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
            <span className="text-2xl md:text-3xl text-retro-red block">INVITATION ERROR</span>
          </h1>
        </div>
        
        <Card className="border-4 border-red-500 shadow-pixel max-w-md mx-auto">
          <CardHeader className="bg-red-500 text-white border-b-4 border-black">
            <CardTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5" />
              Invalid Invitation
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <Alert variant="destructive" className="border-2 border-black mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-4">
                The invitation link may have expired or is no longer valid.
              </p>
              <Link href="/leagues">
                <Button variant="pixel" className="w-full">
                  Browse Available Leagues
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!invitation) {
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
              Welcome to the League!
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 text-center">
            <p className="font-pixel mb-4">
              You've successfully joined <strong>{invitation.league.name}</strong>
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Redirecting you to the league selection page...
            </p>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto"></div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!user) {
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
            <span className="text-2xl md:text-3xl text-retro-blue block">LEAGUE INVITATION</span>
          </h1>
        </div>

        <Card className="border-4 border-black shadow-pixel max-w-md mx-auto">
          <CardHeader className="bg-retro-blue text-white border-b-4 border-black">
            <CardTitle>You're Invited!</CardTitle>
            <CardDescription className="text-white/80">
              {invitation.creator.username} has invited you to join their league
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="font-heading text-lg">{invitation.league.name}</h3>
                <p className="text-sm text-muted-foreground">{invitation.league.description}</p>
              </div>

              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-retro-yellow" />
                  <span>{invitation.league.sportsLeague}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-retro-blue" />
                  <span>{invitation.league.memberCount} members</span>
                </div>
              </div>

              {!invitation.invitation.isValid && (
                <Alert variant="destructive" className="border-2 border-black">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {invitation.invitation.isExpired 
                      ? "This invitation has expired" 
                      : invitation.invitation.isAtMaxUses
                      ? "This invitation has reached its maximum uses"
                      : "This invitation is no longer valid"
                    }
                  </AlertDescription>
                </Alert>
              )}

              <div className="text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  You need to sign in or create an account to join this league.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Link href={`/login?redirect=${encodeURIComponent(`/invite/${token}`)}`}>
                    <Button variant="outline" className="w-full border-2 border-black bg-transparent">
                      Sign In
                    </Button>
                  </Link>
                  <Link href={`/register?redirect=${encodeURIComponent(`/invite/${token}`)}`}>
                    <Button variant="pixel" className="w-full">
                      Sign Up
                    </Button>
                  </Link>
                </div>
              </div>
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
          <span className="text-2xl md:text-3xl text-retro-blue block">JOIN LEAGUE</span>
        </h1>
      </div>

      <Card className="border-4 border-black shadow-pixel max-w-md mx-auto">
        <CardHeader className="bg-retro-blue text-white border-b-4 border-black">
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            League Invitation
          </CardTitle>
          <CardDescription className="text-white/80">
            {invitation.creator.username} has invited you to join their league
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="font-heading text-lg">{invitation.league.name}</h3>
              <p className="text-sm text-muted-foreground">{invitation.league.description}</p>
            </div>

            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-retro-yellow" />
                <span>{invitation.league.sportsLeague}</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-retro-blue" />
                <span>{invitation.league.memberCount} members</span>
              </div>
            </div>

            {!invitation.invitation.isValid ? (
              <Alert variant="destructive" className="border-2 border-black">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {invitation.invitation.isExpired 
                    ? "This invitation has expired" 
                    : invitation.invitation.isAtMaxUses
                    ? "This invitation has reached its maximum uses"
                    : "This invitation is no longer valid"
                  }
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div>
                  <Label htmlFor="team-name">Your Team Name</Label>
                  <Input
                    id="team-name"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    className="border-2 border-black"
                    placeholder="Enter your team name"
                    disabled={accepting}
                  />
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
                  onClick={handleAcceptInvitation}
                  disabled={accepting || !teamName.trim()}
                >
                  {accepting ? "Joining..." : "Join League"}
                </Button>
              </>
            )}

            <div className="text-center">
              <Link href="/leagues">
                <Button variant="outline" className="border-2 border-black bg-transparent" size="sm">
                  Browse Other Leagues
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}