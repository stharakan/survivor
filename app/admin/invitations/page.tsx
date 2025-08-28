"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function AdminInvitationsRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.push("/admin?tab=invitations")
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="text-lg font-heading mb-2">Redirecting...</div>
        <div className="text-sm text-muted-foreground">Taking you to the new admin invitations</div>
      </div>
    </div>
  )
}