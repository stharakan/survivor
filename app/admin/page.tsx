"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useLeague } from "@/hooks/use-league"
import { getLeagueMembers, getJoinRequests, updateMemberStatus } from "@/lib/api"
import type { LeagueMembership, JoinRequest } from "@/types/league"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Users, Settings, UserCheck, Clock } from "lucide-react"
import Image from "next/image"
import { AdminGuard } from "@/components/admin-guard"
import Link from "next/link"

function AdminPortalContent() {
  const { user } = useAuth()
  const { currentLeague } = useLeague()
  const [members, setMembers] = useState<LeagueMembership[]>([])
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingMembers, setUpdatingMembers] = useState<Set<string>>(new Set())

  useEffect(() => {
    const fetchData = async () => {
      if (user && currentLeague) {
        // Fetch members - this should work
        try {
          const membersData = await getLeagueMembers(currentLeague.id)
          setMembers(membersData)
        } catch (error) {
          console.error("Error fetching members:", error)
        }
        
        // Fetch join requests - this is not implemented yet
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

  const handleTogglePayment = async (member: LeagueMembership) => {
    if (!currentLeague) return
    
    const memberId = member.id.toString()
    setUpdatingMembers(prev => new Set(prev).add(memberId))
    
    try {
      const updatedMember = await updateMemberStatus(currentLeague.id, memberId, { 
        isPaid: !member.isPaid 
      })
      
      // Update the member in the list
      setMembers(prev => 
        prev.map(m => m.id === member.id ? { ...m, isPaid: updatedMember.isPaid } : m)
      )
    } catch (error) {
      console.error("Error updating payment status:", error)
      // Could add toast notification here
    } finally {
      setUpdatingMembers(prev => {
        const newSet = new Set(prev)
        newSet.delete(memberId)
        return newSet
      })
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

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-2 border-black">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-retro-blue" />
              <div>
                <div className="text-2xl font-bold">{activeMembers.length}</div>
                <div className="text-sm text-muted-foreground">Active Members</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-black">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-500" />
              <div>
                <div className="text-2xl font-bold">{pendingRequests.length}</div>
                <div className="text-sm text-muted-foreground">Pending Requests</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-black">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-green-500" />
              <div>
                <div className="text-2xl font-bold">{activeMembers.filter((m) => m.isPaid).length}</div>
                <div className="text-sm text-muted-foreground">Paid Members</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-black">
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

      {/* Admin Tabs */}
      <Tabs defaultValue="members" className="w-full">
        <TabsList className="grid w-full grid-cols-4 border-2 border-black">
          <TabsTrigger value="members" className="font-heading">
            Members ({activeMembers.length})
          </TabsTrigger>
          <TabsTrigger value="requests" className="font-heading">
            Requests ({pendingRequests.length})
          </TabsTrigger>
          <TabsTrigger value="settings" className="font-heading">
            Settings
          </TabsTrigger>
          <TabsTrigger value="analytics" className="font-heading">
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-4">
          <Card className="border-4 border-black">
            <CardHeader className="bg-retro-blue text-white border-b-4 border-black">
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
                          <div className="font-bold">{member.teamName}</div>
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

        <TabsContent value="requests" className="space-y-4">
          <Card className="border-4 border-black">
            <CardHeader className="bg-yellow-500 text-black border-b-4 border-black">
              <CardTitle>Join Requests</CardTitle>
              <CardDescription className="text-black/80">Review pending membership requests</CardDescription>
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

        <TabsContent value="settings" className="space-y-4">
          <Card className="border-4 border-black">
            <CardHeader className="bg-retro-green text-white border-b-4 border-black">
              <CardTitle>League Settings</CardTitle>
              <CardDescription className="text-white/80">Configure your league</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <Link href="/admin/settings">
                  <Button variant="pixel" className="w-full">
                    <Settings className="h-4 w-4 mr-2" />
                    Edit League Settings
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card className="border-4 border-black">
            <CardHeader className="bg-retro-purple text-white border-b-4 border-black">
              <CardTitle>League Analytics</CardTitle>
              <CardDescription className="text-white/80">View league statistics and insights</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="text-center py-8">
                <p className="text-muted-foreground">Analytics dashboard coming soon...</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
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
