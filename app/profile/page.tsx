"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useLeague } from "@/hooks/use-league"
import { getProfile, getUserPicks, updateUserProfile, updateMemberStatus, changeUserPassword } from "@/lib/api"
import type { User } from "@/types/user"
import type { Pick } from "@/types/pick"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CheckCircle2, XCircle, MinusCircle, UserIcon, Shield, Edit3, Check, X, KeyRound, Eye, EyeOff } from "lucide-react"
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
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState("")
  const [passwordError, setPasswordError] = useState("")

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

  const handleEditPassword = () => {
    setIsChangingPassword(true)
    setPasswordSuccess("")
    setPasswordError("")
  }

  const handleSavePassword = async () => {
    if (changingPassword) return
    
    // Basic validation
    if (!currentPassword.trim()) {
      setPasswordError("Current password is required")
      return
    }
    if (!newPassword.trim()) {
      setPasswordError("New password is required")
      return
    }
    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters")
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords don't match")
      return
    }
    
    setChangingPassword(true)
    setPasswordError("")
    
    try {
      await changeUserPassword(currentPassword, newPassword, confirmPassword)
      setPasswordSuccess("Password changed successfully!")
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setIsChangingPassword(false)
      
      // Clear success message after 3 seconds
      setTimeout(() => setPasswordSuccess(""), 3000)
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "Failed to change password")
    } finally {
      setChangingPassword(false)
    }
  }

  const handleCancelPasswordEdit = () => {
    setIsChangingPassword(false)
    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")
    setPasswordError("")
    setPasswordSuccess("")
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
                  <p className="text-sm font-medium">Weeks Completed</p>
                  <p className="text-sm font-medium">{currentLeague?.last_completed_week || 0} / 38 weeks</p>
                </div>
                <div className="w-full bg-gray-200 h-4 mt-2 border-2 border-black">
                  <div className="bg-retro-orange h-full" style={{ width: `${((currentLeague?.last_completed_week || 0) / 38) * 100}%` }}></div>
                </div>
              </div>

              {/* Password Change Section */}
              <div className="border-t-2 border-black pt-4 mt-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-retro-blue p-3 rounded-none border-2 border-black">
                    <KeyRound className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground">Security</p>
                    <p className="text-lg font-bold">Change Password</p>
                  </div>
                  {!isChangingPassword && (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={handleEditPassword}
                      className="border-2 border-black"
                    >
                      <Edit3 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {isChangingPassword && (
                  <div className="space-y-3">
                    {/* Current Password */}
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Current Password</label>
                      <div className="relative">
                        <Input
                          type={showCurrentPassword ? "text" : "password"}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="Enter current password"
                          className="border-2 border-black pr-10"
                          disabled={changingPassword}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1 h-7 w-7"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          disabled={changingPassword}
                        >
                          {showCurrentPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* New Password */}
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">New Password</label>
                      <div className="relative">
                        <Input
                          type={showNewPassword ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Enter new password (min 6 characters)"
                          className="border-2 border-black pr-10"
                          disabled={changingPassword}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1 h-7 w-7"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          disabled={changingPassword}
                        >
                          {showNewPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Confirm Password */}
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Confirm New Password</label>
                      <div className="relative">
                        <Input
                          type={showConfirmPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Confirm new password"
                          className="border-2 border-black pr-10"
                          disabled={changingPassword}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1 h-7 w-7"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          disabled={changingPassword}
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Error/Success Messages */}
                    {passwordError && (
                      <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-2 rounded">
                        {passwordError}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="pixel" 
                        onClick={handleSavePassword}
                        disabled={changingPassword}
                        className="flex-1"
                      >
                        {changingPassword ? "Changing..." : "Change Password"}
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={handleCancelPasswordEdit}
                        disabled={changingPassword}
                        className="border-2 border-black flex-1"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {passwordSuccess && (
                  <div className="text-sm text-green-600 bg-green-50 border border-green-200 p-2 rounded mt-2">
                    {passwordSuccess}
                  </div>
                )}
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
