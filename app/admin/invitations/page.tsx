"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useLeague } from "@/hooks/use-league"
import type { InvitationWithLeague } from "@/types/invitation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog"
import { ArrowLeft, Plus, Copy, Trash2, Users, Calendar, CheckCircle, AlertCircle } from "lucide-react"
import Image from "next/image"
import { AdminGuard } from "@/components/admin-guard"
import { useRouter } from "next/navigation"
import Link from "next/link"

function InvitationsContent() {
  const { user } = useAuth()
  const { currentLeague } = useLeague()
  const router = useRouter()
  
  const [invitations, setInvitations] = useState<InvitationWithLeague[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formData, setFormData] = useState({
    maxUses: "",
    expiresAt: "",
  })
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    const fetchInvitations = async () => {
      if (!currentLeague) return
      
      setLoading(true)
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
        setLoading(false)
      }
    }

    fetchInvitations()
  }, [currentLeague])

  const handleCreateInvitation = async () => {
    if (!currentLeague) return
    
    setCreating(true)
    setError(null)
    
    try {
      const body: any = {}
      
      if (formData.maxUses) {
        const maxUses = parseInt(formData.maxUses)
        if (isNaN(maxUses) || maxUses <= 0) {
          setError('Max uses must be a positive number')
          setCreating(false)
          return
        }
        body.maxUses = maxUses
      } else {
        body.maxUses = null
      }
      
      if (formData.expiresAt) {
        body.expiresAt = new Date(formData.expiresAt).toISOString()
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
        setFormData({ maxUses: "", expiresAt: "" })
        setDialogOpen(false)
        
        // Clear success message after a few seconds
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

  const handleBackClick = () => {
    router.push("/admin")
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    )
  }

  const activeInvitations = invitations.filter(inv => inv.isActive)
  const revokedInvitations = invitations.filter(inv => !inv.isActive)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handleBackClick}
            className="border-2 border-black bg-transparent"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-heading">League Invitations</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-sm text-muted-foreground">{currentLeague?.sportsLeague}</div>
            <div className="font-heading text-sm">{currentLeague?.name}</div>
          </div>
          <Image src="/images/tharakan-bros-logo.png" alt="Tharakan Bros Logo" width={60} height={60} />
        </div>
      </div>

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

      {/* Create Invitation */}
      <Card className="border-4 border-black">
        <CardHeader className="bg-retro-green text-white border-b-4 border-black">
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
                    value={formData.maxUses}
                    onChange={(e) => setFormData(prev => ({ ...prev, maxUses: e.target.value }))}
                    className="border-2 border-black"
                    placeholder="Leave blank for unlimited"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="expires-at">Expiration Date</Label>
                  <Input
                    id="expires-at"
                    type="datetime-local"
                    value={formData.expiresAt}
                    onChange={(e) => setFormData(prev => ({ ...prev, expiresAt: e.target.value }))}
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
        <CardHeader className="bg-retro-blue text-white border-b-4 border-black">
          <CardTitle>Active Invitations ({activeInvitations.length})</CardTitle>
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

      {/* Revoked Invitations */}
      {revokedInvitations.length > 0 && (
        <Card className="border-4 border-black">
          <CardHeader className="bg-gray-500 text-white border-b-4 border-black">
            <CardTitle>Revoked Invitations ({revokedInvitations.length})</CardTitle>
            <CardDescription className="text-white/80">
              Previously active invitations that have been revoked
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="space-y-0 divide-y-2 divide-black">
              {revokedInvitations.map((invitation) => (
                <div key={invitation.id} className="p-4 opacity-75">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="border-2 border-black bg-gray-100">
                          REVOKED
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {invitation.currentUses} uses before revocation
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Token: {invitation.token.substring(0, 8)}...
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default function InvitationsPage() {
  return (
    <AdminGuard>
      <InvitationsContent />
    </AdminGuard>
  )
}