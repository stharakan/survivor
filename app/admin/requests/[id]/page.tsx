"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useLeague } from "@/hooks/use-league"
import { getJoinRequests, approveJoinRequest, rejectJoinRequest } from "@/lib/api"
import type { JoinRequest } from "@/types/league"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ArrowLeft, CheckCircle, XCircle, User, Calendar, MessageSquare } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import Image from "next/image"
import { AdminGuard } from "@/components/admin-guard"

function JoinRequestReviewContent() {
  const { user } = useAuth()
  const { currentLeague } = useLeague()
  const [request, setRequest] = useState<JoinRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const params = useParams()
  const router = useRouter()
  const requestId = Number(params.id)

  useEffect(() => {
    const fetchRequest = async () => {
      if (user && currentLeague && requestId) {
        try {
          const requests = await getJoinRequests(currentLeague.id)
          const foundRequest = requests.find((r) => r.id === requestId)
          if (foundRequest) {
            setRequest(foundRequest)
          } else {
            router.push("/admin")
          }
        } catch (error) {
          console.error("Error fetching join request:", error)
          router.push("/admin")
        } finally {
          setLoading(false)
        }
      }
    }

    fetchRequest()
  }, [user, currentLeague, requestId, router])

  const handleApprove = async () => {
    if (!request) return

    setProcessing(true)
    setSuccess(null)
    setError(null)

    try {
      await approveJoinRequest(request.id)
      setSuccess("Join request approved successfully! The user has been added to the league.")
      setTimeout(() => {
        router.push("/admin")
      }, 2000)
    } catch (error) {
      console.error("Error approving request:", error)
      setError("Failed to approve join request. Please try again.")
    } finally {
      setProcessing(false)
    }
  }

  const handleReject = async () => {
    if (!request) return

    setProcessing(true)
    setSuccess(null)
    setError(null)

    try {
      await rejectJoinRequest(request.id)
      setSuccess("Join request rejected. The user has been notified.")
      setTimeout(() => {
        router.push("/admin")
      }, 2000)
    } catch (error) {
      console.error("Error rejecting request:", error)
      setError("Failed to reject join request. Please try again.")
    } finally {
      setProcessing(false)
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

  if (!request) {
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
          <h1 className="text-2xl font-heading">Review Join Request</h1>
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
        {/* Request Details */}
        <Card className="border-4 border-black">
          <CardHeader className="bg-yellow-500 text-black border-b-4 border-black">
            <CardTitle>Request Details</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <User className="h-5 w-5 text-retro-blue" />
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Username</div>
                  <div className="font-bold">{request.user.username}</div>
                  <div className="text-sm text-muted-foreground">{request.user.email}</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-retro-green" />
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Requested</div>
                  <div className="font-bold">{new Date(request.requestedAt).toLocaleDateString()}</div>
                  <div className="text-sm text-muted-foreground">
                    {new Date(request.requestedAt).toLocaleTimeString()}
                  </div>
                </div>
              </div>

              <div className="border-2 border-black p-3 bg-gray-50 dark:bg-gray-800">
                <div className="text-sm font-medium text-muted-foreground mb-2">Proposed Team Name</div>
                <div className="font-bold text-lg">{request.teamName}</div>
              </div>

              {request.message && (
                <div className="flex items-start gap-3">
                  <MessageSquare className="h-5 w-5 text-retro-purple mt-1" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-muted-foreground mb-2">Message</div>
                    <div className="border-2 border-black p-3 bg-gray-50 dark:bg-gray-800">
                      <p className="text-sm">{request.message}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <Card className="border-4 border-black">
          <CardHeader className="bg-retro-orange text-white border-b-4 border-black">
            <CardTitle>Review Actions</CardTitle>
            <CardDescription className="text-white/80">Approve or reject this join request</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="p-4 border-2 border-green-500 bg-green-50 dark:bg-green-900/20">
                <h3 className="font-bold text-green-700 dark:text-green-400 mb-2">Approve Request</h3>
                <p className="text-sm text-green-600 dark:text-green-300 mb-4">
                  The user will be added to the league immediately and can start making picks.
                </p>
                <Button
                  variant="pixel"
                  className="w-full bg-green-600 hover:bg-green-700"
                  onClick={handleApprove}
                  disabled={processing}
                >
                  {processing ? (
                    "Approving..."
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve Request
                    </>
                  )}
                </Button>
              </div>

              <div className="p-4 border-2 border-red-500 bg-red-50 dark:bg-red-900/20">
                <h3 className="font-bold text-red-700 dark:text-red-400 mb-2">Reject Request</h3>
                <p className="text-sm text-red-600 dark:text-red-300 mb-4">
                  The user will be notified that their request was not approved.
                </p>
                <Button
                  variant="destructive"
                  className="w-full border-2 border-black"
                  onClick={handleReject}
                  disabled={processing}
                >
                  {processing ? (
                    "Rejecting..."
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject Request
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function JoinRequestReviewPage() {
  return (
    <AdminGuard>
      <JoinRequestReviewContent />
    </AdminGuard>
  )
}
