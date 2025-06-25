"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, Check, Trash2, Plus, Key, Settings } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { Setting } from "@/types"

export default function ProfilePage() {
  const [settings, setSettings] = useState<Setting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Google Drive credentials
  const [googleDriveCredentials, setGoogleDriveCredentials] = useState("")
  const [hasGoogleDriveCredentials, setHasGoogleDriveCredentials] = useState(false)

  // New setting form
  const [newSetting, setNewSetting] = useState({
    key: "",
    value: "",
    description: "",
    isEncrypted: false
  })

  useEffect(() => {
    fetchSettings()
    fetchGoogleDriveStatus()
  }, [])

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings')
      const data = await response.json()
      
      if (data.success) {
        setSettings(data.settings)
      } else {
        setError(data.error || "Failed to fetch settings")
      }
    } catch (err) {
      setError("Failed to fetch settings")
    } finally {
      setLoading(false)
    }
  }

  const fetchGoogleDriveStatus = async () => {
    try {
      const response = await fetch('/api/settings/google-drive')
      const data = await response.json()
      
      if (data.success) {
        setHasGoogleDriveCredentials(data.hasCredentials)
      }
    } catch (err) {
      console.error("Failed to fetch Google Drive status:", err)
    }
  }

  const saveSetting = async (key: string, value: string, description?: string, isEncrypted = false) => {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key,
          value,
          description,
          isEncrypted
        }),
      })

      const data = await response.json()

      if (data.success) {
        setSuccess("Setting saved successfully")
        await fetchSettings()
      } else {
        setError(data.error || "Failed to save setting")
      }
    } catch (err) {
      setError("Failed to save setting")
    } finally {
      setSaving(false)
    }
  }

  const deleteSetting = async (key: string) => {
    if (!confirm(`Are you sure you want to delete the setting "${key}"?`)) {
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch(`/api/settings?key=${encodeURIComponent(key)}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (data.success) {
        setSuccess("Setting deleted successfully")
        await fetchSettings()
      } else {
        setError(data.error || "Failed to delete setting")
      }
    } catch (err) {
      setError("Failed to delete setting")
    } finally {
      setSaving(false)
    }
  }

  const saveGoogleDriveCredentials = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/settings/google-drive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          credentials: googleDriveCredentials
        }),
      })

      const data = await response.json()

      if (data.success) {
        setSuccess("Google Drive credentials saved successfully")
        setGoogleDriveCredentials("")
        await fetchGoogleDriveStatus()
      } else {
        setError(data.error || "Failed to save credentials")
      }
    } catch (err) {
      setError("Failed to save credentials")
    } finally {
      setSaving(false)
    }
  }

  const deleteGoogleDriveCredentials = async () => {
    if (!confirm("Are you sure you want to delete your Google Drive credentials?")) {
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/settings/google-drive', {
        method: 'DELETE',
      })

      const data = await response.json()

      if (data.success) {
        setSuccess("Google Drive credentials deleted successfully")
        await fetchGoogleDriveStatus()
      } else {
        setError(data.error || "Failed to delete credentials")
      }
    } catch (err) {
      setError("Failed to delete credentials")
    } finally {
      setSaving(false)
    }
  }

  const handleAddSetting = async () => {
    if (!newSetting.key.trim()) {
      setError("Setting key is required")
      return
    }

    await saveSetting(
      newSetting.key, 
      newSetting.value, 
      newSetting.description,
      newSetting.isEncrypted
    )

    // Reset form
    setNewSetting({
      key: "",
      value: "",
      description: "",
      isEncrypted: false
    })
  }

  if (loading) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">Loading settings...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Settings className="w-8 h-8" />
          Profile & Settings
        </h1>
        <p className="text-gray-600 mt-2">Manage your account settings and integrations</p>
      </div>

      {error && (
        <Alert className="mb-6 border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-700">{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="mb-6 border-green-200 bg-green-50">
          <Check className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-700">{success}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="integrations" className="space-y-6">
        <TabsList>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="integrations" className="space-y-6">
          {/* Google Drive Integration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5" />
                Google Drive Integration
              </CardTitle>
              <CardDescription>
                Configure Google Drive service account credentials to enable folder processing
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <span>Status:</span>
                <Badge variant={hasGoogleDriveCredentials ? "default" : "secondary"}>
                  {hasGoogleDriveCredentials ? "Configured" : "Not configured"}
                </Badge>
              </div>

              {hasGoogleDriveCredentials ? (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Google Drive credentials are configured. You can now process Google Drive folders.
                  </p>
                  <Button 
                    onClick={deleteGoogleDriveCredentials}
                    variant="destructive"
                    disabled={saving}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Remove Credentials
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="google-credentials">Service Account JSON</Label>
                    <Textarea
                      id="google-credentials"
                      placeholder="Paste your Google Drive service account JSON credentials here..."
                      value={googleDriveCredentials}
                      onChange={(e) => setGoogleDriveCredentials(e.target.value)}
                      rows={10}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Get this from Google Cloud Console → IAM & Admin → Service Accounts
                    </p>
                  </div>
                  <Button 
                    onClick={saveGoogleDriveCredentials}
                    disabled={saving || !googleDriveCredentials.trim()}
                  >
                    Save Credentials
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          {/* Add New Setting */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="w-5 h-5" />
                Add New Setting
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="new-key">Key</Label>
                  <Input
                    id="new-key"
                    value={newSetting.key}
                    onChange={(e) => setNewSetting({...newSetting, key: e.target.value})}
                    placeholder="setting_key"
                  />
                </div>
                <div>
                  <Label htmlFor="new-value">Value</Label>
                  <Input
                    id="new-value"
                    value={newSetting.value}
                    onChange={(e) => setNewSetting({...newSetting, value: e.target.value})}
                    placeholder="setting value"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="new-description">Description (optional)</Label>
                <Input
                  id="new-description"
                  value={newSetting.description}
                  onChange={(e) => setNewSetting({...newSetting, description: e.target.value})}
                  placeholder="Description of this setting"
                />
              </div>
              <Button onClick={handleAddSetting} disabled={saving}>
                <Plus className="w-4 h-4 mr-2" />
                Add Setting
              </Button>
            </CardContent>
          </Card>

          {/* Existing Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Current Settings</CardTitle>
              <CardDescription>
                Manage your custom settings and configurations
              </CardDescription>
            </CardHeader>
            <CardContent>
              {settings.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No custom settings configured</p>
              ) : (
                <div className="space-y-4">
                  {settings.map((setting) => (
                    <div key={setting.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium">{setting.key}</h3>
                            {setting.is_encrypted && (
                              <Badge variant="secondary" className="text-xs">
                                <Key className="w-3 h-3 mr-1" />
                                Encrypted
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mt-1">
                            {setting.description || "No description"}
                          </p>
                          <p className="text-xs text-gray-500 mt-2">
                            {setting.is_encrypted ? "***ENCRYPTED***" : setting.value}
                          </p>
                        </div>
                        <Button
                          onClick={() => deleteSetting(setting.key)}
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          disabled={saving}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
