"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useLeague } from "@/hooks/use-league"
import { updateLeagueSettings } from "@/lib/api"
import type { SportsLeagueOption } from "@/types/league"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ArrowLeft, Save, CheckCircle, XCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { AdminGuard } from "@/components/admin-guard"

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

function LeagueSettingsContent() {
  const { user } = useAuth()
  const { currentLeague, refreshLeagues } = useLeague()
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    logo: "",
    sportsLeague: "",
    isPublic: true,
    requiresApproval: false,
  })
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (currentLeague) {
      setFormData({
        name: currentLeague.name,
        description: currentLeague.description,
        logo: currentLeague.logo || "",
        sportsLeague: currentLeague.sportsLeague,
        isPublic: currentLeague.isPublic,
        requiresApproval: currentLeague.requiresApproval,
      })
    }
  }, [currentLeague])

  const handleSave = async () => {
    if (!currentLeague) return

    setSaving(true)
    setSuccess(null)
    setError(null)

    try {
      await updateLeagueSettings(currentLeague.id, formData)
      await refreshLeagues()
      setSuccess("League settings updated successfully!")
    } catch (error) {
      console.error("Error updating league settings:", error)
      setError("Failed to update league settings. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const handleBackClick = () => {
    router.push("/admin")
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
          <h1 className="text-2xl font-heading">League Settings</h1>
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
        {/* Basic Settings */}
        <Card className="border-4 border-black">
          <CardHeader className="bg-retro-green text-white border-b-4 border-black">
            <CardTitle>Basic Information</CardTitle>
            <CardDescription className="text-white/80">Update your league's basic details</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="league-name">League Name</Label>
                <Input
                  id="league-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="border-2 border-black"
                  placeholder="Enter league name"
                />
              </div>

              <div>
                <Label htmlFor="league-description">Description</Label>
                <Textarea
                  id="league-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="border-2 border-black"
                  placeholder="Describe your league"
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="league-logo">League Logo URL</Label>
                <Input
                  id="league-logo"
                  value={formData.logo}
                  onChange={(e) => setFormData({ ...formData, logo: e.target.value })}
                  className="border-2 border-black"
                  placeholder="https://example.com/logo.png"
                />
                <div className="text-xs text-muted-foreground mt-1">Optional: URL to your league's logo image</div>
              </div>

              <div>
                <Label htmlFor="sports-league">Sports League</Label>
                <Select
                  value={formData.sportsLeague}
                  onValueChange={(value) => setFormData({ ...formData, sportsLeague: value })}
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
          <CardHeader className="bg-retro-blue text-white border-b-4 border-black">
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
                  checked={formData.isPublic}
                  onCheckedChange={(checked) => setFormData({ ...formData, isPublic: checked })}
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
                  checked={formData.requiresApproval}
                  onCheckedChange={(checked) => setFormData({ ...formData, requiresApproval: checked })}
                />
              </div>

              <div className="border-2 border-black p-3 bg-gray-50 dark:bg-gray-800">
                <h4 className="font-medium mb-2">Privacy Settings Summary</h4>
                <div className="text-sm space-y-1">
                  <div>
                    <strong>Visibility:</strong> {formData.isPublic ? "Public" : "Private"}
                  </div>
                  <div>
                    <strong>Join Process:</strong>{" "}
                    {formData.requiresApproval ? "Admin approval required" : "Instant join"}
                  </div>
                </div>
              </div>

              <Button variant="pixel" className="w-full" onClick={handleSave} disabled={saving}>
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
    </div>
  )
}

export default function LeagueSettingsPage() {
  return (
    <AdminGuard>
      <LeagueSettingsContent />
    </AdminGuard>
  )
}
