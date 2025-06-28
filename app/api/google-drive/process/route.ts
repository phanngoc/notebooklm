import { NextRequest, NextResponse } from "next/server"
import { getSessionFromRequest } from "@/lib/session"
import { getGoogleDriveClient } from "@/lib/google-drive-client"
import { dbService } from "@/lib/database"

/**
 * Google Drive Processing API
 * 
 * Handles processing of Google Drive content:
 * - Single files: Processes individual documents (Google Docs, PDFs, etc.)
 * - Folders: Processes all supported files in a folder
 * 
 * Supported URL formats:
 * - Files: https://drive.google.com/file/d/FILE_ID/view
 * - Files: https://drive.google.com/open?id=FILE_ID  
 * - Folders: https://drive.google.com/drive/folders/FOLDER_ID
 */

export async function POST(request: NextRequest) {
  try {
    // Get user from session
    const user = await getSessionFromRequest(request)
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { url, projectId, fileTypes } = await request.json()

    if (!url) {
      return NextResponse.json({ error: "Google Drive folder URL is required" }, { status: 400 })
    }

    if (!projectId) {
      return NextResponse.json({ error: "Project ID is required" }, { status: 400 })
    }

    // Validate that it's a Google Drive URL (file or folder)
    const isFile = isGoogleDriveFileUrl(url)
    const isFolder = isGoogleDriveFolderUrl(url)
    
    if (!isFile && !isFolder) {
      return NextResponse.json({ 
        error: "Invalid Google Drive URL. Please provide a valid file or folder sharing link." 
      }, { status: 400 })
    }

    // Get Google Drive client and start processing
    const googleDriveClient = getGoogleDriveClient()
    
    let result: any
    
    if (isFile) {
      console.log("Processing Google Drive file:", url)
      // Process single file
      result = await googleDriveClient.processFile({
        file_url: url,
        user_id: user.id,
        project_id: projectId
      })
      console.log("Processing result:", result)
      // If this is the first source, update project with file name
      const source = await dbService.getSource(result.processed_file?.source_id)
      const isFirstSource = await dbService.isFirstSourceInProject(user.id, projectId)
      if (isFirstSource && result.success) {
        try {
          const fileName = result.processed_file?.file_name || 'Unknown File'
          await dbService.updateProject(projectId, user.id, {
            name: `Google Drive: ${fileName}`,
            description: `Document from Google Drive file: ${fileName}`
          })
        } catch (error) {
          console.error("Error updating project:", error)
          // Continue even if project update fails
        }
      }
      
      return NextResponse.json({
        success: result.success,
        message: result.message,
        processedFile: result.processed_file,
        source: source,
        type: 'file'
      })
      
    } else {
      // Process folder
      result = await googleDriveClient.processFolder({
        folder_url: url,
        user_id: user.id,
        project_id: projectId,
        file_types: fileTypes || ['docx']
      })
      console.log("Processing folder result:", result)
      if (!result.success) {
        return NextResponse.json({
          error: result.message || "Failed to start folder processing"
        }, { status: 500 })
      }

      const isFirstSource = await dbService.isFirstSourceInProject(user.id, projectId)
      // If this is the first source, update project with a temporary name
      if (isFirstSource) {
        try {
          const folderName = extractFolderNameFromUrl(url)
          await dbService.updateProject(projectId, user.id, {
            name: `Google Drive: ${folderName}`,
            description: `Documents from Google Drive folder: ${folderName}`
          })
        } catch (error) {
          console.error("Error updating project:", error)
          // Continue even if project update fails
        }
      }

      return NextResponse.json({
        success: true,
        taskId: result.task_id,
        message: result.message,
        filesFound: result.files_found,
        projectUpdated: isFirstSource,
        type: 'folder'
      })
    }

  } catch (error) {
    console.error("Google Drive processing error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process Google Drive content" },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get user from session
    const user = await getSessionFromRequest(request)
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get task ID from query parameters
    const { searchParams } = new URL(request.url)
    const taskId = searchParams.get('taskId')

    if (!taskId) {
      return NextResponse.json({ error: "Task ID is required" }, { status: 400 })
    }

    // Get processing status
    const googleDriveClient = getGoogleDriveClient()
    const status = await googleDriveClient.getProcessingStatus(taskId)

    return NextResponse.json({
      success: status.success,
      status: status.status,
      message: status.message,
      totalFiles: status.total_files,
      processedFiles: status.processed_files,
      failedFiles: status.failed_files,
      results: status.results
    })

  } catch (error) {
    console.error("Error getting processing status:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get processing status" },
      { status: 500 }
    )
  }
}

function isGoogleDriveFileUrl(url: string): boolean {
  return url.includes('drive.google.com/drive/folders/') || 
          url.includes('drive.google.com/file/d/') ||
          url.includes('drive.google.com/open?id=') ||
          url.includes('docs.google.com/document') ||
          url.includes('docs.google.com/presentation')
}

function isGoogleDriveFolderUrl(url: string): boolean {
  return url.includes('drive.google.com/drive/folders/')
}

function extractFileNameFromUrl(url: string): string {
  // Try to extract file name from URL or use a default
  try {
    // For now, return a generic name - in a real implementation, 
    // you might want to call Google Drive API to get the actual file name
    const fileIdMatch = url.match(/\/file\/d\/([a-zA-Z0-9-_]+)/)
    if (fileIdMatch) {
      return `File-${fileIdMatch[1].substring(0, 8)}`
    }
    
    const openIdMatch = url.match(/\?id=([a-zA-Z0-9-_]+)/)
    if (openIdMatch) {
      return `File-${openIdMatch[1].substring(0, 8)}`
    }
    
    return "Shared File"
  } catch (error) {
    return "Google Drive File"
  }
}

function extractFolderNameFromUrl(url: string): string {
  // Try to extract folder name from URL or use a default
  try {
    // For now, return a generic name - in a real implementation, 
    // you might want to call Google Drive API to get the actual folder name
    const folderIdMatch = url.match(/\/folders\/([a-zA-Z0-9-_]+)/)
    if (folderIdMatch) {
      return `Folder-${folderIdMatch[1].substring(0, 8)}`
    }
    return "Shared Folder"
  } catch (error) {
    return "Google Drive Folder"
  }
}
