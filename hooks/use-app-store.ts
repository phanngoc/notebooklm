import { create } from 'zustand'
import type { Note, Document, ChatSession, ChatMessage } from '@/types'

interface AppState {
  // Sources state
  documents: Document[]
  documentsLoading: boolean
  documentsError: string | null
  
  // Chat sessions state
  sessions: ChatSession[]
  currentSessionId: string | null
  messages: ChatMessage[]
  sessionsLoading: boolean
  sessionsError: string | null
  
  // Notes state
  notes: Note[]
  notesLoading: boolean
  notesError: string | null
  
  // General loading state
  isLoading: boolean
  
  // Sources actions
  setDocuments: (documents: Document[]) => void
  addDocument: (document: Document) => void
  removeDocument: (documentId: string) => void
  updateDocument: (documentId: string, updates: Partial<Document>) => void
  toggleDocumentSelection: (documentId: string) => void
  setDocumentsLoading: (loading: boolean) => void
  setDocumentsError: (error: string | null) => void
  
  // Chat sessions actions
  setSessions: (sessions: ChatSession[]) => void
  setCurrentSession: (sessionId: string | null) => void
  setMessages: (messages: ChatMessage[]) => void
  addMessage: (message: ChatMessage) => void
  setSessionsLoading: (loading: boolean) => void
  setSessionsError: (error: string | null) => void
  
  // Notes actions
  setNotes: (notes: Note[]) => void
  addNote: (note: Note) => void
  deleteNote: (noteId: string) => void
  updateNote: (noteId: string, updates: Partial<Note>) => void
  setNotesLoading: (loading: boolean) => void
  setNotesError: (error: string | null) => void
  
  // General actions
  setLoading: (loading: boolean) => void
  
  // Async actions
  fetchDocuments: (projectId: string) => Promise<void>
  addDocumentAsync: (doc: Omit<Document, "id" | "createdAt" | "selected">, userId: string, projectId: string) => Promise<void>
  removeDocumentAsync: (documentId: string) => Promise<void>
  
  fetchSessions: (projectId: string) => Promise<void>
  createSessionAsync: (title: string, projectId: string) => Promise<ChatSession>
  fetchMessages: (sessionId: string) => Promise<void>
  sendMessageAsync: (content: string, sourceIds: string[], sessionId: string, projectId: string) => Promise<void>
  
  fetchNotes: (projectId: string) => Promise<void>
  createNoteAsync: (note: Omit<Note, "id" | "createdAt">, projectId: string, selectedSourceIds?: string[]) => Promise<void>
  updateNoteAsync: (noteId: string, note: Omit<Note, "id" | "createdAt">) => Promise<void>
  removeNoteAsync: (noteId: string) => Promise<void>
  convertNoteToSource: (noteId: string, projectId: string) => Promise<void>
  uploadImage: (image: File, projectId: string) => Promise<string>
  
  // Initialize all data for a project
  initializeProject: (projectId: string, userId: string) => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  documents: [],
  documentsLoading: false,
  documentsError: null,
  
  sessions: [],
  currentSessionId: null,
  messages: [],
  sessionsLoading: false,
  sessionsError: null,
  
  notes: [],
  notesLoading: false,
  notesError: null,
  
  isLoading: false,

  // Sources actions
  setDocuments: (documents) => set({ documents }),
  
  addDocument: (document) => set((state) => ({ 
    documents: [document, ...state.documents] 
  })),
  
  removeDocument: (documentId) => set((state) => ({ 
    documents: state.documents.filter(doc => doc.id !== documentId) 
  })),
  
  updateDocument: (documentId, updates) => set((state) => ({
    documents: state.documents.map(doc => 
      doc.id === documentId ? { ...doc, ...updates } : doc
    )
  })),
  
  toggleDocumentSelection: (documentId) => set((state) => ({
    documents: state.documents.map(doc => 
      doc.id === documentId ? { ...doc, selected: !doc.selected } : doc
    )
  })),
  
  setDocumentsLoading: (loading) => set({ documentsLoading: loading }),
  setDocumentsError: (error) => set({ documentsError: error }),

  // Chat sessions actions
  setSessions: (sessions) => set({ sessions }),
  setCurrentSession: (sessionId) => set({ currentSessionId: sessionId }),
  setMessages: (messages) => set({ messages }),
  
  addMessage: (message) => set((state) => ({ 
    messages: [...state.messages, message] 
  })),
  
  setSessionsLoading: (loading) => set({ sessionsLoading: loading }),
  setSessionsError: (error) => set({ sessionsError: error }),

  // Notes actions
  setNotes: (notes) => set({ notes }),
  
  addNote: (note) => set((state) => ({ 
    notes: [note, ...state.notes] 
  })),
  
