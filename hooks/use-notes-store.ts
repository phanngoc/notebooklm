import { create } from 'zustand'
import type { Note } from '@/types'

interface NotesState {
  notes: Note[]
  isLoading: boolean
  error: string | null
  
  // Actions
  setNotes: (notes: Note[]) => void
  addNote: (note: Note) => void
  deleteNote: (noteId: string) => void
  updateNote: (noteId: string, updates: Partial<Note>) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  
  // Async actions
  fetchNotes: (projectId: string) => Promise<void>
  createNote: (note: Omit<Note, "id" | "createdAt">, projectId: string, selectedSourceIds?: string[]) => Promise<void>
  removeNote: (noteId: string) => Promise<void>
  convertNoteToSource: (noteId: string, projectId: string) => Promise<void>
  uploadImage: (image: File, projectId: string) => Promise<string>
}

export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],
  isLoading: false,
  error: null,

  // Synchronous actions
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
  
  setLoading: (loading) => set({ isLoading: loading }),
  
  setError: (error) => set({ error }),

  // Async actions
  fetchNotes: async (projectId: string) => {
    try {
      set({ isLoading: true, error: null })
      
      const response = await fetch(`/api/notes?projectId=${projectId}`)
      if (!response.ok) {
        throw new Error('Failed to fetch notes')
      }
      
      const notes = await response.json()
      set({ notes, isLoading: false })
    } catch (error) {
      console.error('Error fetching notes:', error)
      set({ 
        error: error instanceof Error ? error.message : 'Failed to fetch notes',
        isLoading: false 
      })
    }
  },

  createNote: async (note: Omit<Note, "id" | "createdAt">, projectId: string, selectedSourceIds: string[] = []) => {
    try {
      set({ isLoading: true, error: null })
      console.log("createNote:", note, projectId, selectedSourceIds)
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
      
      set({ isLoading: false })
    } catch (error) {
      console.error('Error creating note:', error)
      set({ 
        error: error instanceof Error ? error.message : 'Failed to create note',
        isLoading: false 
      })
    }
  },

  removeNote: async (noteId: string) => {
    try {
      set({ isLoading: true, error: null })
      
      const response = await fetch(`/api/notes/${noteId}`, {
        method: 'DELETE',
      })
      
      if (!response.ok) {
        throw new Error('Failed to delete note')
      }
      
      get().deleteNote(noteId)
      set({ isLoading: false })
    } catch (error) {
      console.error('Error deleting note:', error)
      set({ 
        error: error instanceof Error ? error.message : 'Failed to delete note',
        isLoading: false 
      })
    }
  },

  convertNoteToSource: async (noteId: string, projectId: string) => {
    try {
      set({ isLoading: true, error: null })
      
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
      
      // Optionally remove the note after successful conversion
      // get().deleteNote(noteId)
      
      set({ isLoading: false })
      return result
    } catch (error) {
      console.error('Error converting note to source:', error)
      set({ 
        error: error instanceof Error ? error.message : 'Failed to convert note to source',
        isLoading: false 
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
}))
