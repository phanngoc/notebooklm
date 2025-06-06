"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { supabase } from "@/lib/supabase"

export default function DebugPage() {
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const testConnection = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.from("profiles").select("email").limit(1)
      setResult({
        test: "Connection Test",
        data,
        error: error?.message || null,
        success: !error,
      })
    } catch (err: any) {
      setResult({
        test: "Connection Test",
        error: err.message,
        success: false,
      })
    } finally {
      setLoading(false)
    }
  }

  const testProfiles = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.from("profiles").select("id, email, full_name, created_at").limit(10)

      setResult({
        test: "Profiles Test",
        data,
        error: error?.message || null,
        success: !error,
        count: data?.length || 0,
      })
    } catch (err: any) {
      setResult({
        test: "Profiles Test",
        error: err.message,
        success: false,
      })
    } finally {
      setLoading(false)
    }
  }

  const testAuth = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/auth/signin", {
        method: "GET",
      })

      setResult({
        test: "Auth Endpoint Test",
        status: response.status,
        statusText: response.statusText,
        success: response.ok,
        url: response.url,
      })
    } catch (err: any) {
      setResult({
        test: "Auth Endpoint Test",
        error: err.message,
        success: false,
      })
    } finally {
      setLoading(false)
    }
  }

  const testEnvVars = () => {
    const envVars = {
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      NEXTAUTH_SECRET: !!process.env.NEXTAUTH_SECRET,
      NODE_ENV: process.env.NODE_ENV,
      // Note: Server-side env vars won't be visible in client-side code
    }

    setResult({
      test: "Environment Variables",
      data: envVars,
      success: envVars.NEXT_PUBLIC_SUPABASE_URL && envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    })
  }

  return (
    <div className="container mx-auto p-8">
      <Card>
        <CardHeader>
          <CardTitle>Database & Auth Debug</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 flex-wrap">
            <Button onClick={testEnvVars} disabled={loading}>
              Test Environment Variables
            </Button>
            <Button onClick={testConnection} disabled={loading}>
              Test Database Connection
            </Button>
            <Button onClick={testProfiles} disabled={loading}>
              Test Profiles Table
            </Button>
            <Button onClick={testAuth} disabled={loading}>
              Test Auth Endpoint
            </Button>
          </div>

          {result && (
            <div className="mt-4">
              <h3 className="font-semibold mb-2">
                {result.test} - {result.success ? "✅ Success" : "❌ Failed"}
              </h3>
              <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto max-h-96">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}

          <div className="mt-6 p-4 bg-blue-50 rounded">
            <h4 className="font-semibold mb-2">Setup Checklist:</h4>
            <ul className="text-sm space-y-1">
              <li>
                ✓ Environment variables are set (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
                SUPABASE_SERVICE_ROLE_KEY)
              </li>
              <li>✓ Database tables are created (run SQL scripts)</li>
              <li>✓ Test user profiles are seeded</li>
              <li>✓ NextAuth is properly configured</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
