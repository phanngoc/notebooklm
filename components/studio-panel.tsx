"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
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
import type { Document, Note } from "@/types"
import { Plus, FileText, Headphones, BookOpen, Clock, Trash2, FileUp } from "lucide-react"
import dynamic from 'next/dynamic'
import { useNotesStore } from "@/hooks/use-notes-store"

const EditorComp = dynamic(() => import('./ui/editor'), { ssr: false })

interface StudioPanelProps {
  notes: Note[]
  onAddNote: (note: Omit<Note, "id" | "createdAt">) => void
  onUpdateNote: (noteId: string, note: Omit<Note, "id" | "createdAt">) => void
  onDeleteNote: (noteId: string) => void
  onConvertToSource: (noteId: string) => void
  documents: Document[]
  isLoading: boolean
  projectId: string
  isExpanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
}

export function StudioPanel({ notes, onAddNote, onUpdateNote, onDeleteNote, onConvertToSource, documents, isLoading, projectId, isExpanded = false, onExpandedChange }: StudioPanelProps) {
  const [isAddingNote, setIsAddingNote] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteTitle, setNoteTitle] = useState("")
  const [noteContent, setNoteContent] = useState("")
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null)
  
  const { uploadImage } = useNotesStore()
  const { toast } = useToast()

  const handleSaveNote = () => {
    console.log("Saving note:", noteTitle, noteContent, editingNoteId)
    // if noteTitle.trim() empty will cut 20 words from content to assign noteTitle
    let noteTitleSaved = noteTitle
    if (!noteTitle.trim()) {
      const words = noteContent.split(" ").slice(0, 20).join(" ")
      setNoteTitle(words)
      noteTitleSaved = words
    }

    if (noteContent.trim()) {
      if (editingNoteId) {
        // Update existing note
        onUpdateNote(editingNoteId, {
          title: noteTitleSaved,
          content: noteContent,
        })
      } else {
        // Create new note
        onAddNote({
          title: noteTitleSaved,
          content: noteContent,
        })
      }
      
      // Reset form
      setNoteTitle("")
      setNoteContent("")
      setIsAddingNote(false)
      setEditingNoteId(null)
      
      // Exit expanded mode after saving note
      if (onExpandedChange) {
        onExpandedChange(false)
      }
    }
  }

  const handleToggleAddNote = () => {
    const newIsAddingNote = !isAddingNote
    setIsAddingNote(newIsAddingNote)
    
    // Reset editing state when adding new note
    if (newIsAddingNote) {
      setEditingNoteId(null)
      setNoteTitle("")
      setNoteContent("")
    }
    
    // Toggle expanded mode when showing/hiding the add note form
    if (onExpandedChange) {
      onExpandedChange(newIsAddingNote)
    }
  }

  const handleEditNote = (note: Note) => {
    setEditingNoteId(note.id)
    setNoteTitle(note.title)
    setNoteContent(note.content)
    setIsAddingNote(true) // Show the editor form
    
    // Expand the panel when editing
    if (onExpandedChange) {
      onExpandedChange(true)
    }
  }

  const handleCancelEdit = () => {
    setIsAddingNote(false)
    setEditingNoteId(null)
    setNoteTitle("")
    setNoteContent("")
    
    // Exit expanded mode when canceling
    if (onExpandedChange) {
      onExpandedChange(false)
    }
  }

  const confirmDeleteNote = (noteId: string) => {
    setNoteToDelete(noteId)
  }

  const handleDeleteNote = () => {
    if (noteToDelete) {
      onDeleteNote(noteToDelete)
      setNoteToDelete(null)
    }
  }

  const imageUploadHandler = async (image: File): Promise<string> => {
    try {
      // Validate file size (10MB limit)
      const maxSize = 10 * 1024 * 1024 // 10MB
      if (image.size > maxSize) {
        throw new Error('File too large. Maximum size is 10MB.')
      }

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
      if (!allowedTypes.includes(image.type)) {
        throw new Error('Invalid file type. Only images are allowed.')
      }

      // Show loading toast
      toast({
        title: "Uploading image...",
        description: "Please wait while your image is being uploaded.",
      })

      const imageUrl = await uploadImage(image, projectId)
      
      // Show success toast
      toast({
        title: "Image uploaded successfully!",
        description: "Your image has been uploaded and is ready to use.",
      })

      return imageUrl
    } catch (error) {
      console.error('Image upload failed:', error)
      
      // Show error toast
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : 'Failed to upload image',
        variant: "destructive",
      })
      
      throw new Error(error instanceof Error ? error.message : 'Failed to upload image')
    }
  }

  return (
    <div className={`bg-white border-l border-gray-200 flex flex-col transition-all duration-300 ${isExpanded ? 'w-496' : 'w-80'}`}>
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold mb-4">Studio</h2>

        <Tabs defaultValue="notes" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <Headphones className="w-5 h-5 text-blue-600" />
                <h3 className="font-medium">Audio Overview</h3>
              </div>
              <p className="text-sm text-gray-600 mb-3">Generate an audio summary of your selected documents</p>
              <Button className="w-full" disabled={documents.length === 0 || isLoading}>
                Generate Audio Overview
              </Button>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <BookOpen className="w-5 h-5 text-green-600" />
                <h3 className="font-medium">Study Guide</h3>
              </div>
              <p className="text-sm text-gray-600 mb-3">Create a comprehensive study guide from your documents</p>
              <Button variant="outline" className="w-full" disabled={documents.length === 0 || isLoading}>
                Generate Study Guide
              </Button>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <FileText className="w-5 h-5 text-purple-600" />
                <h3 className="font-medium">Summary</h3>
              </div>
              <p className="text-sm text-gray-600 mb-3">Get a concise summary of all selected documents</p>
              <Button variant="outline" className="w-full" disabled={documents.length === 0 || isLoading}>
                Generate Summary
              </Button>
            </Card>
          </TabsContent>

          <TabsContent value="notes" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Your Notes</h3>
              <Button size="sm" onClick={handleToggleAddNote} disabled={isLoading}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {isAddingNote && (
              <Card className="p-4">
                <div className="space-y-3">
                  <Input placeholder="Note title" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} />
                  <EditorComp markdown={noteContent} onChange={setNoteContent} imageUploadHandler={imageUploadHandler}  />
                  <div className="flex gap-2">
                    <Button onClick={handleSaveNote} size="sm" disabled={isLoading}>
                      {editingNoteId ? "Update" : "Save"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleCancelEdit} disabled={isLoading}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            <div className="space-y-2">
              {!isAddingNote && notes.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No notes yet. Create your first note!</p>
              ) : !isAddingNote ? (
                notes.map((note) => (
                  <Card 
                    key={note.id} 
                    className="p-3 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => handleEditNote(note)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm mb-1">{note.title}</h4>
                        <p className="text-xs text-gray-600 line-clamp-3 mb-2">{note.content}</p>
                        <div className="flex items-center gap-1 text-xs text-gray-400">
                          <Clock className="w-3 h-3" />
                            {new Date(note.createdAt).toLocaleString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            })}
                        </div>
                        <div className="flex gap-1 mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation() // Prevent card click
                              onConvertToSource(note.id)
                            }}
                            className="text-blue-600 hover:text-blue-700 border-blue-200 hover:border-blue-300"
                            disabled={isLoading}
                          >
                            <FileUp className="w-3 h-3 mr-1" />
                            Convert to Source
                          </Button>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation() // Prevent card click
                          confirmDeleteNote(note.id)
                        }}
                        className="text-red-500 hover:text-red-700 ml-2"
                        disabled={isLoading}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </Card>
                ))
              ) : null}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={!!noteToDelete} onOpenChange={(open) => !open && setNoteToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your note.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteNote}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
