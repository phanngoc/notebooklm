"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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

interface StudioPanelProps {
  notes: Note[]
  onAddNote: (note: Omit<Note, "id" | "createdAt">) => void
  onDeleteNote: (noteId: string) => void
  onConvertToSource: (noteId: string) => void
  documents: Document[]
  isLoading: boolean
  projectId: string
}

export function StudioPanel({ notes, onAddNote, onDeleteNote, onConvertToSource, documents, isLoading, projectId }: StudioPanelProps) {
  const [isAddingNote, setIsAddingNote] = useState(false)
  const [noteTitle, setNoteTitle] = useState("")
  const [noteContent, setNoteContent] = useState("")
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null)

  const handleAddNote = () => {
    if (noteTitle.trim() && noteContent.trim()) {
      onAddNote({
        title: noteTitle,
        content: noteContent,
      })
      setNoteTitle("")
      setNoteContent("")
      setIsAddingNote(false)
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

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col">
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
              <Button size="sm" onClick={() => setIsAddingNote(!isAddingNote)} disabled={isLoading}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {isAddingNote && (
              <Card className="p-4">
                <div className="space-y-3">
                  <Input placeholder="Note title" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} />
                  <Textarea
                    placeholder="Write your note here..."
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    rows={4}
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleAddNote} size="sm" disabled={isLoading}>
                      Save
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setIsAddingNote(false)} disabled={isLoading}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            <div className="space-y-2">
              {notes.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No notes yet. Create your first note!</p>
              ) : (
                notes.map((note) => (
                  <Card key={note.id} className="p-3 hover:bg-gray-50">
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
                            onClick={() => onConvertToSource(note.id)}
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
                        onClick={() => confirmDeleteNote(note.id)}
                        className="text-red-500 hover:text-red-700 ml-2"
                        disabled={isLoading}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </Card>
                ))
              )}
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
