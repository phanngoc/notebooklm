"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { useAuth } from "@/hooks/use-auth"
import { Loader2 } from "lucide-react"
import { SourcesPanel } from "@/components/sources-panel"
import { ChatPanel } from "@/components/chat-panel"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Document, ChatMessage } from "@/types"
import Dashboard from "@/components/dashboard"

export default function ProjectDetail() {
  const { projectId } = useParams()
  const { user, loading: authLoading } = useAuth()
  let userId = user?.id

  if (!projectId || typeof projectId !== 'string') {
    return <div>Invalid project ID</div>
  }

  return (
    <Dashboard 
      userId={userId} 
      projectId={projectId} 
      authLoading={authLoading} 
    />
  )
} 