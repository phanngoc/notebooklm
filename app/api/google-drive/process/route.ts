import { NextRequest, NextResponse } from "next/server"
import { getSessionFromRequest } from "@/lib/session"
import { getGoogleDriveClient } from "@/lib/google-drive-client"
import { dbService } from "@/lib/database"

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

    // Validate that it's a Google Drive folder URL
    if (!url.includes('drive.google.com/drive/folders/')) {
      return NextResponse.json({ 
        error: "Invalid Google Drive folder URL. Please provide a valid folder sharing link." 
      }, { status: 400 })
    }

    // Check if this is the first source in the project
    const isFirstSource = await dbService.isFirstSourceInProject(user.id, projectId)

    // Get Google Drive client and start processing
    const googleDriveClient = getGoogleDriveClient()
    
    const result = await googleDriveClient.processFolder({
      folder_url: url,
      user_id: user.id,
      project_id: projectId,
      file_types: fileTypes || ['docx']
    })

    if (!result.success) {
      return NextResponse.json({
        error: result.message || "Failed to start folder processing"
      }, { status: 500 })
    }

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
    })

  } catch (error) {
    console.error("Google Drive folder processing error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process Google Drive folder" },
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
