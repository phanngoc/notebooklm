"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { SourcesPanel } from "@/components/sources-panel"
import { ChatPanel } from "@/components/chat-panel"
import { StudioPanel } from "@/components/studio-panel"
import { useToast } from "@/hooks/use-toast"
import { useNotesStore } from "@/hooks/use-notes-store"
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
  const [documents, setDocuments] = useState<Document[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isInitializing, setIsInitializing] = useState(true)
  const { toast } = useToast()
  const [userName, setUserName] = useState<string>("")
  const [projectName, setProjectName] = useState<string>("")
  
  // Use Zustand store for notes
  const { 
    notes, 
    isLoading: notesLoading,
    error: notesError,
    fetchNotes,
    createNote,
    removeNote,
    convertNoteToSource
  } = useNotesStore()

  // Handle notes errors
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
    if (userId && projectId) {
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

      // Fetch sources and chat sessions, but use Zustand for notes
      const [sourcesResponse, sessionsResponse] = await Promise.all([
        fetch(`/api/sources?projectId=${projectId}`),
        fetch(`/api/chat/sessions/list?projectId=${projectId}`),
      ])

      if (!sourcesResponse.ok || !sessionsResponse.ok) {
        throw new Error("Failed to fetch user data")
      }

      const [sources, sessions] = await Promise.all([
        sourcesResponse.json(),
        sessionsResponse.json(),
      ])

      // Fetch notes using Zustand store
      await fetchNotes(projectId)

      console.log("Loaded data:", { sources: sources.length, notes: notes.length, sessions: sessions.length })

      setDocuments(sources)

      // Create a new chat session if none exists
      if (sessions.length === 0) {
        console.log("Creating new chat session")
        const createResponse = await fetch("/api/chat/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "New Chat", projectId }),
        })
        if (!createResponse.ok) {
          throw new Error("Failed to create chat session")
        }
        const newSession = await createResponse.json()
        setCurrentSessionId(newSession.id)
        setMessages([])
      } else {
        // Load the most recent chat session
        const latestSession = sessions[0]
        console.log("Loading latest session:", latestSession.id)
        setCurrentSessionId(latestSession.id)
        const messagesResponse = await fetch(`/api/chat/sessions/${latestSession.id}/messages`)
        if (messagesResponse.ok) {
          const messages = await messagesResponse.json()
          setMessages(messages)
        }
      }
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
      setIsLoading(true)
      toast({
        title: "Processing document",
        description: "Please wait while we process your document...",
      })

      // Process document with vector embeddings via API
      const response = await fetch("/api/documents/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...doc,
          userId,
          projectId,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to process document")
      }

      const result = await response.json()

      // Reload sources
      const sourcesResponse = await fetch(`/api/sources?projectId=${projectId}`)
      if (sourcesResponse.ok) {
        const sources = await sourcesResponse.json()
        setDocuments(
          sources.map((s: any) => ({
            ...s,
            selected: s.id === result.sourceId ? true : false,
          })),
        )
      }

      toast({
        title: "Document added",
        description: `Your document has been successfully processed into ${result.chunksProcessed} chunks.`,
      })
    } catch (error) {
      console.error("Error adding document:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to process document. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const toggleDocumentSelection = (id: string) => {
    setDocuments((prev) => prev.map((doc) => (doc.id === id ? { ...doc, selected: !doc.selected } : doc)))
  }

  const removeDocument = async (id: string) => {
    try {
      setIsLoading(true)

      // Delete document via API
      const response = await fetch(`/api/documents/${id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to delete document")
      }

      // Update local state
      setDocuments((prev) => prev.filter((doc) => doc.id !== id))

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
    } finally {
      setIsLoading(false)
    }
  }

  const sendMessage = async (content: string) => {
    if (!currentSessionId) return

    const selectedSources = documents.filter((doc) => doc.selected)
    if (selectedSources.length === 0) {
      toast({
        title: "No sources selected",
        description: "Please select at least one document to chat with.",
        variant: "destructive",
      })
      return
    }

    try {
      setIsLoading(true)

      // Add user message to local state immediately for better UX
      const userMessageLocal: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, userMessageLocal])

      // Send to chat API
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          sourceIds: selectedSources.map((doc) => doc.id),
          sessionId: currentSessionId,
          projectId,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to get AI response")
      }

      const result = await response.json()

      // Add AI response to local state
      const aiMessageLocal: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.response,
        timestamp: new Date(),
        sources: result.sources,
      }
      setMessages((prev) => [...prev, aiMessageLocal])

      // Reload messages from database to ensure consistency
      const messagesResponse = await fetch(`/api/chat/sessions/${currentSessionId}/messages`)
      if (messagesResponse.ok) {
        const updatedMessages = await messagesResponse.json()
        setMessages(updatedMessages)
      }
    } catch (error) {
      console.error("Error sending message:", error)

      // Add error message to local state
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Sorry, I encountered an error while processing your request.",
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])

      toast({
        title: "Error",
        description: "Failed to get a response. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const addNote = async (note: Omit<Note, "id" | "createdAt">) => {
    try {
      // Get selected source IDs
      const selectedSourceIds = documents.filter((doc) => doc.selected).map((doc) => doc.id)
      
      await createNote(note, projectId, selectedSourceIds)

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

  const deleteNote = async (noteId: string) => {
    try {
      await removeNote(noteId)

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

      // Reload documents to include the new source
      await fetchDocuments()

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

  const fetchDocuments = async () => {
    try {
      const response = await fetch(`/api/sources?projectId=${projectId}`)
      if (response.ok) {
        const sources = await response.json()
        setDocuments(sources)
      }
    } catch (error) {
      console.error("Error fetching documents:", error)
    }
  }

  const createNewChatSession = async () => {
    try {
      setIsLoading(true)

      // Create new chat session
      const createResponse = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Chat", projectId }),
      })
      if (!createResponse.ok) {
        throw new Error("Failed to create chat session")
      }
      const newSession = await createResponse.json()

      // Update state
      setCurrentSessionId(newSession.id)
      setMessages([])

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
    } finally {
      setIsLoading(false)
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
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 py-2 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleBackToProjects}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Projects
            </Button>
            <h1 className="text-xl font-bold">NotebookLLM</h1>
            {projectName && (
              <div className="text-gray-500">
                <span className="text-sm">•</span>
                <span className="text-sm ml-2">{projectName}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4" />
              <span className="text-sm">{userName}</span>
            </div>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <SourcesPanel
          documents={documents}
          onAddDocument={addDocument}
          onToggleSelection={toggleDocumentSelection}
          onRemoveDocument={removeDocument}
          isLoading={isLoading}
        />

        <ChatPanel
          messages={messages}
          documents={documents.filter((doc) => doc.selected)}
          onSendMessage={sendMessage}
          isLoading={isLoading}
          onNewChat={createNewChatSession}
          sessionId={currentSessionId}
        />

        <StudioPanel
          notes={notes}
          onAddNote={addNote}
          onDeleteNote={deleteNote}
          onConvertToSource={handleConvertNoteToSource}
          documents={documents.filter((doc) => doc.selected)}
          isLoading={isLoading || notesLoading}
          projectId={projectId}
        />
      </div>
    </div>
  )
}
