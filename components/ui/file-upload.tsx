"use client"

import React, { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/hooks/use-toast'
import { Upload, FileText, X, Check, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FileUploadProps {
  projectId: string
  userId: string
  onUploadComplete?: (result: any) => void
  onUploadError?: (error: string) => void
  className?: string
  maxFiles?: number
  disabled?: boolean
}

interface UploadingFile {
  file: File
  progress: number
  status: 'uploading' | 'completed' | 'error'
  result?: any
  error?: string
}

export function FileUpload({
  projectId,
  userId,
  onUploadComplete,
  onUploadError,
  className,
  maxFiles = 5,
  disabled = false
}: FileUploadProps) {
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const { toast } = useToast()

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (disabled || acceptedFiles.length === 0) return

    // Check file limit
    if (uploadingFiles.length + acceptedFiles.length > maxFiles) {
      toast({
        title: "Too many files",
        description: `You can only upload up to ${maxFiles} files at once.`,
        variant: "destructive"
      })
      return
    }

    setIsUploading(true)

    // Initialize uploading files
    const newUploadingFiles: UploadingFile[] = acceptedFiles.map(file => ({
      file,
      progress: 0,
      status: 'uploading'
    }))

    setUploadingFiles(prev => [...prev, ...newUploadingFiles])

    // Upload files one by one
    for (let i = 0; i < acceptedFiles.length; i++) {
      const file = acceptedFiles[i]
      const fileIndex = uploadingFiles.length + i

      try {
        // Create FormData for the API call
        const formData = new FormData()
        formData.append('file', file)
        formData.append('projectId', projectId)

        // Update progress to show upload starting
        setUploadingFiles(prev => {
          const updated = [...prev]
          if (updated[fileIndex]) {
            updated[fileIndex].progress = 20
          }
          return updated
        })

        // Make API call to upload endpoint
        const response = await fetch('/api/sources', {
          method: 'POST',
          body: formData,
        })

        // Update progress during processing
        setUploadingFiles(prev => {
          const updated = [...prev]
          if (updated[fileIndex]) {
            updated[fileIndex].progress = 60
          }
          return updated
        })

        const result = await response.json()

        // Update file status
        setUploadingFiles(prev => {
          const updated = [...prev]
          if (updated[fileIndex]) {
            updated[fileIndex].status = result.success ? 'completed' : 'error'
            updated[fileIndex].result = result
            updated[fileIndex].error = result.error
            updated[fileIndex].progress = 100
          }
          return updated
        })

        if (result.success) {
          toast({
            title: "Upload successful",
            description: `${file.name} has been uploaded and indexed successfully.`
          })
          onUploadComplete?.(result)
        } else {
          toast({
            title: "Upload failed",
            description: result.error || `Failed to upload ${file.name}`,
            variant: "destructive"
          })
          onUploadError?.(result.error || 'Unknown error')
        }
      } catch (error) {
        console.error('Upload error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Network error occurred'
        
        // Update file status with error
        setUploadingFiles(prev => {
          const updated = [...prev]
          if (updated[fileIndex]) {
            updated[fileIndex].status = 'error'
            updated[fileIndex].error = errorMessage
            updated[fileIndex].progress = 0
          }
          return updated
        })

        toast({
          title: "Upload failed",
          description: `Failed to upload ${file.name}: ${errorMessage}`,
          variant: "destructive"
        })
        onUploadError?.(errorMessage)
      }
    }

    setIsUploading(false)
  }, [projectId, userId, uploadingFiles.length, maxFiles, disabled, toast, onUploadComplete, onUploadError])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: disabled || isUploading,
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/csv': ['.csv'],
      'application/json': ['.json'],
      'text/html': ['.html'],
      'application/rtf': ['.rtf']
    },
    maxSize: 50 * 1024 * 1024, // 50MB
    multiple: true,
    maxFiles
  })

  const removeFile = (index: number) => {
    setUploadingFiles(prev => prev.filter((_, i) => i !== index))
  }

  const clearCompleted = () => {
    setUploadingFiles(prev => prev.filter(file => file.status === 'uploading'))
  }

  const hasCompletedFiles = uploadingFiles.some(file => file.status === 'completed')

  return (
    <div className={cn("space-y-4", className)}>
      {/* Dropzone */}
      <Card 
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed transition-colors cursor-pointer",
          isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <CardContent className="flex flex-col items-center justify-center p-6 text-center">
          <input {...getInputProps()} />
          <Upload className="h-10 w-10 text-muted-foreground mb-4" />
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {isDragActive ? "Drop files here" : "Drag & drop files here, or click to select"}
            </p>
            <p className="text-xs text-muted-foreground">
              Supports PDF, TXT, MD, DOC, DOCX, CSV, JSON, HTML, RTF (max 50MB each)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Upload Progress */}
      {uploadingFiles.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-medium">Uploading Files</h4>
              {hasCompletedFiles && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearCompleted}
                >
                  Clear Completed
                </Button>
              )}
            </div>
            
            <div className="space-y-3">
              {uploadingFiles.map((uploadingFile, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <FileText className="h-4 w-4" />
                      <span className="text-sm font-medium truncate">
                        {uploadingFile.file.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({Math.round(uploadingFile.file.size / 1024)} KB)
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {uploadingFile.status === 'completed' && (
                        <Check className="h-4 w-4 text-green-600" />
                      )}
                      {uploadingFile.status === 'error' && (
                        <AlertCircle className="h-4 w-4 text-red-600" />
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(index)}
                        disabled={uploadingFile.status === 'uploading'}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  
                  {uploadingFile.status === 'uploading' && (
                    <Progress value={uploadingFile.progress} className="h-1" />
                  )}
                  
                  {uploadingFile.status === 'error' && uploadingFile.error && (
                    <p className="text-xs text-red-600">{uploadingFile.error}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default FileUpload