  deleteNote: (noteId) => set((state) => ({ 
    notes: state.notes.filter(note => note.id !== noteId) 
  })),
  
  updateNote: (noteId, updates) => set((state) => ({
    notes: state.notes.map(note => 
      note.id === noteId ? { ...note, ...updates } : note
    )
  })),
  
  setNotesLoading: (loading) => set({ notesLoading: loading }),
  setNotesError: (error) => set({ notesError: error }),

  // General actions
  setLoading: (loading) => set({ isLoading: loading }),

  // Async actions for documents
  fetchDocuments: async (projectId: string) => {
    try {
      set({ documentsLoading: true, documentsError: null })
      
      const response = await fetch(`/api/sources?projectId=${projectId}`)
      if (!response.ok) {
        throw new Error('Failed to fetch documents')
      }
      
      const documents = await response.json()
      set({ documents, documentsLoading: false })
    } catch (error) {
      console.error('Error fetching documents:', error)
      set({ 
        documentsError: error instanceof Error ? error.message : 'Failed to fetch documents',
        documentsLoading: false 
      })
    }
  },

  addDocumentAsync: async (doc: Omit<Document, "id" | "createdAt" | "selected">, userId: string, projectId: string) => {
    try {
      set({ documentsLoading: true, documentsError: null })
      
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

      // Refresh documents list
      await get().fetchDocuments(projectId)
    } catch (error) {
      console.error("Error adding document:", error)
      set({ 
        documentsError: error instanceof Error ? error.message : 'Failed to add document',
        documentsLoading: false 
      })
      throw error
    }
  },

  removeDocumentAsync: async (documentId: string) => {
    try {
      set({ documentsLoading: true, documentsError: null })
      
      const response = await fetch(`/api/documents/${documentId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to delete document")
      }

      get().removeDocument(documentId)
      set({ documentsLoading: false })
    } catch (error) {
      console.error("Error removing document:", error)
      set({ 
        documentsError: error instanceof Error ? error.message : 'Failed to remove document',
        documentsLoading: false 
      })
      throw error
    }
  },

  // Async actions for chat sessions
  fetchSessions: async (projectId: string) => {
    try {
      set({ sessionsLoading: true, sessionsError: null })
      
      const response = await fetch(`/api/chat/sessions/list?projectId=${projectId}`)
      if (!response.ok) {
        throw new Error('Failed to fetch chat sessions')
      }
      
      const sessions = await response.json()
      set({ sessions, sessionsLoading: false })
      
      // If no current session and sessions exist, set the first one as current
      const state = get()
      if (!state.currentSessionId && sessions.length > 0) {
        set({ currentSessionId: sessions[0].id })
        await get().fetchMessages(sessions[0].id)
      }
    } catch (error) {
      console.error('Error fetching sessions:', error)
      set({ 
        sessionsError: error instanceof Error ? error.message : 'Failed to fetch sessions',
        sessionsLoading: false 
      })
    }
  },

  createSessionAsync: async (title: string, projectId: string) => {
    try {
      set({ sessionsLoading: true, sessionsError: null })
      
      const response = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, projectId }),
      })
      
      if (!response.ok) {
        throw new Error("Failed to create chat session")
      }
      
      const newSession = await response.json()
      
      // Add to sessions list and set as current
      set((state) => ({
        sessions: [newSession, ...state.sessions],
        currentSessionId: newSession.id,
        messages: [],
        sessionsLoading: false
      }))
      
      return newSession
    } catch (error) {
      console.error("Error creating session:", error)
      set({ 
        sessionsError: error instanceof Error ? error.message : 'Failed to create session',
        sessionsLoading: false 
      })
      throw error
    }
  },

  fetchMessages: async (sessionId: string) => {
    try {
      set({ sessionsLoading: true, sessionsError: null })
      
      const response = await fetch(`/api/chat/sessions/${sessionId}/messages`)
      if (!response.ok) {
        throw new Error('Failed to fetch messages')
      }
      
      const messages = await response.json()
      set({ messages, sessionsLoading: false })
    } catch (error) {
      console.error('Error fetching messages:', error)
      set({ 
        sessionsError: error instanceof Error ? error.message : 'Failed to fetch messages',
        sessionsLoading: false 
      })
    }
  },

  sendMessageAsync: async (content: string, sourceIds: string[], sessionId: string, projectId: string) => {
    try {
      set({ sessionsLoading: true, sessionsError: null })

      // Add user message immediately for better UX
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        timestamp: new Date(),
      }
      get().addMessage(userMessage)

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          sourceIds,
          sessionId,
          projectId,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to get AI response")
      }

      const result = await response.json()

      // Add AI response
      const aiMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.response,
        timestamp: new Date(),
        sources: result.sources,
      }
      get().addMessage(aiMessage)

      // Refresh messages from server to ensure consistency
      await get().fetchMessages(sessionId)
      
      set({ sessionsLoading: false })
    } catch (error) {
      console.error("Error sending message:", error)
      
      // Add error message
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Sorry, I encountered an error while processing your request.",
        timestamp: new Date(),
      }
      get().addMessage(errorMessage)
      
      set({ 
        sessionsError: error instanceof Error ? error.message : 'Failed to send message',
        sessionsLoading: false 
      })
      throw error
    }
  },

  // Async actions for notes
  fetchNotes: async (projectId: string) => {
    try {
      set({ notesLoading: true, notesError: null })
      
      const response = await fetch(`/api/notes?projectId=${projectId}`)
      if (!response.ok) {
        throw new Error('Failed to fetch notes')
      }
      
      const notes = await response.json()
      set({ notes, notesLoading: false })
    } catch (error) {
      console.error('Error fetching notes:', error)
      set({ 
        notesError: error instanceof Error ? error.message : 'Failed to fetch notes',
        notesLoading: false 
      })
    }
  },

  createNoteAsync: async (note: Omit<Note, "id" | "createdAt">, projectId: string, selectedSourceIds: string[] = []) => {
    try {
      set({ notesLoading: true, notesError: null })
      
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          note,
          projectId,
          sourceIds: selectedSourceIds,
        }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to create note')
      }
      
      const newNote = await response.json()
      get().addNote({
        id: newNote.id,
        title: newNote.title,
        content: newNote.content,
        createdAt: new Date(newNote.created_at),
      })
      
      set({ notesLoading: false })
    } catch (error) {
      console.error('Error creating note:', error)
      set({ 
        notesError: error instanceof Error ? error.message : 'Failed to create note',
        notesLoading: false 
      })
      throw error
    }
  },

  updateNoteAsync: async (noteId: string, note: Omit<Note, "id" | "createdAt">) => {
    try {
      set({ notesLoading: true, notesError: null })
      
      const response = await fetch(`/api/notes/${noteId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: note.title,
          content: note.content,
        }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to update note')
      }
      
      const updatedNote = await response.json()
      get().updateNote(noteId, {
        title: updatedNote.title,
        content: updatedNote.content,
      })
      
      set({ notesLoading: false })
    } catch (error) {
      console.error('Error updating note:', error)
      set({ 
        notesError: error instanceof Error ? error.message : 'Failed to update note',
        notesLoading: false 
      })
      throw error
    }
  },

