"use client"

import { useNotesStore } from '@/hooks/use-notes-store'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileText, Clock } from 'lucide-react'

interface NotesSummaryProps {
  projectId: string
}

export function NotesSummary({ projectId }: NotesSummaryProps) {
  const { notes, isLoading, fetchNotes } = useNotesStore()

  // This component can access the same notes state as the dashboard
  // without prop drilling or complex state management
  
  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Clock className="w-4 h-4 animate-spin" />
          Loading notes...
        </div>
      </Card>
    )
  }

  if (notes.length === 0) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <FileText className="w-4 h-4" />
          No notes available
        </div>
      </Card>
    )
  }

  const recentNotes = notes.slice(0, 3)
  const totalWords = notes.reduce((total, note) => 
    total + note.content.split(' ').length, 0
  )

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Notes Summary
        </h3>
        <Badge variant="secondary">{notes.length} notes</Badge>
      </div>
      
      <div className="space-y-2 mb-3">
        {recentNotes.map((note) => (
          <div key={note.id} className="text-sm">
            <div className="font-medium truncate">{note.title}</div>
            <div className="text-gray-500 text-xs truncate">
              {note.content.slice(0, 60)}...
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-500 border-t pt-2">
        <span>Total: {notes.length} notes</span>
        <span>~{totalWords} words</span>
      </div>
    </Card>
  )
}
