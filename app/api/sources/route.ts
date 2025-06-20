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

    const sources = await dbService.getSources(user.id, projectId)
    return NextResponse.json(sources)
  } catch (error) {
    console.error("Error fetching sources:", error)
    return NextResponse.json({ error: "Failed to fetch sources" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { title, type, content, url, projectId } = body

    // Validate required fields
    if (!title || !type || !content || !projectId) {
      return NextResponse.json(
        { error: "Title, type, content, and projectId are required" },
        { status: 400 }
      )
    }

    // Check if this is the first source in the project
    const isFirstSource = await dbService.isFirstSourceInProject(user.id, projectId)

    // Save the source first
    const source = await dbService.addSource(
      user.id,
      { title, type, content, url },
      projectId
    )

    // If this is the first source, generate project title and description using OpenAI
    if (isFirstSource) {
      try {
        const projectGenerationPrompt = `
Based on the following source content, generate a concise project title and description:

Source Title: ${title}
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
                name: title,
                description: `Project based on: ${title}`
              })
            }
          }
        } else {
          console.error("OpenAI API error:", response.status, response.statusText)
          // Fallback to source title if OpenAI fails
          await dbService.updateProject(projectId, user.id, {
            name: title,
            description: `Project based on: ${title}`
          })
        }
      } catch (aiError) {
        console.error("Error generating project title/description:", aiError)
        // Fallback to source title if any error occurs
        await dbService.updateProject(projectId, user.id, {
          name: title,
          description: `Project based on: ${title}`
        })
      }
    }

    return NextResponse.json({
      source,
      projectUpdated: isFirstSource
    })
  } catch (error) {
    console.error("Error creating source:", error)
    return NextResponse.json({ error: "Failed to create source" }, { status: 500 })
  }
}
