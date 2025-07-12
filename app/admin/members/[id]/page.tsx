"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useLeague } from "@/hooks/use-league"
import { getLeagueMember, updateMemberStatus, removeMemberFromLeague } from "@/lib/api"
import type { LeagueMembership } from "@/types/league"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { ArrowLeft, UserX, AlertTriangle, CheckCircle, XCircle } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import Image from "next/image"
import { AdminGuard } from "@/components/admin-guard"

function MemberManagementContent() {
  const { user } = useAuth()
  const { currentLeague } = useLeague()
  const [member, setMember] = useState<LeagueMembership | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const params = useParams()
  const router = useRouter()
  const memberId = Number(params.id)

  useEffect(() => {
    const fetchMember = async () => {
      if (user && currentLeague && memberId) {
        try {
          const memberData = await getLeagueMember(currentLeague.id, memberId)
          if (memberData) {
            setMember(memberData)
          } else {
            router.push("/admin")
          }
        } catch (error) {
          console.error("Error fetching member data:", error)
          router.push("/admin")
        } finally {
          setLoading(false)
        }
      }
    }

    fetchMember()
  }, [user, currentLeague, memberId, router])

  const handleTogglePaid = async () => {
    if (!member || !currentLeague) return

    setUpdating(true)
    setSuccess(null)
    setError(null)

    try {
      await updateMemberStatus(currentLeague.id, member.id, { isPaid: !member.isPaid })
      setMember({ ...member, isPaid: !member.isPaid })
      setSuccess(`Member payment status updated to ${!member.isPaid ? "PAID" : "UNPAID"}`)
    } catch (error) {
      console.error("Error updating member status:", error)
      setError("Failed to update member status. Please try again.")
    } finally {
      setUpdating(false)
    }
  }

  const handleToggleAdmin = async () => {
    if (!member || !currentLeague) return

    setUpdating(true)
    setSuccess(null)
    setError(null)

    try {
      await updateMemberStatus(currentLeague.id, member.id, { isAdmin: !member.isAdmin })
      setMember({ ...member, isAdmin: !member.isAdmin })
      setSuccess(`Member admin status updated to ${!member.isAdmin ? "ADMIN" : "MEMBER"}`)
    } catch (error) {
      console.error("Error updating member status:", error)
      setError("Failed to update member status. Please try again.")
    } finally {
      setUpdating(false)
    }
  }

  const handleRemoveMember = async () => {
    if (!member || !currentLeague) return

    setUpdating(true)
    setSuccess(null)
    setError(null)

    try {
      await removeMemberFromLeague(currentLeague.id, member.id)
      setSuccess("Member removed from league successfully")
      setTimeout(() => {
        router.push("/admin")
      }, 2000)
    } catch (error) {
      console.error("Error removing member:", error)
      setError("Failed to remove member. Please try again.")
    } finally {
      setUpdating(false)
      setShowRemoveConfirm(false)
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

  if (!member) {
    return null
  }

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
          <h1 className="text-2xl font-heading">Manage Member</h1>
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
        <Alert variant="success" className="border-4 border-black">
          <CheckCircle className="h-4 w-4" />
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive" className="border-4 border-black">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Member Info */}
        <Card className="border-4 border-black">
          <CardHeader className="bg-retro-blue text-white border-b-4 border-black">
            <CardTitle>Member Information</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Team Name</Label>
                <div className="text-lg font-bold">{member.teamName}</div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="border-2 border-black p-3 text-center">
                  <div className="text-sm font-medium text-muted-foreground">Points</div>
                  <div className="text-xl font-bold">{member.points}</div>
                </div>
                <div className="border-2 border-black p-3 text-center">
                  <div className="text-sm font-medium text-muted-foreground">Strikes</div>
                  <div className="text-xl font-bold">{member.strikes}</div>
                </div>
                <div className="border-2 border-black p-3 text-center">
                  <div className="text-sm font-medium text-muted-foreground">Rank</div>
                  <div className="text-xl font-bold">#{member.rank}</div>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium text-muted-foreground">Joined</Label>
                <div className="text-sm">{new Date(member.joinedAt).toLocaleDateString()}</div>
              </div>

              <div className="flex gap-2">
                <Badge variant={member.isPaid ? "success" : "destructive"} className="border-2 border-black">
                  {member.isPaid ? "PAID" : "UNPAID"}
                </Badge>
                {member.isAdmin && (
                  <Badge variant="outline" className="bg-yellow-500 text-black border-2 border-black">
                    ADMIN
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Member Actions */}
        <Card className="border-4 border-black">
          <CardHeader className="bg-retro-orange text-white border-b-4 border-black">
            <CardTitle>Member Actions</CardTitle>
            <CardDescription className="text-white/80">Manage member status and permissions</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-6">
              {/* Payment Status */}
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="paid-status" className="text-sm font-medium">
                    Payment Status
                  </Label>
                  <div className="text-xs text-muted-foreground">Toggle member's payment status</div>
                </div>
                <Switch
                  id="paid-status"
                  checked={member.isPaid}
                  onCheckedChange={handleTogglePaid}
                  disabled={updating}
                />
              </div>

              {/* Admin Status */}
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="admin-status" className="text-sm font-medium">
                    Admin Privileges
                  </Label>
                  <div className="text-xs text-muted-foreground">Grant or revoke admin access</div>
                </div>
                <Switch
                  id="admin-status"
                  checked={member.isAdmin}
                  onCheckedChange={handleToggleAdmin}
                  disabled={updating}
                />
              </div>

              {/* Remove Member */}
              <div className="border-t-2 border-black pt-6">
                <div className="mb-4">
                  <Label className="text-sm font-medium text-red-600">Danger Zone</Label>
                  <div className="text-xs text-muted-foreground">Permanently remove member from league</div>
                </div>

                {!showRemoveConfirm ? (
                  <Button
                    variant="destructive"
                    className="w-full border-2 border-black"
                    onClick={() => setShowRemoveConfirm(true)}
                    disabled={updating}
                  >
                    <UserX className="h-4 w-4 mr-2" />
                    Remove from League
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <Alert variant="destructive" className="border-2 border-black">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Confirm Removal</AlertTitle>
                      <AlertDescription>
                        This will permanently remove {member.teamName} from the league. This action cannot be undone.
                      </AlertDescription>
                    </Alert>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        className="flex-1 border-2 border-black"
                        onClick={handleRemoveMember}
                        disabled={updating}
                      >
                        {updating ? "Removing..." : "Confirm Remove"}
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 border-2 border-black bg-transparent"
                        onClick={() => setShowRemoveConfirm(false)}
                        disabled={updating}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function MemberManagementPage() {
  return (
    <AdminGuard>
      <MemberManagementContent />
    </AdminGuard>
  )
}
