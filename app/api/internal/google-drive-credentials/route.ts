import { NextRequest, NextResponse } from "next/server"
import { dbService } from "@/lib/database"

// Internal API for Python service to get user credentials
export async function GET(request: NextRequest) {
  try {
    // Check if this is an internal request
    const isInternalRequest = request.headers.get('X-Internal-Request') === 'true'
    const userId = request.headers.get('X-User-ID')

    if (!isInternalRequest || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const credentials = await dbService.getGoogleDriveCredentials(userId)

    return NextResponse.json({
      success: true,
      credentials: credentials,
      hasCredentials: !!credentials
    })

  } catch (error) {
    console.error("Error fetching internal credentials:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch credentials" },
      { status: 500 }
    )
  }
}
