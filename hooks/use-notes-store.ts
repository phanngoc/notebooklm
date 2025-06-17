// Backward compatibility wrapper for useNotesStore
// This re-exports only the notes-related functionality from the unified store

import { useAppStore } from './use-app-store'

export const useNotesStore = () => {
  const store = useAppStore()
  
  return {
    // Notes state
    notes: store.notes,
    isLoading: store.notesLoading,
    error: store.notesError,
    
    // Notes actions - keeping original naming for compatibility
    setNotes: store.setNotes,
    addNote: store.addNote,
    deleteNote: store.deleteNote,
    updateNote: store.updateNote,
    setLoading: store.setNotesLoading,
    setError: store.setNotesError,
    
    // Async actions - keeping original naming
    fetchNotes: store.fetchNotes,
    createNote: store.createNoteAsync,
    updateNoteAsync: store.updateNoteAsync,
    removeNote: store.removeNoteAsync,
    convertNoteToSource: store.convertNoteToSource,
    uploadImage: store.uploadImage,
  }
}
