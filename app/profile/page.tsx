"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useLeague } from "@/hooks/use-league"
import { getProfile, getUserPicks, updateUserProfile, updateMemberStatus } from "@/lib/api"
import type { User } from "@/types/user"
import type { Pick } from "@/types/pick"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CheckCircle2, XCircle, MinusCircle, UserIcon, Shield, Edit3, Check, X } from "lucide-react"
import { format } from "date-fns"
import Image from "next/image"
import { LeagueGuard } from "@/components/league-guard"

function ProfileContent() {
  const { user } = useAuth()
  const { currentLeague, currentMembership } = useLeague()
  const [profile, setProfile] = useState<User | null>(null)
  const [picks, setPicks] = useState<Pick[]>([])
  const [loading, setLoading] = useState(true)
  const [isEditingName, setIsEditingName] = useState(false)
  const [editingName, setEditingName] = useState("")
  const [savingName, setSavingName] = useState(false)
  const [isEditingTeamName, setIsEditingTeamName] = useState(false)
  const [editingTeamName, setEditingTeamName] = useState("")
  const [savingTeamName, setSavingTeamName] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      if (user && currentLeague) {
        try {
          const [profileData, picksData] = await Promise.all([
            getProfile(user.id, currentLeague.id),
            getUserPicks(user.id, currentLeague.id),
          ])
          setProfile(profileData)
          setPicks(picksData)
        } catch (error) {
          console.error("Error fetching profile data:", error)
        } finally {
          setLoading(false)
        }
      }
    }

    fetchData()
  }, [user, currentLeague])

  const handleEditName = () => {
    setEditingName(profile?.name || "")
    setIsEditingName(true)
  }

  const handleSaveName = async () => {
    if (!user || savingName) return
    
    const trimmedName = editingName.trim()
    if (trimmedName.length > 12) {
      alert("Name must be 12 characters or less")
      return
    }
    
    setSavingName(true)
    try {
      const updatedUser = await updateUserProfile(user.id, { 
        name: trimmedName || undefined 
      })
      setProfile(updatedUser)
      setIsEditingName(false)
    } catch (error) {
      console.error("Error updating name:", error)
      alert("Failed to update name. Please try again.")
    } finally {
      setSavingName(false)
    }
  }

  const handleCancelEdit = () => {
    setIsEditingName(false)
    setEditingName("")
  }


  const handleEditTeamName = () => {
    setEditingTeamName(currentMembership?.teamName || "")
    setIsEditingTeamName(true)
  }

  const handleSaveTeamName = async () => {
    if (!currentLeague || !currentMembership || savingTeamName) return
    
    const trimmedTeamName = editingTeamName.trim()
    if (!trimmedTeamName) {
      alert("Team name cannot be empty")
      return
    }
    if (trimmedTeamName.length > 100) {
      alert("Team name must be 100 characters or less")
      return
    }
    
    setSavingTeamName(true)
    try {
      await updateMemberStatus(currentLeague.id, currentMembership.id.toString(), { 
        teamName: trimmedTeamName 
      })
      
      // Refresh the page data to get updated membership
      window.location.reload()
    } catch (error) {
      console.error("Error updating team name:", error)
      const errorMessage = error instanceof Error ? error.message : "Failed to update team name. Please try again."
      alert(errorMessage)
    } finally {
      setSavingTeamName(false)
    }
  }

  const handleCancelTeamNameEdit = () => {
    setIsEditingTeamName(false)
    setEditingTeamName("")
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[200px] w-full rounded-lg" />
        <Skeleton className="h-[350px] w-full rounded-lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading">My Profile</h1>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-sm text-muted-foreground">{currentLeague?.sportsLeague}</div>
            <div className="font-heading text-sm">{currentLeague?.name}</div>
          </div>
          <Image src="/images/tharakan-bros-logo.png" alt="Tharakan Bros Logo" width={60} height={60} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left box: User info */}
        <Card className="border-4 border-black">
          <CardHeader className="pb-2 bg-retro-orange text-white border-b-4 border-black">
            <CardTitle className="text-lg">Player Profile</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">

              <div className="flex items-center gap-3">
                <div className="bg-retro-purple p-3 rounded-none border-2 border-black">
                  <Edit3 className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">Display Name</p>
                  {isEditingName ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        placeholder="Enter your name (optional)"
                        maxLength={12}
                        className="flex-1 border-2 border-black"
                        disabled={savingName}
                      />
                      <Button 
                        size="sm" 
                        variant="pixel" 
                        onClick={handleSaveName}
                        disabled={savingName}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={handleCancelEdit}
                        disabled={savingName}
                        className="border-2 border-black"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-bold flex-1">
                        {profile?.name || "Not set"}
                      </p>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={handleEditName}
                        className="border-2 border-black"
                      >
                        <Edit3 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="bg-retro-green p-3 rounded-none border-2 border-black">
                  <Shield className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">Team Name</p>
                  {isEditingTeamName ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editingTeamName}
                        onChange={(e) => setEditingTeamName(e.target.value)}
                        placeholder="Enter team name"
                        maxLength={100}
                        className="flex-1 border-2 border-black"
                        disabled={savingTeamName}
                      />
                      <Button 
                        size="sm" 
                        variant="pixel" 
                        onClick={handleSaveTeamName}
                        disabled={savingTeamName}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={handleCancelTeamNameEdit}
                        disabled={savingTeamName}
                        className="border-2 border-black"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-bold flex-1">
                        {currentMembership?.teamName || "Team Name"}
                      </p>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={handleEditTeamName}
                        className="border-2 border-black"
                      >
                        <Edit3 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-6">
                <div className="border-2 border-black p-3 text-center">
                  <p className="text-sm font-medium text-muted-foreground">Points</p>
                  <p className="text-2xl font-bold">{currentMembership?.points || 0}</p>
                </div>

                <div className="border-2 border-black p-3 text-center">
                  <p className="text-sm font-medium text-muted-foreground">Strikes</p>
                  <p className="text-2xl font-bold">{currentMembership?.strikes || 0}</p>
                </div>

                <div className="border-2 border-black p-3 text-center">
                  <p className="text-sm font-medium text-muted-foreground">Survived</p>
                  <p className="text-2xl font-bold">{picks.filter((p) => p.result === "win").length}</p>
                </div>
              </div>

              <div className="mt-4 border-2 border-black p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Season Progress</p>
                  <p className="text-sm font-medium">{picks.length} / 38 weeks</p>
                </div>
                <div className="w-full bg-gray-200 h-4 mt-2 border-2 border-black">
                  <div className="bg-retro-orange h-full" style={{ width: `${(picks.length / 38) * 100}%` }}></div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right box: Picks history */}
        <Card className="border-4 border-black">
          <CardHeader className="pb-2 bg-retro-orange text-white border-b-4 border-black">
            <CardTitle className="text-lg">My Picks</CardTitle>
            <CardDescription className="text-white/80">Your weekly picks for the season</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[500px] overflow-y-auto">
              {picks.length > 0 ? (
                <div className="space-y-0 divide-y-2 divide-black">
                  {picks.map((pick) => (
                    <div key={pick.id} className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <div className="font-heading text-sm bg-retro-blue text-white px-2 py-1 border-2 border-black">
                          W{pick.week}
                        </div>
                        <div className="flex items-center gap-2">
                          <img src={pick.team.logo || "/placeholder.svg"} alt={pick.team.name} className="w-8 h-8" />
                          <span className="font-medium">{pick.team.name}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {pick.result === "win" && (
                          <Badge variant="success" className="flex items-center gap-1 border-2 border-black">
                            <CheckCircle2 className="h-3 w-3" />
                            Win
                          </Badge>
                        )}
                        {pick.result === "loss" && (
                          <Badge variant="destructive" className="flex items-center gap-1 border-2 border-black">
                            <XCircle className="h-3 w-3" />
                            Loss
                          </Badge>
                        )}
                        {pick.result === "draw" && (
                          <Badge variant="outline" className="flex items-center gap-1 border-2 border-black">
                            <MinusCircle className="h-3 w-3" />
                            Draw
                          </Badge>
                        )}
                        {pick.result === null && (
                          <Badge variant="outline" className="border-2 border-black">
                            {pick.game && format(new Date(pick.game.date), "MMM d, h:mm a")}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">You haven't made any picks yet.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function ProfilePage() {
  return (
    <LeagueGuard>
      <ProfileContent />
    </LeagueGuard>
  )
}
