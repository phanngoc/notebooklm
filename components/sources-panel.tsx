"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import type { Document } from "@/types"
import { FileText, Globe, Type, Trash2, Plus } from "lucide-react"

interface SourcesPanelProps {
  documents: Document[]
  onAddDocument: (doc: Omit<Document, "id" | "createdAt" | "selected">) => void
  onToggleSelection: (id: string) => void
  onRemoveDocument: (id: string) => void
  isLoading?: boolean
}

export function SourcesPanel({
  documents,
  onAddDocument,
  onToggleSelection,
  onRemoveDocument,
  isLoading = false,
}: SourcesPanelProps) {
  const [isAddingSource, setIsAddingSource] = useState(false)
  const [urlInput, setUrlInput] = useState("")
  const [textInput, setTextInput] = useState("")
  const [titleInput, setTitleInput] = useState("")

  const handleAddUrl = () => {
    if (urlInput.trim()) {
      onAddDocument({
        title: titleInput || `Website: ${urlInput}`,
        type: "website",
        content: `Content from: ${urlInput}`,
        url: urlInput,
        selected: true,
      })
      setUrlInput("")
      setTitleInput("")
      setIsAddingSource(false)
    }
  }

  const handleAddText = () => {
    if (textInput.trim()) {
      onAddDocument({
        title: titleInput || "Pasted Text",
        type: "text",
        content: textInput,
        selected: true,
      })
      setTextInput("")
      setTitleInput("")
      setIsAddingSource(false)
    }
  }

  const getIcon = (type: Document["type"]) => {
    switch (type) {
      case "google-doc":
        return <FileText className="w-4 h-4 text-blue-600" />
      case "website":
        return <Globe className="w-4 h-4 text-green-600" />
      case "text":
        return <Type className="w-4 h-4 text-purple-600" />
      default:
        return <FileText className="w-4 h-4 text-gray-600" />
    }
  }

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Sources</h2>
          <Button size="sm" onClick={() => setIsAddingSource(!isAddingSource)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add
          </Button>
        </div>

        {isAddingSource && (
          <Card className="p-4 mb-4">
            <Tabs defaultValue="url" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="url">URL</TabsTrigger>
                <TabsTrigger value="text">Text</TabsTrigger>
              </TabsList>

              <TabsContent value="url" className="space-y-3">
                <Input
                  placeholder="Document title (optional)"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                />
                <Input
                  placeholder="Enter website URL or Google Doc link"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                />
                <Button onClick={handleAddUrl} className="w-full" disabled={isLoading}>
                  {isLoading ? "Processing..." : "Add URL"}
                </Button>
              </TabsContent>

              <TabsContent value="text" className="space-y-3">
                <Input
                  placeholder="Document title (optional)"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                />
                <Textarea
                  placeholder="Paste your text here..."
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  rows={4}
                />
                <Button onClick={handleAddText} className="w-full" disabled={isLoading}>
                  {isLoading ? "Processing..." : "Add Text"}
                </Button>
              </TabsContent>
            </Tabs>
          </Card>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-2">
          {documents.map((doc) => (
            <Card key={doc.id} className="p-3 hover:bg-gray-50">
              <div className="flex items-start gap-3">
                <Checkbox checked={doc.selected} onCheckedChange={() => onToggleSelection(doc.id)} className="mt-1" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {getIcon(doc.type)}
                    <span className="text-sm font-medium truncate">{doc.title}</span>
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-2">{doc.content.substring(0, 100)}...</p>
                  {doc.url && <p className="text-xs text-blue-600 truncate mt-1">{doc.url}</p>}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onRemoveDocument(doc.id)}
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
