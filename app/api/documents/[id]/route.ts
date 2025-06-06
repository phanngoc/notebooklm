import { type NextRequest, NextResponse } from "next/server"
import { vectorService } from "@/lib/langchain"
import { dbService } from "@/lib/database"
import { getSessionFromRequest } from "@/lib/session"

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Get user from session
    const user = await getSessionFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const sourceId = params.id

    if (!sourceId) {
      return NextResponse.json({ error: "Source ID is required" }, { status: 400 })
    }

    // Delete document embeddings first
    await vectorService.deleteDocumentsBySourceId(sourceId)

    // Delete source from database
    await dbService.deleteSource(sourceId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Document deletion error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete document" },
      { status: 500 },
    )
  }
}
