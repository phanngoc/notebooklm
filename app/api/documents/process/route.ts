import { NextRequest, NextResponse } from "next/server"
import { vectorService } from "@/lib/langchain"
import { dbService } from "@/lib/database"
import { getSessionFromRequest } from "@/lib/session"

export async function POST(request: NextRequest) {
  try {
    // Get user from session
    const user = await getSessionFromRequest(request)
    console.log("Processing document upload for user:", user)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { content, title, type, url, projectId } = await request.json()

    if (!content) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 })
    }

    if (!projectId) {
      return NextResponse.json({ error: "Project ID is required" }, { status: 400 })
    }

    // Check if this is the first source in the project
    const isFirstSource = await dbService.isFirstSourceInProject(user.id, projectId)

    // Save source to database first
    const source = await dbService.addSource(user.id, {
      title: title || "Untitled Document",
      type: type || "text",
      content,
      url,
    }, projectId)

    // If this is the first source, generate project title and description using OpenAI
    if (isFirstSource) {
      try {
        const projectGenerationPrompt = `
Based on the following source content, generate a concise project title and description:

Source Title: ${source.title}
Source Content: ${content.substring(0, 1000)}...

Please provide:
1. A concise project title (max 50 characters)
2. A brief project description (max 200 characters)

Format your response as JSON:
{
  "title": "Generated project title",
  "description": "Generated project description"
}
`

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: "You are a helpful assistant that generates project titles and descriptions based on source content. Always respond with valid JSON."
              },
              {
                role: "user",
                content: projectGenerationPrompt
              }
            ],
            max_tokens: 150,
            temperature: 0.7,
          }),
        })

        if (response.ok) {
          const openaiResponse = await response.json()
          const generatedContent = openaiResponse.choices[0]?.message?.content

          if (generatedContent) {
            try {
              const { title: generatedTitle, description: generatedDescription } = JSON.parse(generatedContent)
              
              // Update the project with generated title and description
              await dbService.updateProject(projectId, user.id, {
                name: generatedTitle,
                description: generatedDescription
              })
            } catch (parseError) {
              console.error("Error parsing OpenAI response:", parseError)
              // Fallback to source title if parsing fails
              await dbService.updateProject(projectId, user.id, {
                name: source.title,
                description: `Project based on: ${source.title}`
              })
            }
          }
        } else {
          console.error("OpenAI API error:", response.status, response.statusText)
          // Fallback to source title if OpenAI fails
          await dbService.updateProject(projectId, user.id, {
            name: source.title,
            description: `Project based on: ${source.title}`
          })
        }
      } catch (aiError) {
        console.error("Error generating project title/description:", aiError)
        // Fallback to source title if any error occurs
        await dbService.updateProject(projectId, user.id, {
          name: source.title,
          description: `Project based on: ${source.title}`
        })
      }
    }

    // Process document for vector search
    const result = await vectorService.addDocuments(source.id, content, {
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
      projectUpdated: isFirstSource,
    })
  } catch (error) {
    console.error("Document processing error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process document" },
      { status: 500 },
    )
  }
}
