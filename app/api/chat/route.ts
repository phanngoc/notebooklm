import { NextRequest, NextResponse } from "next/server"
import { OpenAI } from "openai"
import { vectorService } from "@/lib/langchain"
import { dbService } from "@/lib/database"
import { getSessionFromRequest } from "@/lib/session"
import { chatMemoryClient, graphragClient } from "@/lib/grpc-client"

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

    const { message, sourceIds, sessionId, projectId } = await request.json()

    if (!message || !sourceIds || sourceIds.length === 0) {
      return NextResponse.json({ error: "Message and source IDs are required" }, { status: 400 })
    }

    if (!projectId) {
      return NextResponse.json({ error: "Project ID is required" }, { status: 400 })
    }

    console.log("Received message:", message)
    console.log("Source IDs:", sourceIds)
    console.log("Session ID:", sessionId)
    console.log("Project ID:", projectId)
    
    // Save user message to database
    if (sessionId) {
      await dbService.addChatMessage(sessionId, {
        role: "user",
        content: message,
      })
    }

    let context = ""
    let relevantSources: string[] = []
    let aiResponse: string = ""
    let graphragResponse: string = ""
    let messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = []

    try {
      // First, try to get context-aware response from GraphRAG
      console.log("Calling GraphRAG gRPC service for context-aware response...")
      const graphragResult = await graphragClient.queryGraph({
        query: message,
        user_id: user.id,
        project_id: projectId,
        max_results: 5,
        similarity_threshold: 0.7
      })

      if (graphragResult.success && graphragResult.response) {
        graphragResponse = graphragResult.response
        console.log("GraphRAG response received successfully")
        
        // Use GraphRAG response as the primary response
        aiResponse = graphragResponse
      } else {
        console.log("GraphRAG query failed or returned no response, falling back to vector search")
        throw new Error(graphragResult.error || "GraphRAG query failed")
      }
    } catch (graphragError) {
      console.error("GraphRAG call failed, falling back to vector search + OpenAI:", graphragError)

      // Fallback to original vector search + OpenAI approach
      const systemPrompt = context
        ? `You are a helpful AI assistant that answers questions based on the provided documents. 
Use only the information from the provided context to answer questions. 
If the answer cannot be found in the context, say so clearly.
Be concise and accurate in your responses.

Context:
${context}`
        : `You are a helpful AI assistant. The user has selected some documents but I couldn't retrieve the specific content. 
Please let them know that there was an issue accessing their documents and suggest they try again.`

      messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ]

      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: messages,
        temperature: 0.7,
        max_tokens: 1000,
      })

      aiResponse = completion.choices[0]?.message?.content || "Sorry, I could not generate a response."
    }

    console.log("AI response generated successfully")
    
    // Save AI response to database
    if (sessionId) {
      await dbService.addChatMessage(sessionId, {
        role: "assistant",
        content: aiResponse,
        sources: relevantSources,
      })

      // Add conversation to chat memory for future context
      // try {
      //   const memoryMessages = [
      //     { role: "user", content: message },
      //     { role: "assistant", content: aiResponse }
      //   ]
        
      //   await chatMemoryClient.addMemories({
      //     messages: memoryMessages,
      //     user_id: user.id,
      //   })
        
      //   console.log("Chat memories added successfully")
      // } catch (memoryError) {
      //   console.error("Failed to add chat memories:", memoryError)
      // }
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
