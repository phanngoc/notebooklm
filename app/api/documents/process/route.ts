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
Based on the following source content, analyze and extract key information:

Source Title: ${source.title}
Source Content: ${content.substring(0, 1000)}...

Please provide:
1. A concise project title (max 50 characters)
2. A brief project description (max 200 characters) 
3. An analysis domain description focused on the document's subject matter
4. 5-7 example queries that would be relevant for this content
5. 8-12 entity types that are most relevant to this domain

Format your response as JSON:
{
  "title": "Generated project title",
  "description": "Generated project description",
  "domain": "Domain description focusing on the specific subject matter and key aspects to analyze",
  "example_queries": [
    "Relevant question 1",
    "Relevant question 2",
    "Relevant question 3",
    "Relevant question 4",
    "Relevant question 5"
  ],
  "entity_types": [
    "EntityType1",
    "EntityType2", 
    "EntityType3",
    "EntityType4",
    "EntityType5",
    "EntityType6",
    "EntityType7",
    "EntityType8"
  ]
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
                content: "You are a helpful assistant that analyzes documents and extracts domain-specific information for knowledge graph creation. Always respond with valid JSON containing all requested fields."
              },
              {
                role: "user",
                content: projectGenerationPrompt
              }
            ],
            max_tokens: 500,
            temperature: 0.7,
          }),
        })

        if (response.ok) {
          const openaiResponse = await response.json()
          const generatedContent = openaiResponse.choices[0]?.message?.content

          if (generatedContent) {
            try {
              const { 
                title: generatedTitle, 
                description: generatedDescription,
                domain,
                example_queries,
                entity_types
              } = JSON.parse(generatedContent)
              
              // Update the project with generated title, description, and GraphRAG configs
              await dbService.updateProject(projectId, user.id, {
                name: generatedTitle,
                description: generatedDescription,
                domain: domain,
                example_queries: example_queries,
                entity_types: entity_types
              })
            } catch (parseError) {
              console.error("Error parsing OpenAI response:", parseError)
              // Fallback to source title and default configs if parsing fails
              await dbService.updateProject(projectId, user.id, {
                name: source.title,
                description: `Project based on: ${source.title}`,
                domain: "Analyze documents to identify key information that affects business value, growth potential, and strategic insights. Focus on entities like companies, people, financial metrics, market trends, technologies, strategies, and their relationships.",
                example_queries: [
                  "What are the key factors driving business value?",
                  "How do market trends affect competitive position?",
                  "What strategic initiatives are mentioned in the documents?",
                  "What are the main risk factors discussed?",
                  "What financial metrics or performance indicators are highlighted?",
                  "Who are the key people or organizations mentioned?",
                  "What technologies or innovations are discussed?"
                ],
                entity_types: [
                  "Company", "Person", "Financial_Metric", "Market_Trend", 
                  "Technology", "Strategy", "Risk_Factor", "Product", 
                  "Location", "Industry", "Partnership", "Investment"
                ]
              })
            }
          }
        } else {
          console.error("OpenAI API error:", response.status, response.statusText)
          // Fallback to source title and default configs if OpenAI fails
          await dbService.updateProject(projectId, user.id, {
            name: source.title,
            description: `Project based on: ${source.title}`,
            domain: "Analyze documents to identify key information that affects business value, growth potential, and strategic insights. Focus on entities like companies, people, financial metrics, market trends, technologies, strategies, and their relationships.",
            example_queries: [
              "What are the key factors driving business value?",
              "How do market trends affect competitive position?",
              "What strategic initiatives are mentioned in the documents?",
              "What are the main risk factors discussed?",
              "What financial metrics or performance indicators are highlighted?",
              "Who are the key people or organizations mentioned?",
              "What technologies or innovations are discussed?"
            ],
            entity_types: [
              "Company", "Person", "Financial_Metric", "Market_Trend", 
              "Technology", "Strategy", "Risk_Factor", "Product", 
              "Location", "Industry", "Partnership", "Investment"
            ]
          })
        }
      } catch (aiError) {
        console.error("Error generating project title/description:", aiError)
        // Fallback to source title and default configs if any error occurs
        await dbService.updateProject(projectId, user.id, {
          name: source.title,
          description: `Project based on: ${source.title}`,
          domain: "Analyze documents to identify key information that affects business value, growth potential, and strategic insights. Focus on entities like companies, people, financial metrics, market trends, technologies, strategies, and their relationships.",
          example_queries: [
            "What are the key factors driving business value?",
            "How do market trends affect competitive position?",
            "What strategic initiatives are mentioned in the documents?",
            "What are the main risk factors discussed?",
            "What financial metrics or performance indicators are highlighted?",
            "Who are the key people or organizations mentioned?",
            "What technologies or innovations are discussed?"
          ],
          entity_types: [
            "Company", "Person", "Financial_Metric", "Market_Trend", 
            "Technology", "Strategy", "Risk_Factor", "Product", 
            "Location", "Industry", "Partnership", "Investment"
          ]
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
