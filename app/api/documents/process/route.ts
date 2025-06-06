import { NextRequest, NextResponse } from "next/server"
import { vectorService } from "@/lib/langchain"
import { dbService } from "@/lib/database"
import { getSessionFromRequest } from "@/lib/session"

export async function POST(request: NextRequest) {
  try {
    // Get user from session
    const user = await getSessionFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { content, title, type, url } = await request.json()

    if (!content) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 })
    }

    // Save source to database first
    const source = await dbService.addSource(user.id, {
      title: title || "Untitled Document",
      type: type || "text",
      content,
      url,
    })

    // Process document for vector search
    const result = await vectorService.addDocuments(source.id, content, {
      title: source.title,
      type: source.type,
      url: source.url,
    })

    return NextResponse.json({
      success: true,
      sourceId: source.id,
      chunksProcessed: result.chunksCount,
    })
  } catch (error) {
    console.error("Document processing error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process document" },
      { status: 500 },
    )
  }
}
