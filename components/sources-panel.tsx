"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Document } from "@/types"
import { FileText, Globe, Type, Trash2, Plus, Presentation } from "lucide-react"
import { useAppStore } from "@/hooks/use-app-store"

interface SourcesPanelProps {
  documents: Document[]
  onAddDocument: (doc: Omit<Document, "id" | "createdAt" | "selected">) => void
  onToggleSelection?: (id: string) => void
  onRemoveDocument: (id: string) => void
  isLoading?: boolean
  projectId?: string // Add projectId prop
}

export function SourcesPanel({
  documents,
  onAddDocument,
  onToggleSelection,
  onRemoveDocument,
  isLoading = false,
  projectId,
}: SourcesPanelProps) {
  const [isAddingSource, setIsAddingSource] = useState(false)
  const [urlInput, setUrlInput] = useState("")
  const [textInput, setTextInput] = useState("")
  const [titleInput, setTitleInput] = useState("")
  const [processingTaskId, setProcessingTaskId] = useState<string | null>(null)
  const [processingStatus, setProcessingStatus] = useState<{
    status: string
    message: string
    totalFiles: number
    processedFiles: number
    failedFiles: number
  } | null>(null)

  const {
      addDocument,
    } = useAppStore()
  

  const handleAddUrl = async () => {
    if (urlInput.trim()) {
      // Check if it's a Google Drive URL (file or folder), Google Docs, or Google Slides
      if (urlInput.includes('drive.google.com/drive/folders/') || 
          urlInput.includes('drive.google.com/file/d/') ||
          urlInput.includes('drive.google.com/open?id=') ||
          urlInput.includes('docs.google.com/document') ||
          urlInput.includes('docs.google.com/presentation')) {
        await handleGoogleDrive()
      } else {
        onAddDocument({
          title: titleInput || `Website: ${urlInput}`,
          type: "website",
          content: `Content from: ${urlInput}`,
          url: urlInput,
        })
        setUrlInput("")
        setTitleInput("")
        setIsAddingSource(false)
      }
    }
  }

  const handleGoogleDrive = async () => {
    try {
      const response = await fetch('/api/google-drive/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: urlInput,
          projectId: projectId || 'current-project-id', // Use provided projectId
          fileTypes: ['docx']
        }),
      })

      const result = await response.json()
      console.log('Google Drive processing result:', result)
      if (result.success) {
        if (result.type === 'file') {
          // Handle single file processing (immediate response)
          setProcessingStatus({
            status: 'completed',
            message: result.message,
            totalFiles: 1,
            processedFiles: 1,
            failedFiles: 0
          })

          const document: Document = {
            id: result.source.id,
            title: result.source.title || "Google Drive Document",
            type: "google-drive",
            content: result.source.content.substring(0, 200) || "",
            url: result.source.url,
            selected: false,
            createdAt: new Date(),
          }
          addDocument(document)

          // Clear the processing status after a short delay
          setTimeout(() => {
            setProcessingStatus(null)
            setProcessingTaskId(null)
          }, 3000)
          
        } else {
          // Handle folder processing (async with task ID)
          setProcessingTaskId(result.taskId)
          setProcessingStatus({
            status: 'processing',
            message: result.message,
            totalFiles: result.filesFound || 0,
            processedFiles: 0,
            failedFiles: 0
          })
          
          // Start polling for status
          pollProcessingStatus(result.taskId)
        }
        
        setUrlInput("")
        setTitleInput("")
        setIsAddingSource(false)
      } else {
        alert(`Error: ${result.error}`)
      }
    } catch (error) {
      console.error('Error processing Google Drive content:', error)
      alert('Failed to process Google Drive content')
    }
  }

  const pollProcessingStatus = async (taskId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/google-drive/process?taskId=${taskId}`)
        const status = await response.json()

        if (status.success) {
          setProcessingStatus({
            status: status.status,
            message: status.message,
            totalFiles: status.totalFiles,
            processedFiles: status.processedFiles,
            failedFiles: status.failedFiles
          })

          // Stop polling if completed or failed
          if (status.status === 'completed' || status.status === 'failed') {
            clearInterval(pollInterval)
            setProcessingTaskId(null)
            
            if (status.status === 'completed') {
              // Refresh documents list
              window.location.reload() // TODO: Better way to refresh
            }
          }
        }
      } catch (error) {
        console.error('Error polling status:', error)
        clearInterval(pollInterval)
        setProcessingTaskId(null)
      }
    }, 2000) // Poll every 2 seconds
  }

  const handleAddText = () => {
    if (textInput.trim()) {
      onAddDocument({
        title: titleInput || "Pasted Text",
        type: "text",
        content: textInput,
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
      case "google-slide":
        return <Presentation className="w-4 h-4 text-orange-600" />
      case "google-drive":
        return <FileText className="w-4 h-4 text-blue-500" />
      case "website":
        return <Globe className="w-4 h-4 text-green-600" />
      case "text":
        return <Type className="w-4 h-4 text-purple-600" />
      default:
        return <FileText className="w-4 h-4 text-gray-600" />
    }
  }

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col lg:w-[320px] md:w-[280px]">
      <div className="p-4 border-b border-gray-200 lg:w-[320px] md:w-[280px]">
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
                <TabsTrigger value="url">URL / Google Drive</TabsTrigger>
                <TabsTrigger value="text">Text</TabsTrigger>
              </TabsList>

              <TabsContent value="url" className="space-y-3">
                <Input
                  placeholder="Document title (optional)"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                />
                <Input
                  placeholder="Enter website URL, Google Drive file/folder, Google Docs, or Google Slides link"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                />
                <Button onClick={handleAddUrl} className="w-full" disabled={isLoading}>
                  {isLoading ? "Processing..." : "Add URL"}
                </Button>
                <p className="text-xs text-gray-500">
                  Support: Website URLs, Google Drive folders (.docx files), Google Docs, Google Slides
                </p>
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

        {/* Processing Status Display */}
        {processingTaskId && processingStatus && (
          <Card className="p-4 mb-4 bg-blue-50 border-blue-200">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-blue-800">Processing Google Drive Folder</span>
              </div>
              <p className="text-xs text-blue-600">{processingStatus.message}</p>
              {processingStatus.totalFiles > 0 && (
                <div className="text-xs text-blue-600">
                  Progress: {processingStatus.processedFiles + processingStatus.failedFiles} / {processingStatus.totalFiles} files
                  {processingStatus.failedFiles > 0 && (
                    <span className="text-red-600 ml-2">({processingStatus.failedFiles} failed)</span>
                  )}
                </div>
              )}
            </div>
          </Card>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-2">
          {documents.map((doc) => (
            <Card key={doc.id} className="p-3 hover:bg-gray-50">
              <div className="flex items-start gap-3">
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
