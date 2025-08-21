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
import { Copy, Eye, EyeOff, KeyRound } from "lucide-react"
import { resetUserPassword } from "@/lib/api-client"

interface PasswordResetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  userTeamName: string
  leagueId: string
  onSuccess: (message: string) => void
  onError: (error: string) => void
}

export function PasswordResetDialog({
  open,
  onOpenChange,
  userId,
  userTeamName,
  leagueId,
  onSuccess,
  onError
}: PasswordResetDialogProps) {
  const [isResetting, setIsResetting] = useState(false)
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleReset = async () => {
    setIsResetting(true)
    try {
      const result = await resetUserPassword(userId, leagueId)
      setTempPassword(result.temporaryPassword)
      setUserEmail(result.userEmail)
      onSuccess(`Password reset successful for ${userTeamName}. Share the temporary password with the user.`)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to reset password')
      onOpenChange(false)
    } finally {
      setIsResetting(false)
    }
  }

  const handleCopyPassword = async () => {
    if (tempPassword) {
      await navigator.clipboard.writeText(tempPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleClose = () => {
    setTempPassword(null)
    setUserEmail(null)
    setShowPassword(false)
    setCopied(false)
    onOpenChange(false)
  }

  // If we have a temporary password, show the result dialog
  if (tempPassword) {
    return (
      <AlertDialog open={open} onOpenChange={handleClose}>
        <AlertDialogContent className="border-4 border-black max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-retro-green flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Password Reset Complete
            </AlertDialogTitle>
            <AlertDialogDescription>
              A temporary password has been generated for <strong>{userTeamName}</strong> ({userEmail}).
              Share this password with the user so they can log in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-3">
            <Label htmlFor="temp-password" className="text-sm font-medium">
              Temporary Password
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="temp-password"
                  type={showPassword ? "text" : "password"}
                  value={tempPassword}
                  readOnly
                  className="border-2 border-black font-mono pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1 h-7 w-7"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="border-2 border-black"
                onClick={handleCopyPassword}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            {copied && (
              <p className="text-xs text-retro-green">Password copied to clipboard!</p>
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
            Reset Password
          </AlertDialogTitle>
          <AlertDialogDescription>
            This will generate a new temporary password for <strong>{userTeamName}</strong> 
            and immediately update their account. The user will need to use this temporary 
            password to log in.
            <br /><br />
            <strong>This action cannot be undone.</strong>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-2 border-black bg-transparent">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleReset}
            disabled={isResetting}
            className="border-2 border-black bg-retro-orange hover:bg-retro-orange/80"
          >
            {isResetting ? "Resetting..." : "Reset Password"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}