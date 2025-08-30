"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useAuth } from "@/hooks/use-auth"
import { useLeague } from "@/hooks/use-league"
import { getLeagueMembers, getJoinRequests, updateMemberStatus, updateLeagueSettings } from "@/lib/api"
import type { LeagueMembership, JoinRequest, SportsLeagueOption } from "@/types/league"
import type { User } from "@/types/user"
import type { InvitationWithLeague } from "@/types/invitation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Users, Settings, UserCheck, Clock, Mail, Plus, Copy, Trash2, Calendar, CheckCircle, AlertCircle, XCircle, Save, Grid3X3 } from "lucide-react"
import Image from "next/image"
import { AdminGuard } from "@/components/admin-guard"
import Link from "next/link"

type MemberWithUserDetails = LeagueMembership & { userDetails: User }

const sportsLeagueOptions: SportsLeagueOption[] = [
  { id: "EPL", name: "English Premier League", abbreviation: "EPL", description: "Top tier English football" },
  { id: "NFL", name: "National Football League", abbreviation: "NFL", description: "American professional football" },
  {
    id: "NBA",
    name: "National Basketball Association",
    abbreviation: "NBA",
    description: "American professional basketball",
  },
  { id: "MLS", name: "Major League Soccer", abbreviation: "MLS", description: "American professional soccer" },
  { id: "NHL", name: "National Hockey League", abbreviation: "NHL", description: "Professional ice hockey" },
]

