import { NextRequest, NextResponse } from "next/server"
import { dbService } from "@/lib/database"
import { getSessionFromRequest } from "@/lib/session"
import { graphragClient } from "@/lib/grpc-client"

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { url, title, projectId } = await request.json()

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 })
    }

    if (!projectId) {
      return NextResponse.json({ error: "Project ID is required" }, { status: 400 })
    }

    // Validate URL format
    try {
      new URL(url)
    } catch (error) {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 })
    }

    // Create source record in database first (with placeholder content)
    const source = await dbService.addSource(
      user.id,
      {
        title: title || `Website: ${url}`,
        type: "website",
        content: `Processing website: ${url}...`,
        url: url
      },
      projectId
    )

    // Send URL to GraphRAG service for processing via gRPC
    try {
      // Add timeout for website processing (3 minutes)
      const PROCESSING_TIMEOUT = 3 * 60 * 1000 // 3 minutes
      
      const graphragResult = await Promise.race([
        graphragClient.processFile({
          file_url: url, // Use URL as file_url for website processing
          user_id: user.id,
          project_id: projectId,
          file_name: title || `Website: ${url}`,
          mime_type: 'text/html', // Set mime type for website
          source_id: source.id
        }),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Website processing timeout')), PROCESSING_TIMEOUT)
        )
      ])

      // Validate response structure
      if (!graphragResult || typeof graphragResult.success !== 'boolean') {
        throw new Error('Invalid response from processing service')
      }

      if (!graphragResult.success) {
        console.error("Website processing failed:", graphragResult.error)
        
        // Update source with processing error
        await dbService.updateSource(source.id, { 
          content: `Error processing website: ${graphragResult.error || 'Unknown processing error'}`,
          metadata: { 
            processing_status: 'failed',
            processing_error: graphragResult.error || 'Unknown processing error',
            content_length: 0
          } 
        })
        
        return NextResponse.json({
          success: false,
          error: `Website processing failed: ${graphragResult.error || 'Unknown processing error'}`,
          source: {
            id: source.id,
            title: source.title,
            type: source.type,
            content: `Error processing website: ${graphragResult.error || 'Unknown processing error'}`,
            url: source.url,
            createdAt: source.created_at
          }
        }, { status: 500 })
      }

      // Validate and sanitize markdown content
      const markdownContent = graphragResult.markdown_content || ''
      const contentLength = graphragResult.content_length || markdownContent.length

      // Update source with successful processing
      await dbService.updateSource(source.id, {
        content: markdownContent,
        metadata: {
          processing_status: 'completed',
          content_length: contentLength,
          processed_at: new Date().toISOString()
        }
      })

      // Website processing was successful
      return NextResponse.json({
        success: true,
        source: {
          id: source.id,
          title: source.title,
          type: source.type,
          content: markdownContent,
          url: source.url,
          createdAt: source.created_at,
          metadata: {
            content_length: contentLength,
            processing_status: 'completed'
          }
        },
        message: `Website processed and indexed successfully (${contentLength} characters processed)`,
        processing_info: {
          content_length: contentLength,
          processing_time: Date.now()
        }
      })

    } catch (graphragError) {
      console.error("Error communicating with website processing service:", graphragError)
      
      // Determine error type for better error handling
      let errorMessage = 'Unknown error occurred'
      let errorType = 'unknown'
      
      if (graphragError instanceof Error) {
        errorMessage = graphragError.message
        if (graphragError.message.includes('timeout')) {
          errorType = 'timeout'
          errorMessage = 'Website processing timeout - website may be too large or service is busy'
        } else if (graphragError.message.includes('UNAVAILABLE') || graphragError.message.includes('connect ECONNREFUSED')) {
          errorType = 'service_unavailable'
          errorMessage = 'Processing service is currently unavailable'
        } else if (graphragError.message.includes('INVALID_ARGUMENT')) {
          errorType = 'invalid_request'
          errorMessage = 'Invalid URL or request parameters'
        }
      }

      // Update source with connection error
      await dbService.updateSource(source.id, { 
        content: `Error communicating with processing service: ${errorMessage}`,
        metadata: { 
          processing_status: 'failed',
          processing_error: errorMessage,
          error_type: errorType
        } 
      })
      
      return NextResponse.json({
        success: false,
        error: `Website processing service error: ${errorMessage}`,
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
    console.error("Error processing website:", error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Failed to process website" 
    }, { status: 500 })
  }
}
