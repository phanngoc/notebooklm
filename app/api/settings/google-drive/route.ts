import { NextRequest, NextResponse } from "next/server"
import { getSessionFromRequest } from "@/lib/session"
import { dbService } from "@/lib/database"

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionFromRequest(request)
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const credentials = await dbService.getGoogleDriveCredentials(user.id)

    return NextResponse.json({
      success: true,
      hasCredentials: !!credentials,
      // Don't return actual credentials for security
      credentials: credentials ? "***CONFIGURED***" : null
    })

  } catch (error) {
    console.error("Error fetching Google Drive credentials:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch credentials" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionFromRequest(request)
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { credentials } = await request.json()

    if (!credentials) {
      return NextResponse.json({ error: "Credentials are required" }, { status: 400 })
    }

    // Validate JSON format
    try {
      const parsed = JSON.parse(credentials)
      if (!parsed.type || !parsed.project_id || !parsed.private_key || !parsed.client_email) {
        throw new Error("Invalid service account JSON format")
      }
    } catch (parseError) {
      return NextResponse.json({ 
        error: "Invalid JSON format for service account credentials" 
      }, { status: 400 })
    }

    await dbService.setGoogleDriveCredentials(user.id, credentials)

    return NextResponse.json({
      success: true,
      message: "Google Drive credentials saved successfully"
    })

  } catch (error) {
    console.error("Error saving Google Drive credentials:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save credentials" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getSessionFromRequest(request)
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await dbService.deleteGoogleDriveCredentials(user.id)

    return NextResponse.json({
      success: true,
      message: "Google Drive credentials deleted successfully"
    })

  } catch (error) {
    console.error("Error deleting Google Drive credentials:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete credentials" },
      { status: 500 }
    )
  }
}
