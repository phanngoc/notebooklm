import { NextRequest, NextResponse } from "next/server"
import { dbService } from "@/lib/database"
import { getSessionFromRequest } from "@/lib/session"
import { fileUploadService } from "@/lib/file-upload"
import { graphragClient } from "@/lib/grpc-client"

// Helper function to map MIME types to source types
function getSourceTypeFromMimeType(mimeType: string): "google-doc" | "google-slide" | "google-drive" | "website" | "text" | "pdf" | "document" | "markdown" | "spreadsheet" | "data" | "webpage" | "unknown" {
  const typeMapping: Record<string, "google-doc" | "google-slide" | "google-drive" | "website" | "text" | "pdf" | "document" | "markdown" | "spreadsheet" | "data" | "webpage" | "unknown"> = {
    'application/pdf': 'pdf',
    'text/plain': 'text',
    'text/markdown': 'markdown',
    'application/msword': 'document',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
    'text/csv': 'spreadsheet',
    'application/json': 'data',
    'text/html': 'webpage',
    'application/rtf': 'document'
  }
  
  return typeMapping[mimeType] || 'unknown'
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get("projectId")
    
    if (!projectId) {
      return NextResponse.json({ error: "Project ID is required" }, { status: 400 })
    }

    const sources = await dbService.getSources(user.id, projectId)
    return NextResponse.json(sources)
  } catch (error) {
    console.error("Error fetching sources:", error)
    return NextResponse.json({ error: "Failed to fetch sources" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const projectId = formData.get('projectId') as string

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (!projectId) {
      return NextResponse.json({ error: "Project ID is required" }, { status: 400 })
    }

    // Validate file size (50MB limit)
    const maxSize = 50 * 1024 * 1024 // 50MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: "File too large. Maximum size is 50MB." }, { status: 400 })
    }

    // Validate file type
    const allowedMimeTypes = [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/csv',
      'application/json',
      'text/html',
      'application/rtf'
    ]

    if (!allowedMimeTypes.includes(file.type)) {
      return NextResponse.json({ 
        error: "Unsupported file type. Please upload PDF, TXT, MD, DOC, DOCX, CSV, JSON, HTML, or RTF files." 
      }, { status: 400 })
    }

    // Upload file using file upload service
    const uploadResult = await fileUploadService.uploadFile(
      file,
      projectId,
      user.id
    )

    if (!uploadResult.success || !uploadResult.fileUrl) {
      return NextResponse.json({ error: uploadResult.error || "Upload failed" }, { status: 500 })
    }

    // Create source record in database first (with placeholder content)
    const source = await dbService.addSource(
      user.id,
      {
        title: file.name,
        type: getSourceTypeFromMimeType(file.type),
        content: `Processing file: ${file.name}...`,
        url: uploadResult.fileUrl
      },
      projectId
    )

    // Send file URL to GraphRAG service for processing and indexing via gRPC
    try {
      // Add timeout for file processing (5 minutes for large files)
      const PROCESSING_TIMEOUT = 5 * 60 * 1000 // 5 minutes
      
      const graphragResult = await Promise.race([
        graphragClient.processFile({
          file_url: uploadResult.fileUrl,
          user_id: user.id,
          project_id: projectId,
          file_name: file.name,
          mime_type: file.type,
          source_id: source.id
        }),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('File processing timeout')), PROCESSING_TIMEOUT)
        )
      ])

      // Validate response structure
      if (!graphragResult || typeof graphragResult.success !== 'boolean') {
        throw new Error('Invalid response from processing service')
      }

      if (!graphragResult.success) {
        console.error("File processing failed:", graphragResult.error)
        
        // Update source with processing error
        await dbService.updateSource(source.id, { 
          content: `Error processing file: ${graphragResult.error || 'Unknown processing error'}`,
          metadata: { 
            processing_status: 'failed',
            processing_error: graphragResult.error || 'Unknown processing error',
            upload_status: 'completed',
            content_length: 0
          } 
        })
        
        return NextResponse.json({
          success: false,
          error: `File uploaded but processing failed: ${graphragResult.error || 'Unknown processing error'}`,
          source: {
            id: source.id,
            title: source.title,
            type: source.type,
            content: `Error processing file: ${graphragResult.error || 'Unknown processing error'}`,
            url: source.url,
            createdAt: source.created_at
          }
        }, { status: 500 })
      }

      // Validate and sanitize markdown content
      const markdownContent = graphragResult.markdown_content || ''
      const contentLength = graphragResult.content_length || markdownContent.length
      
      // Create content preview (first 500 chars)
      const contentPreview = markdownContent.length > 500 
        ? markdownContent.substring(0, 500) + '...' 
        : markdownContent

      // Update source with successful processing metadata
      await dbService.updateSource(source.id, {
        metadata: {
          processing_status: 'completed',
          upload_status: 'completed',
          content_length: contentLength,
          processed_at: new Date().toISOString()
        }
      })

      // File processing was successful
      return NextResponse.json({
        success: true,
        source: {
          id: source.id,
          title: source.title,
          type: source.type,
          content: contentPreview,
          url: source.url,
          createdAt: source.created_at,
          metadata: {
            content_length: contentLength,
            processing_status: 'completed'
          }
        },
        message: `File uploaded, processed, and indexed successfully (${contentLength} characters processed)`,
        processing_info: {
          content_length: contentLength,
          processing_time: Date.now() // Could be calculated properly with start time
        }
      })

    } catch (graphragError) {
      console.error("Error communicating with file processing service:", graphragError)
      
      // Determine error type for better error handling
      let errorMessage = 'Unknown error occurred'
      let errorType = 'unknown'
      
      if (graphragError instanceof Error) {
        errorMessage = graphragError.message
        if (graphragError.message.includes('timeout')) {
          errorType = 'timeout'
          errorMessage = 'File processing timeout - file may be too large or service is busy'
        } else if (graphragError.message.includes('UNAVAILABLE') || graphragError.message.includes('connect ECONNREFUSED')) {
          errorType = 'service_unavailable'
          errorMessage = 'Processing service is currently unavailable'
        } else if (graphragError.message.includes('INVALID_ARGUMENT')) {
          errorType = 'invalid_request'
          errorMessage = 'Invalid file format or request parameters'
        }
      }

      // Update source with connection error
      await dbService.updateSource(source.id, { 
        content: `Error communicating with processing service: ${errorMessage}`,
        metadata: { 
          processing_status: 'failed',
          processing_error: errorMessage,
          error_type: errorType,
          upload_status: 'completed'
        } 
      })
      
      return NextResponse.json({
        success: false,
        error: `File uploaded but processing service error: ${errorMessage}`,
        error_type: errorType,
        source: {
          id: source.id,
          title: source.title,
          type: source.type,
          content: `Error communicating with processing service: ${errorMessage}`,
          url: source.url,
          createdAt: source.created_at
        }
      }, { status: 500 })
    }

  } catch (error) {
    console.error("Error uploading file:", error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Failed to upload file" 
    }, { status: 500 })
  }
}