function AdminPortalContent() {
  const { user } = useAuth()
  const { currentLeague, refreshLeagues } = useLeague()
  const searchParams = useSearchParams()
  const router = useRouter()
  
  // Tab management
  const activeTab = searchParams.get('tab') || 'overview'
  
  // Members state
  const [members, setMembers] = useState<MemberWithUserDetails[]>([])
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingMembers, setUpdatingMembers] = useState<Set<string>>(new Set())
  
  // Invitations state
  const [invitations, setInvitations] = useState<InvitationWithLeague[]>([])
  const [invitationsLoading, setInvitationsLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [invitationFormData, setInvitationFormData] = useState({
    maxUses: "",
    expiresAt: "",
  })
  
  // Settings state
  const [settingsFormData, setSettingsFormData] = useState({
    name: "",
    description: "",
    logo: "",
    sportsLeague: "",
    isPublic: true,
    requiresApproval: false,
    hideScoreboard: false,
  })
  const [saving, setSaving] = useState(false)
  
  // Shared state
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Helper function to format member display name
  const formatMemberDisplayName = (member: MemberWithUserDetails) => {
    return member.userDetails.name 
      ? `${member.teamName} (${member.userDetails.name})`
      : member.teamName
  }

  // Tab management
  const setActiveTab = (tab: string) => {
    const params = new URLSearchParams(searchParams)
    params.set('tab', tab)
    router.push(`/admin?${params.toString()}`)
  }

  useEffect(() => {
    const fetchData = async () => {
      if (user && currentLeague) {
        // Fetch members
        try {
          const membersData = await getLeagueMembers(currentLeague.id)
          setMembers(membersData)
        } catch (error) {
          console.error("Error fetching members:", error)
        }
        
        // Fetch join requests
        try {
          const requestsData = await getJoinRequests(currentLeague.id)
          setJoinRequests(requestsData)
        } catch (error) {
          console.error("Error fetching join requests (expected - not implemented):", error)
        }
        
        setLoading(false)
      }
    }

    fetchData()
  }, [user, currentLeague])

  // Initialize settings form data when league changes
  useEffect(() => {
    if (currentLeague) {
      setSettingsFormData({
        name: currentLeague.name,
        description: currentLeague.description,
        logo: currentLeague.logo || "",
        sportsLeague: currentLeague.sportsLeague,
        isPublic: currentLeague.isPublic,
        requiresApproval: currentLeague.requiresApproval,
        hideScoreboard: currentLeague.hideScoreboard || false,
      })
    }
  }, [currentLeague])

  // Fetch invitations when invitations tab is active
  useEffect(() => {
    const fetchInvitations = async () => {
      if (!currentLeague || activeTab !== 'invitations') return
      
      setInvitationsLoading(true)
      try {
        const response = await fetch(`/api/leagues/${currentLeague.id}/invitations`)
        const data = await response.json()
        
        if (data.success) {
          setInvitations(data.data)
        } else {
          setError(data.error || 'Failed to load invitations')
        }
      } catch (error) {
        console.error("Error fetching invitations:", error)
        setError('Failed to load invitations')
      } finally {
        setInvitationsLoading(false)
      }
    }

    if (activeTab === 'invitations') {
      fetchInvitations()
    }
  }, [currentLeague, activeTab])

  // Members handlers
  const handleTogglePayment = async (member: MemberWithUserDetails) => {
    if (!currentLeague) return
    
    const memberId = member.id.toString()
    setUpdatingMembers(prev => new Set(prev).add(memberId))
    
    try {
      const updatedMember = await updateMemberStatus(currentLeague.id, memberId, { 
        isPaid: !member.isPaid 
      })
      
      setMembers(prev => 
        prev.map(m => m.id === member.id ? { ...m, isPaid: updatedMember.isPaid } : m)
      )
    } catch (error) {
      console.error("Error updating payment status:", error)
      setError("Failed to update payment status")
    } finally {
      setUpdatingMembers(prev => {
        const newSet = new Set(prev)
        newSet.delete(memberId)
        return newSet
      })
    }
  }

  // Invitations handlers
  const handleCreateInvitation = async () => {
    if (!currentLeague) return
    
    setCreating(true)
    setError(null)
    
    try {
      const body: any = {}
      
      if (invitationFormData.maxUses) {
        const maxUses = parseInt(invitationFormData.maxUses)
        if (isNaN(maxUses) || maxUses <= 0) {
          setError('Max uses must be a positive number')
          setCreating(false)
          return
        }
        body.maxUses = maxUses
      } else {
        body.maxUses = null
      }
      
      if (invitationFormData.expiresAt) {
        body.expiresAt = new Date(invitationFormData.expiresAt).toISOString()
      } else {
        body.expiresAt = null
      }
      
      const response = await fetch(`/api/leagues/${currentLeague.id}/invitations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      
      const data = await response.json()
      
      if (data.success) {
        setInvitations(prev => [data.data, ...prev])
        setSuccess('Invitation created successfully!')
        setInvitationFormData({ maxUses: "", expiresAt: "" })
        setDialogOpen(false)
        setTimeout(() => setSuccess(null), 3000)
      } else {
        setError(data.error || 'Failed to create invitation')
      }
    } catch (error) {
      console.error("Error creating invitation:", error)
      setError('Failed to create invitation')
    } finally {
      setCreating(false)
    }
  }

  const handleCopyLink = async (token: string) => {
    const inviteUrl = `${window.location.origin}/invite/${token}`
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setSuccess('Invitation link copied to clipboard!')
      setTimeout(() => setSuccess(null), 2000)
    } catch (error) {
      console.error('Failed to copy link:', error)
      setError('Failed to copy link')
      setTimeout(() => setError(null), 2000)
    }
  }

  const handleRevokeInvitation = async (invitationId: string) => {
    if (!confirm('Are you sure you want to revoke this invitation?')) {
      return
    }
    
    try {
      const response = await fetch(`/api/invitations/${invitationId}`, {
        method: 'DELETE',
      })
      
      const data = await response.json()
      
      if (data.success) {
        setInvitations(prev => prev.filter(inv => inv.id !== invitationId))
        setSuccess('Invitation revoked successfully!')
        setTimeout(() => setSuccess(null), 2000)
      } else {
        setError(data.error || 'Failed to revoke invitation')
      }
    } catch (error) {
      console.error("Error revoking invitation:", error)
      setError('Failed to revoke invitation')
    }
  }

  // Settings handlers
  const handleSaveSettings = async () => {
    if (!currentLeague) return

    setSaving(true)
    setSuccess(null)
    setError(null)

    try {
      await updateLeagueSettings(currentLeague.id, settingsFormData)
      await refreshLeagues()
      setSuccess("League settings updated successfully!")
    } catch (error) {
      console.error("Error updating league settings:", error)
      setError("Failed to update league settings. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    )
  }

  const activeMembers = members.filter((m) => m.status === "active")
  const pendingRequests = joinRequests.filter((r) => r.status === "pending")
  const activeInvitations = invitations.filter(inv => inv.isActive)
  const revokedInvitations = invitations.filter(inv => !inv.isActive)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading">Admin Portal</h1>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-sm text-muted-foreground">{currentLeague?.sportsLeague}</div>
            <div className="font-heading text-sm">{currentLeague?.name}</div>
          </div>
          <Image src="/images/tharakan-bros-logo.png" alt="Tharakan Bros Logo" width={60} height={60} />
        </div>
      </div>

      {/* Success/Error Alerts */}
      {success && (
        <Alert className="border-4 border-green-500">
          <CheckCircle className="h-4 w-4" />
          <AlertDescription className="text-green-700">{success}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive" className="border-4 border-black">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Admin Vertical Tabs */}
      <div className="flex gap-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <div className="flex gap-6 items-start">
            <TabsList orientation="vertical" className="shrink-0 self-start">
              <TabsTrigger value="overview" className="justify-start bg-retro-orange/10 data-[state=active]:bg-retro-orange data-[state=active]:text-white">
                <Grid3X3 className="h-4 w-4 mr-2" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="members" className="justify-start bg-retro-orange/10 data-[state=active]:bg-retro-orange data-[state=active]:text-white">
                <Users className="h-4 w-4 mr-2" />
                Members
              </TabsTrigger>
              <TabsTrigger value="invitations" className="justify-start bg-retro-orange/10 data-[state=active]:bg-retro-orange data-[state=active]:text-white">
                <Mail className="h-4 w-4 mr-2" />
                Invites
              </TabsTrigger>
              <TabsTrigger value="requests" className="justify-start bg-retro-orange/10 data-[state=active]:bg-retro-orange data-[state=active]:text-white">
                <Clock className="h-4 w-4 mr-2" />
                Requests
              </TabsTrigger>
              <TabsTrigger value="settings" className="justify-start bg-retro-orange/10 data-[state=active]:bg-retro-orange data-[state=active]:text-white">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </TabsTrigger>
            </TabsList>

            <div className="flex-1">
              <TabsContent value="overview" className="space-y-4 mt-0">
                <Card className="border-4 border-black">
                  <CardHeader className="bg-retro-orange text-white border-b-4 border-black">
                    <CardTitle>League Overview</CardTitle>
                    <CardDescription className="text-white/80">
                      Quick overview of your league's key statistics and activity.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6">
                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 gap-4 max-w-2xl mx-auto">
                      <Card className="border-4 border-black">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2">
                            <Users className="h-5 w-5 text-retro-orange" />
                            <div>
                              <div className="text-2xl font-bold">{activeMembers.length}</div>
                              <div className="text-sm text-muted-foreground">Active Members</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border-4 border-black">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2">
                            <Clock className="h-5 w-5 text-retro-orange" />
                            <div>
                              <div className="text-2xl font-bold">{pendingRequests.length}</div>
                              <div className="text-sm text-muted-foreground">Pending Requests</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border-4 border-black">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2">
                            <UserCheck className="h-5 w-5 text-retro-orange" />
                            <div>
                              <div className="text-2xl font-bold">{activeMembers.filter((m) => m.isPaid).length}</div>
                              <div className="text-sm text-muted-foreground">Paid Members</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border-4 border-black">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2">
                            <Settings className="h-5 w-5 text-retro-orange" />
                            <div>
                              <div className="text-2xl font-bold">{activeMembers.filter((m) => m.isAdmin).length}</div>
                              <div className="text-sm text-muted-foreground">Admins</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="members" className="space-y-4 mt-0">
          <Card className="border-4 border-black">
            <CardHeader className="bg-retro-orange text-white border-b-4 border-black">
              <CardTitle>League Members</CardTitle>
              <CardDescription className="text-white/80">Manage your league members</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {activeMembers.length > 0 ? (
                <div className="space-y-0 divide-y-2 divide-black">
                  {activeMembers.map((member) => (
                    <div key={member.id} className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div>
                          <div className="font-bold">{formatMemberDisplayName(member)}</div>
                          <div className="text-sm text-muted-foreground">
                            Rank #{member.rank} • {member.points} points • {member.strikes} strikes
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">Payment:</span>
                          <Switch
                            checked={member.isPaid}
                            onCheckedChange={() => handleTogglePayment(member)}
                            disabled={updatingMembers.has(member.id.toString())}
                          />
                        </div>
                        {member.isAdmin && (
                          <Badge variant="outline" className="bg-yellow-500 text-black border-2 border-black">
                            ADMIN
                          </Badge>
                        )}
                        <Link href={`/admin/members/${member.id}`}>
                          <Button variant="outline" size="sm" className="border-2 border-black bg-transparent">
                            Manage
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No league members found.</p>
                </div>
              )}
            </CardContent>
          </Card>
              </TabsContent>

              <TabsContent value="invitations" className="space-y-4 mt-0">
                {invitationsLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-64 w-full" />
                  </div>
                ) : (
                  <>
                    {/* Create Invitation */}
                    <Card className="border-4 border-black">
                      <CardHeader className="bg-retro-orange text-white border-b-4 border-black">
                        <CardTitle className="flex items-center gap-2">
                          <Plus className="h-5 w-5" />
                          Create New Invitation
                        </CardTitle>
                        <CardDescription className="text-white/80">
                          Generate shareable invitation links for your league
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-6">
                        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                          <DialogTrigger asChild>
                            <Button variant="pixel" className="w-full">
                              <Plus className="h-4 w-4 mr-2" />
                              Create Invitation Link
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="border-4 border-black">
                            <DialogHeader>
                              <DialogTitle className="font-heading">Create Invitation</DialogTitle>
                              <DialogDescription>
                                Configure your invitation settings. Leave fields blank for unlimited access.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                              <div className="grid gap-2">
                                <Label htmlFor="max-uses">Maximum Uses</Label>
                                <Input
                                  id="max-uses"
                                  type="number"
                                  min="1"
                                  value={invitationFormData.maxUses}
                                  onChange={(e) => setInvitationFormData(prev => ({ ...prev, maxUses: e.target.value }))}
                                  className="border-2 border-black"
                                  placeholder="Leave blank for unlimited"
                                />
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor="expires-at">Expiration Date</Label>
                                <Input
                                  id="expires-at"
                                  type="datetime-local"
                                  value={invitationFormData.expiresAt}
                                  onChange={(e) => setInvitationFormData(prev => ({ ...prev, expiresAt: e.target.value }))}
                                  className="border-2 border-black"
                                  min={new Date().toISOString().slice(0, 16)}
                                />
                              </div>
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-2 border-black">
                                Cancel
                              </Button>
                              <Button variant="pixel" onClick={handleCreateInvitation} disabled={creating}>
                                {creating ? "Creating..." : "Create Invitation"}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </CardContent>
                    </Card>

                    {/* Active Invitations */}
                    <Card className="border-4 border-black">
                      <CardHeader className="bg-retro-orange text-white border-b-4 border-black">
                        <CardTitle>Active Invitations</CardTitle>
                        <CardDescription className="text-white/80">
                          Manage your active invitation links
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-0">
                        {activeInvitations.length > 0 ? (
                          <div className="space-y-0 divide-y-2 divide-black">
                            {activeInvitations.map((invitation) => {
                              const isExpired = invitation.expiresAt && new Date(invitation.expiresAt) < new Date()
                              const isAtMaxUses = invitation.maxUses && invitation.currentUses >= invitation.maxUses
                              const isValid = !isExpired && !isAtMaxUses
                              
                              return (
                                <div key={invitation.id} className="p-4">
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-2">
                                        <Badge variant={isValid ? "success" : "outline"} className="border-2 border-black">
                                          {isValid ? "ACTIVE" : isExpired ? "EXPIRED" : "MAX USES"}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground">
                                          Created {new Date(invitation.createdAt).toLocaleDateString()}
                                        </span>
                                      </div>
                                      
                                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                        <div className="flex items-center gap-2">
                                          <Users className="h-4 w-4 text-retro-blue" />
                                          <span>
                                            {invitation.currentUses}{invitation.maxUses ? `/${invitation.maxUses}` : ""} uses
                                          </span>
                                        </div>
                                        
                                        {invitation.expiresAt && (
                                          <div className="flex items-center gap-2">
                                            <Calendar className="h-4 w-4 text-retro-orange" />
                                            <span>
                                              Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                                            </span>
                                          </div>
                                        )}
                                        
                                        <div className="text-xs text-muted-foreground">
                                          Token: {invitation.token.substring(0, 8)}...
                                        </div>
                                      </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleCopyLink(invitation.token)}
                                        className="border-2 border-black bg-transparent"
                                      >
                                        <Copy className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => handleRevokeInvitation(invitation.id)}
                                        className="border-2 border-black"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="text-center py-8">
                            <p className="text-muted-foreground">No active invitations.</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </>
                )}
              </TabsContent>

              <TabsContent value="requests" className="space-y-4 mt-0">
                <Card className="border-4 border-black">
                  <CardHeader className="bg-retro-orange text-white border-b-4 border-black">
                    <CardTitle>Join Requests</CardTitle>
                    <CardDescription className="text-white/80">Review pending membership requests</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    {pendingRequests.length > 0 ? (
                      <div className="space-y-0 divide-y-2 divide-black">
                        {pendingRequests.map((request) => (
                          <div key={request.id} className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div>
                                <div className="font-bold">{request.user.username}</div>
                                <div className="text-sm text-muted-foreground">
                                  Team: {request.teamName} • Requested: {new Date(request.requestedAt).toLocaleDateString()}
                                </div>
                                {request.message && (
                                  <div className="text-sm mt-1 p-2 bg-gray-100 dark:bg-gray-800 border border-gray-300">
                                    "{request.message}"
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Link href={`/admin/requests/${request.id}`}>
                                <Button variant="pixel" size="sm">
                                  Review
                                </Button>
                              </Link>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground">No pending join requests.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="settings" className="space-y-4 mt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Basic Settings */}
                  <Card className="border-4 border-black">
                    <CardHeader className="bg-retro-orange text-white border-b-4 border-black">
                      <CardTitle>Basic Information</CardTitle>
                      <CardDescription className="text-white/80">Update your league's basic details</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="league-name">League Name</Label>
                          <Input
                            id="league-name"
                            value={settingsFormData.name}
                            onChange={(e) => setSettingsFormData({ ...settingsFormData, name: e.target.value })}
                            className="border-2 border-black"
                            placeholder="Enter league name"
                          />
                        </div>

                        <div>
                          <Label htmlFor="league-description">Description</Label>
                          <Textarea
                            id="league-description"
                            value={settingsFormData.description}
                            onChange={(e) => setSettingsFormData({ ...settingsFormData, description: e.target.value })}
                            className="border-2 border-black"
                            placeholder="Describe your league"
                            rows={3}
                          />
                        </div>

                        <div>
                          <Label htmlFor="league-logo">League Logo URL</Label>
                          <Input
                            id="league-logo"
                            value={settingsFormData.logo}
                            onChange={(e) => setSettingsFormData({ ...settingsFormData, logo: e.target.value })}
                            className="border-2 border-black"
                            placeholder="https://example.com/logo.png"
                          />
                          <div className="text-xs text-muted-foreground mt-1">Optional: URL to your league's logo image</div>
                        </div>

                        <div>
                          <Label htmlFor="sports-league">Sports League</Label>
                          <Select
                            value={settingsFormData.sportsLeague}
                            onValueChange={(value) => setSettingsFormData({ ...settingsFormData, sportsLeague: value })}
                          >
                            <SelectTrigger className="border-2 border-black">
                              <SelectValue placeholder="Select sports league" />
                            </SelectTrigger>
                            <SelectContent>
                              {sportsLeagueOptions.map((option) => (
                                <SelectItem key={option.id} value={option.id}>
                                  <div>
                                    <div className="font-medium">{option.name}</div>
                                    <div className="text-xs text-muted-foreground">{option.description}</div>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Privacy Settings */}
                  <Card className="border-4 border-black">
                    <CardHeader className="bg-retro-orange text-white border-b-4 border-black">
                      <CardTitle>Privacy & Access</CardTitle>
                      <CardDescription className="text-white/80">Control who can join your league</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label htmlFor="public-league" className="text-sm font-medium">
                              Public League
                            </Label>
                            <div className="text-xs text-muted-foreground">Allow anyone to find and join your league</div>
                          </div>
                          <Switch
                            id="public-league"
                            checked={settingsFormData.isPublic}
                            onCheckedChange={(checked) => setSettingsFormData({ ...settingsFormData, isPublic: checked })}
                          />
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <Label htmlFor="requires-approval" className="text-sm font-medium">
                              Require Approval
                            </Label>
                            <div className="text-xs text-muted-foreground">Review join requests before adding members</div>
                          </div>
                          <Switch
                            id="requires-approval"
                            checked={settingsFormData.requiresApproval}
                            onCheckedChange={(checked) => setSettingsFormData({ ...settingsFormData, requiresApproval: checked })}
                          />
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <Label htmlFor="hide-scoreboard" className="text-sm font-medium">
                              Hide Scoreboard
                            </Label>
                            <div className="text-xs text-muted-foreground">Hide the scoreboard from league members</div>
                          </div>
                          <Switch
                            id="hide-scoreboard"
                            checked={settingsFormData.hideScoreboard}
                            onCheckedChange={(checked) => setSettingsFormData({ ...settingsFormData, hideScoreboard: checked })}
                          />
                        </div>

                        <div className="border-2 border-black p-3 bg-gray-50 dark:bg-gray-800">
                          <h4 className="font-medium mb-2">Privacy Settings Summary</h4>
                          <div className="text-sm space-y-1">
                            <div>
                              <strong>Visibility:</strong> {settingsFormData.isPublic ? "Public" : "Private"}
                            </div>
                            <div>
                              <strong>Join Process:</strong>{" "}
                              {settingsFormData.requiresApproval ? "Admin approval required" : "Instant join"}
                            </div>
                            <div>
                              <strong>Scoreboard:</strong> {settingsFormData.hideScoreboard ? "Hidden from members" : "Visible to all"}
                            </div>
                          </div>
                        </div>

                        <Button variant="pixel" className="w-full" onClick={handleSaveSettings} disabled={saving}>
                          {saving ? (
                            "Saving..."
                          ) : (
                            <>
                              <Save className="h-4 w-4 mr-2" />
                              Save Settings
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </div>
          </div>
        </Tabs>
      </div>
    </div>
  )
}

export default function AdminPortalPage() {
  return (
    <AdminGuard>
      <AdminPortalContent />
    </AdminGuard>
  )
}
