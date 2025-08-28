"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function AdminSettingsRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.push("/admin?tab=settings")
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="text-lg font-heading mb-2">Redirecting...</div>
        <div className="text-sm text-muted-foreground">Taking you to the new admin settings</div>
      </div>
    </div>
  )
}