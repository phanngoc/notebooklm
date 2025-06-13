import { NextRequest, NextResponse } from "next/server"
import { dbService } from "@/lib/database"
import { getSessionFromRequest } from "@/lib/session"

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

    const chatSessions = await dbService.getChatSessions(user.id, projectId)
    return NextResponse.json(chatSessions)
  } catch (error) {
    console.error("Error fetching chat sessions:", error)
    return NextResponse.json({ error: "Failed to fetch chat sessions" }, { status: 500 })
  }
}
