"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FileUpload } from "@/components/ui/file-upload"
import type { Document } from "@/types"
import { FileText, Globe, Type, Trash2, Plus, Presentation, Table } from "lucide-react"
import { useAppStore } from "@/hooks/use-app-store"
import { useAuth } from "@/hooks/use-auth"

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
  
  // Ref to store the polling interval and timeout so we can clear them
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const {
      addDocument,
    } = useAppStore()
  
  const { user } = useAuth()
  
  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current)
      }
    }
  }, [])
  

  const handleAddUrl = async () => {
    if (urlInput.trim()) {
      // Check if it's a Google Drive URL (file or folder), Google Docs, Google Slides, or Google Sheets
      if (urlInput.includes('drive.google.com/drive/folders/') || 
          urlInput.includes('drive.google.com/file/d/') ||
          urlInput.includes('drive.google.com/open?id=') ||
          urlInput.includes('docs.google.com/document') ||
          urlInput.includes('docs.google.com/presentation') ||
          urlInput.includes('docs.google.com/spreadsheets')) {
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
          projectId: projectId || null,
          fileTypes: []
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
            status: 'initializing',
            message: 'Initializing folder processing...',
            totalFiles: result.filesFound || 0,
            processedFiles: 0,
            failedFiles: 0
          })
          
          // Start polling for status after a small delay
          setTimeout(() => {
            setProcessingStatus({
              status: 'processing',
              message: result.message,
              totalFiles: result.filesFound || 0,
              processedFiles: 0,
              failedFiles: 0
            })
            pollProcessingStatus(result.taskId)
          }, 1000) // Wait 1 second before starting to poll
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

  const cancelProcessing = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }
    setProcessingTaskId(null)
    setProcessingStatus(null)
  }

  const pollProcessingStatus = async (taskId: string) => {
    console.log('Starting to poll status for task:', taskId)
    
    // Clear any existing polling interval and timeout
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
    }
    
    // Set a timeout to stop polling after 10 minutes
    pollTimeoutRef.current = setTimeout(() => {
      console.log('Polling timeout reached for task:', taskId)
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      setProcessingTaskId(null)
      setProcessingStatus({
        status: 'failed',
        message: 'Processing timeout - took longer than expected',
        totalFiles: 0,
        processedFiles: 0,
        failedFiles: 0
      })
    }, 10 * 60 * 1000) // 10 minutes
    
    pollIntervalRef.current = setInterval(async () => {
      try {
        console.log('Polling status for task:', taskId)
        const response = await fetch(`/api/google-drive/process?taskId=${taskId}`)
        const status = await response.json()

        console.log('Polling response:', status)

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
            console.log('Polling completed with status:', status.status)
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current)
              pollIntervalRef.current = null
            }
            if (pollTimeoutRef.current) {
              clearTimeout(pollTimeoutRef.current)
              pollTimeoutRef.current = null
            }
            setProcessingTaskId(null)
            
            if (status.status === 'completed') {
              // Refresh documents list
              console.log('Processing completed, refreshing page...')
              window.location.reload() // TODO: Better way to refresh
            }
          }
        } else {
          console.error('Polling failed:', status)
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
          if (pollTimeoutRef.current) {
            clearTimeout(pollTimeoutRef.current)
            pollTimeoutRef.current = null
          }
          setProcessingTaskId(null)
          setProcessingStatus({
            status: 'failed',
            message: status.error || 'Failed to get processing status',
            totalFiles: 0,
            processedFiles: 0,
            failedFiles: 0
          })
        }
      } catch (error) {
        console.error('Error polling status:', error)
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
        }
        if (pollTimeoutRef.current) {
          clearTimeout(pollTimeoutRef.current)
          pollTimeoutRef.current = null
        }
        setProcessingTaskId(null)
        setProcessingStatus({
          status: 'failed',
          message: 'Network error while checking status',
          totalFiles: 0,
          processedFiles: 0,
          failedFiles: 0
        })
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

  const handleFileUploadComplete = (result: any) => {
    if (result.success && result.source) {
      const document: Document = {
        id: result.source.id,
        title: result.source.title,
        type: result.source.type,
        content: result.source.content.substring(0, 200) || "",
        url: result.source.url,
        selected: false,
        createdAt: new Date(result.source.createdAt),
      }
      addDocument(document)
      
      // Close the add source panel after successful upload
      setIsAddingSource(false)
    }
  }

  const handleFileUploadError = (error: string) => {
    console.error('File upload error:', error)
  }

  const getIcon = (type: Document["type"]) => {
    switch (type) {
      case "google-doc":
        return <FileText className="w-4 h-4 text-blue-600" />
      case "google-slide":
        return <Presentation className="w-4 h-4 text-orange-600" />
      case "spreadsheet":
        return <Table className="w-4 h-4 text-green-600" />
      case "google-drive":
        return <FileText className="w-4 h-4 text-blue-500" />
      case "website":
        return <Globe className="w-4 h-4 text-green-600" />
      case "text":
        return <Type className="w-4 h-4 text-purple-600" />
      case "pdf":
        return <FileText className="w-4 h-4 text-red-600" />
      case "document":
        return <FileText className="w-4 h-4 text-blue-600" />
      case "markdown":
        return <FileText className="w-4 h-4 text-green-600" />
      case "data":
        return <FileText className="w-4 h-4 text-orange-600" />
      case "webpage":
        return <Globe className="w-4 h-4 text-blue-600" />
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
            <Tabs defaultValue="files" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="files">Files</TabsTrigger>
                <TabsTrigger value="url">URL / Drive</TabsTrigger>
                <TabsTrigger value="text">Text</TabsTrigger>
              </TabsList>

              <TabsContent value="files" className="space-y-3">
                {user && projectId && (
                  <FileUpload
                    projectId={projectId}
                    userId={user.id}
                    onUploadComplete={handleFileUploadComplete}
                    onUploadError={handleFileUploadError}
                    maxFiles={10}
                  />
                )}
                {!user && (
                  <div className="text-center py-4 text-gray-500">
                    Please log in to upload files
                  </div>
                )}
              </TabsContent>

              <TabsContent value="url" className="space-y-3">
                <Input
                  placeholder="Document title (optional)"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                />
                <Input
                  placeholder="Enter website URL, Google Drive file/folder, Google Docs, Google Slides, or Google Sheets link"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                />
                <Button onClick={handleAddUrl} className="w-full" disabled={isLoading}>
                  {isLoading ? "Processing..." : "Add URL"}
                </Button>
                <p className="text-xs text-gray-500">
                  Support: Website URLs, Google Drive folders (.docx, .xlsx files), Google Docs, Google Slides, Google Sheets
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
          <Card className={`p-4 mb-4 ${
            processingStatus.status === 'failed' 
              ? 'bg-red-50 border-red-200' 
              : processingStatus.status === 'completed'
              ? 'bg-green-50 border-green-200'
              : 'bg-blue-50 border-blue-200'
          }`}>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {processingStatus.status === 'failed' ? (
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  ) : processingStatus.status === 'completed' ? (
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  ) : (
                    <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                  )}
                  <span className={`text-sm font-medium ${
                    processingStatus.status === 'failed' 
                      ? 'text-red-800' 
                      : processingStatus.status === 'completed'
                      ? 'text-green-800'
                      : 'text-blue-800'
                  }`}>
                    {processingStatus.status === 'initializing' 
                      ? 'Initializing Google Drive Processing...'
                      : processingStatus.status === 'processing'
                      ? 'Processing Google Drive Folder...'
                      : processingStatus.status === 'completed'
                      ? 'Processing Completed!'
                      : processingStatus.status === 'failed'
                      ? 'Processing Failed'
                      : 'Processing Google Drive Folder'
                    }
                  </span>
                </div>
                {(processingStatus.status === 'processing' || processingStatus.status === 'initializing') && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={cancelProcessing}
                    className="text-gray-500 hover:text-red-600 p-1 h-auto"
                  >
                    Cancel
                  </Button>
                )}
              </div>
              <p className={`text-xs ${
                processingStatus.status === 'failed' 
                  ? 'text-red-600' 
                  : processingStatus.status === 'completed'
                  ? 'text-green-600'
                  : 'text-blue-600'
              }`}>
                {processingStatus.message}
              </p>
              {processingStatus.totalFiles > 0 && processingStatus.status !== 'initializing' && (
                <div className={`text-xs ${
                  processingStatus.status === 'failed' 
                    ? 'text-red-600' 
                    : processingStatus.status === 'completed'
                    ? 'text-green-600'
                    : 'text-blue-600'
                }`}>
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
