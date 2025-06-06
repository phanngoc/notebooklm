import { NextRequest, NextResponse } from "next/server"
import { OpenAI } from "openai"
import { vectorService } from "@/lib/langchain"
import { dbService } from "@/lib/database"
import { getSessionFromRequest } from "@/lib/session"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    // Get user from session
    const user = await getSessionFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { message, sourceIds, sessionId } = await request.json()

    if (!message || !sourceIds || sourceIds.length === 0) {
      return NextResponse.json({ error: "Message and source IDs are required" }, { status: 400 })
    }

    console.log("Received message:", message)
    console.log("Source IDs:", sourceIds)
    console.log("Session ID:", sessionId)
    // Save user message to database
    if (sessionId) {
      await dbService.addChatMessage(sessionId, {
        role: "user",
        content: message,
      })
    }

    let context = ""
    let relevantSources: string[] = []

    try {
      // Try to perform similarity search to get relevant context
      const relevantDocs = await vectorService.similaritySearch(message, sourceIds, 5)
      console.log("Relevant documents found:", relevantDocs.length)
      console.log("Relevant documents:", relevantDocs)
      if (relevantDocs.length > 0) {
        context = relevantDocs
          .map((doc: any) => `Source: ${doc.metadata.title || doc.sourceId}\nContent: ${doc.content}`)
          .join("\n\n---\n\n")
        relevantSources = relevantDocs.map((doc: any) => doc.sourceId)
      }
    } catch (vectorError) {
      console.error("Vector search failed, falling back to basic context:", vectorError)

      // Fallback: get source content directly from database
      try {
        const sources = await dbService.getSources(user.id)
        const selectedSources = sources.filter((source) => sourceIds.includes(source.id))

        context = selectedSources
          .map((source) => `Source: ${source.title}\nContent: ${source.content.substring(0, 2000)}...`)
          .join("\n\n---\n\n")
        relevantSources = selectedSources.map((source) => source.id)
      } catch (fallbackError) {
        console.error("Fallback context retrieval failed:", fallbackError)
      }
    }

    // Create the prompt with context
    const systemPrompt = context
      ? `You are a helpful AI assistant that answers questions based on the provided documents. 
Use only the information from the provided context to answer questions. 
If the answer cannot be found in the context, say so clearly.
Be concise and accurate in your responses.

Context:
${context}`
      : `You are a helpful AI assistant. The user has selected some documents but I couldn't retrieve the specific content. 
Please let them know that there was an issue accessing their documents and suggest they try again.`

    // Generate AI response
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    })
    console.log("AI response generated successfully", completion.choices[0]?.message)
    const aiResponse = completion.choices[0]?.message?.content || "Sorry, I could not generate a response."

    // Save AI response to database
    if (sessionId) {
      await dbService.addChatMessage(sessionId, {
        role: "assistant",
        content: aiResponse,
        sources: relevantSources,
      })
    }

    return NextResponse.json({
      response: aiResponse,
      sources: relevantSources,
    })
  } catch (error) {
    console.error("Chat API error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    )
  }
}
