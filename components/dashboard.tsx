"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { SourcesPanel } from "@/components/sources-panel"
import { ChatPanel } from "@/components/chat-panel"
import { StudioPanel } from "@/components/studio-panel"
import { useToast } from "@/hooks/use-toast"
import { useAppStore } from "@/hooks/use-app-store"
import type { Document, ChatMessage, Note } from "@/types"
import { Loader2, LogOut, User, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/use-auth"

interface DashboardProps {
  userId: string | undefined
  projectId: string
  authLoading?: boolean
}

export default function Dashboard({ userId, projectId, authLoading }: DashboardProps) {
  const router = useRouter()
  const { logout } = useAuth()
  const [isInitializing, setIsInitializing] = useState(true)
  const { toast } = useToast()
  const [isStudioExpanded, setIsStudioExpanded] = useState(false)
  const hasInitialized = useRef(false)
  
  // Use unified Zustand store
  const {
    // Documents
    documents,
    documentsLoading,
    documentsError,
    addDocumentAsync,
    removeDocumentAsync,
    
    // Sessions and messages
    sessions,
    currentSessionId,
    messages,
    sessionsLoading,
    sessionsError,
    createSessionAsync,
    sendMessageAsync,
    
    // Notes
    notes,
    notesLoading,
    notesError,
    createNoteAsync,
    updateNoteAsync,
    removeNoteAsync,
    convertNoteToSource,
    
    // Project and user info
    setProjectName,
    setUserName,
    
    // General
    isLoading,
    initializeProject,
  } = useAppStore()

  // Handle errors from store
  useEffect(() => {
    if (documentsError) {
      toast({
        title: "Error",
        description: documentsError,
        variant: "destructive",
      })
    }
  }, [documentsError, toast])

  useEffect(() => {
    if (sessionsError) {
      toast({
        title: "Error",
        description: sessionsError,
        variant: "destructive",
      })
    }
  }, [sessionsError, toast])

  useEffect(() => {
    if (notesError) {
      toast({
        title: "Error",
        description: notesError,
        variant: "destructive",
      })
    }
  }, [notesError, toast])

  useEffect(() => {
    if (userId && projectId && !hasInitialized.current) {
      console.log("Initializing dashboard for user:", userId, "project:", projectId)
      hasInitialized.current = true
      loadUserData(userId, projectId)
    }
  }, [userId, projectId])

  const loadUserData = async (userId: string, projectId: string) => {
    try {
      setIsInitializing(true)
      console.log("Loading user data for:", userId)

      // Fetch user profile and project info
      const [profileResponse, projectResponse] = await Promise.all([
        fetch("/api/user/profile"),
        fetch(`/api/projects/${projectId}`)
      ])
      
      if (profileResponse.ok) {
        const { profile } = await profileResponse.json()
        if (profile) {
          setUserName(profile.full_name || profile.email)
        }
      }

      if (projectResponse.ok) {
        const project = await projectResponse.json()
        setProjectName(project.name || "Untitled Project")
      }

      // Initialize all project data using the unified store
      await initializeProject(projectId, userId)

      console.log("Loaded data:", { sources: documents.length, notes: notes.length, sessions: sessions.length })
    } catch (error) {
      console.error("Error loading user data:", error)
      toast({
        title: "Error",
        description: "Failed to load your data. Please try refreshing the page.",
        variant: "destructive",
      })
    } finally {
      setIsInitializing(false)
    }
  }

  const addDocument = async (doc: Omit<Document, "id" | "createdAt" | "selected">) => {
    try {
      toast({
        title: "Processing document",
        description: "Please wait while we process your document...",
      })

      await addDocumentAsync(doc, userId!, projectId)

      toast({
        title: "Document added",
        description: "Your document has been successfully processed.",
      })
    } catch (error) {
      console.error("Error adding document:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to process document. Please try again.",
        variant: "destructive",
      })
    }
  }

  const removeDocument = async (id: string) => {
    try {
      await removeDocumentAsync(id)

      toast({
        title: "Document removed",
        description: "The document has been successfully removed.",
      })
    } catch (error) {
      console.error("Error removing document:", error)
      toast({
        title: "Error",
        description: "Failed to remove document. Please try again.",
        variant: "destructive",
      })
    }
  }

  const sendMessage = async (content: string) => {
    if (!currentSessionId) return

    // Check if there are any documents available
    if (documents.length === 0) {
      toast({
        title: "No sources available",
        description: "Please add at least one document to chat with.",
        variant: "destructive",
      })
      return
    }

    try {
      // Use all documents instead of selected ones
      const allSourceIds = documents.map((doc) => doc.id)
      await sendMessageAsync(content, allSourceIds, currentSessionId, projectId)
    } catch (error) {
      console.error("Error sending message:", error)
      toast({
        title: "Error",
        description: "Failed to get a response. Please try again.",
        variant: "destructive",
      })
    }
  }

  const addNote = async (note: Omit<Note, "id" | "createdAt">) => {
    try {
      // Use all documents instead of selected ones
      const allSourceIds = documents.map((doc) => doc.id)
      console.log("addNote: All source IDs:", allSourceIds)
      await createNoteAsync(note, projectId, allSourceIds)

      toast({
        title: "Note added",
        description: "Your note has been successfully saved.",
      })
    } catch (error) {
      console.error("Error adding note:", error)
      toast({
        title: "Error",
        description: "Failed to save note. Please try again.",
        variant: "destructive",
      })
    }
  }

  const updateNote = async (noteId: string, note: Omit<Note, "id" | "createdAt">) => {
    try {
      await updateNoteAsync(noteId, note)

      toast({
        title: "Note updated",
        description: "Your note has been successfully updated.",
      })
    } catch (error) {
      console.error("Error updating note:", error)
      toast({
        title: "Error",
        description: "Failed to update note. Please try again.",
        variant: "destructive",
      })
    }
  }

  const deleteNote = async (noteId: string) => {
    try {
      await removeNoteAsync(noteId)

      toast({
        title: "Note deleted",
        description: "The note has been successfully deleted.",
      })
    } catch (error) {
      console.error("Error deleting note:", error)
      toast({
        title: "Error",
        description: "Failed to delete note. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleConvertNoteToSource = async (noteId: string) => {
    try {
      await convertNoteToSource(noteId, projectId)

      toast({
        title: "Note converted to source",
        description: "Your note has been successfully converted to a source.",
      })
    } catch (error) {
      console.error("Error converting note to source:", error)
      toast({
        title: "Error",
        description: "Failed to convert note to source. Please try again.",
        variant: "destructive",
      })
    }
  }

  const createNewChatSession = async () => {
    try {
      await createSessionAsync("New Chat", projectId)

      toast({
        title: "New chat created",
        description: "You can now start a new conversation.",
      })
    } catch (error) {
      console.error("Error creating new chat session:", error)
      toast({
        title: "Error",
        description: "Failed to create new chat. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleSignOut = async () => {
    await logout()
    router.push("/login")
  }

  const handleBackToProjects = () => {
    router.push("/")
  }

  // Show loading while initializing or auth is loading
  if (authLoading || isInitializing) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-lg">
            {authLoading ? "Authenticating..." : "Loading your workspace..."}
          </p>
        </div>
      </div>
    )
  }

  // Check if user is authenticated
  if (!userId) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg">Please log in to access your workspace.</p>
        </div>
      </div>
    )
  }

  // Main application interface
  return (
    <div className="flex flex-1 min-h-[600px]">
      <SourcesPanel
        documents={documents}
        onAddDocument={addDocument}
        onRemoveDocument={removeDocument}
        projectId={projectId}
        isLoading={documentsLoading || isLoading}
      />

      <div className={`transition-all duration-300 flex-1 ${!isStudioExpanded ? 'min-w-[600px]' : 'min-w-[400px]'}`}>
        <ChatPanel
          messages={messages}
          documents={documents}
          onSendMessage={sendMessage}
          isLoading={sessionsLoading || isLoading}
          onNewChat={createNewChatSession}
          sessionId={currentSessionId}
        />
      </div>

      <StudioPanel
        notes={notes}
        onAddNote={addNote}
        onUpdateNote={updateNote}
        onDeleteNote={deleteNote}
        onConvertToSource={handleConvertNoteToSource}
        documents={documents}
        isLoading={notesLoading || isLoading}
        projectId={projectId}
        isExpanded={isStudioExpanded}
        onExpandedChange={setIsStudioExpanded}
      />
    </div>
  )
}
