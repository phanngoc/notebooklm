import { NextRequest, NextResponse } from "next/server"
import { dbService } from "@/lib/database"
import { vectorService } from "@/lib/langchain"
import { getSessionFromRequest } from "@/lib/session"

export async function POST(
  request: NextRequest,
  { params }: { params: { noteId: string } }
) {
  try {
    const user = await getSessionFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { noteId } = params
    if (!noteId) {
      return NextResponse.json({ error: "Note ID is required" }, { status: 400 })
    }

    const { projectId } = await request.json()
    if (!projectId) {
      return NextResponse.json({ error: "Project ID is required" }, { status: 400 })
    }

    // Get the note first
    const note = await dbService.getNote(noteId)
    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 })
    }

    // Save source to database first
    const source = await dbService.addSource(user.id, {
      title: note.title || "Untitled Document",
      type: "text",
      content: note.content,
      url: undefined,
    }, projectId)

    // Process document for vector search
    const result = await vectorService.addDocuments(source.id, note.content, {
      title: source.title,
      type: source.type,
      url: source.url,
      userId: user.id,
      projectId: projectId,
    })

    return NextResponse.json({
      success: true,
      sourceId: source.id,
      chunksProcessed: result.chunksCount,
    })
  } catch (error) {
    console.error("Error converting note to source:", error)
    return NextResponse.json(
      { error: "Failed to convert note to source" },
      { status: 500 }
    )
  }
}
