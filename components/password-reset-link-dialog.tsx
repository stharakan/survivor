"use client"

import { useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Copy, KeyRound, ExternalLink } from "lucide-react"
import { generatePasswordResetLink } from "@/lib/api-client"

interface PasswordResetLinkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  userTeamName: string
  leagueId: string
  onSuccess: (message: string) => void
  onError: (error: string) => void
}

export function PasswordResetLinkDialog({
  open,
  onOpenChange,
  userId,
  userTeamName,
  leagueId,
  onSuccess,
  onError
}: PasswordResetLinkDialogProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [resetLink, setResetLink] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleGenerateLink = async () => {
    setIsGenerating(true)
    try {
      const result = await generatePasswordResetLink(userId, leagueId)
      setResetLink(result.resetLink)
      setUserEmail(result.userEmail)
      setExpiresAt(result.expiresAt)
      onSuccess(`Password reset link generated for ${userTeamName}. Share the link with the user.`)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to generate password reset link')
      onOpenChange(false)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCopyLink = async () => {
    if (resetLink) {
      await navigator.clipboard.writeText(resetLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleOpenLink = () => {
    if (resetLink) {
      window.open(resetLink, '_blank')
    }
  }

  const handleClose = () => {
    setResetLink(null)
    setUserEmail(null)
    setExpiresAt(null)
    setCopied(false)
    onOpenChange(false)
  }

  const formatExpiryTime = (isoString: string) => {
    const date = new Date(isoString)
    return date.toLocaleString()
  }

  // If we have a reset link, show the result dialog
  if (resetLink) {
    return (
      <AlertDialog open={open} onOpenChange={handleClose}>
        <AlertDialogContent className="border-4 border-black max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-retro-green flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Reset Link Generated
            </AlertDialogTitle>
            <AlertDialogDescription>
              A password reset link has been generated for <strong>{userTeamName}</strong> ({userEmail}).
              Share this link with the user so they can reset their password.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-3">
            <Label htmlFor="reset-link" className="text-sm font-medium">
              Password Reset Link
            </Label>
            <div className="flex gap-2">
              <Input
                id="reset-link"
                type="text"
                value={resetLink}
                readOnly
                className="border-2 border-black font-mono text-xs"
              />
              <Button
                variant="outline"
                size="icon"
                className="border-2 border-black flex-shrink-0"
                onClick={handleCopyLink}
                title="Copy link"
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="border-2 border-black flex-shrink-0"
                onClick={handleOpenLink}
                title="Open in new tab"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
            {copied && (
              <p className="text-xs text-retro-green">Link copied to clipboard!</p>
            )}
            
            {expiresAt && (
              <div className="text-xs text-muted-foreground">
                <strong>Expires:</strong> {formatExpiryTime(expiresAt)} (24 hours)
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogAction 
              onClick={handleClose}
              className="border-2 border-black bg-retro-blue hover:bg-retro-blue/80"
            >
              Done
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  // Confirmation dialog
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border-4 border-black">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-heading text-retro-orange flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Generate Password Reset Link
          </AlertDialogTitle>
          <AlertDialogDescription>
            This will generate a secure password reset link for <strong>{userTeamName}</strong> 
            that will be valid for 24 hours. The user can click this link to set a new password.
            <br /><br />
            You can generate multiple links - only the most recent one needs to be used.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-2 border-black bg-transparent">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleGenerateLink}
            disabled={isGenerating}
            className="border-2 border-black bg-retro-orange hover:bg-retro-orange/80"
          >
            {isGenerating ? "Generating..." : "Generate Link"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}