  removeNoteAsync: async (noteId: string) => {
    try {
      set({ notesLoading: true, notesError: null })
      
      const response = await fetch(`/api/notes/${noteId}`, {
        method: 'DELETE',
      })
      
      if (!response.ok) {
        throw new Error('Failed to delete note')
      }
      
      get().deleteNote(noteId)
      set({ notesLoading: false })
    } catch (error) {
      console.error('Error deleting note:', error)
      set({ 
        notesError: error instanceof Error ? error.message : 'Failed to delete note',
        notesLoading: false 
      })
      throw error
    }
  },

  convertNoteToSource: async (noteId: string, projectId: string) => {
    try {
      set({ notesLoading: true, notesError: null })
      
      const response = await fetch(`/api/notes/${noteId}/source`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projectId }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to convert note to source')
      }
      
      const result = await response.json()
      
      // Refresh documents to include the new source
      await get().fetchDocuments(projectId)
      
      set({ notesLoading: false })
      return result
    } catch (error) {
      console.error('Error converting note to source:', error)
      set({ 
        notesError: error instanceof Error ? error.message : 'Failed to convert note to source',
        notesLoading: false 
      })
      throw error
    }
  },

  uploadImage: async (image: File, projectId: string) => {
    try {
      const formData = new FormData()
      formData.append("image", image)

      const response = await fetch(`/api/projects/${projectId}/upload-image`, {
        method: "POST",
        body: formData,
      })
      
      if (!response.ok) {
        throw new Error("Image upload failed")
      }
      
      const data = await response.json()
      return data.imageUrl
    } catch (error) {
      console.error('Error uploading image:', error)
      throw new Error('Failed to upload image')
    }
  },

  // Initialize all data for a project
  initializeProject: async (projectId: string, userId: string) => {
    try {
      set({ isLoading: true })
      
      // Fetch all data in parallel
      await Promise.all([
        get().fetchDocuments(projectId),
        get().fetchSessions(projectId),
        get().fetchNotes(projectId),
      ])
      
      // If no sessions exist, create a new one
      const { sessions } = get()
      if (sessions.length === 0) {
        await get().createSessionAsync("New Chat", projectId)
      }
      
      set({ isLoading: false })
    } catch (error) {
      console.error('Error initializing project:', error)
      set({ isLoading: false })
      throw error
    }
  },
}))
