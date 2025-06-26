import { dbService } from "@/lib/database"

interface ProjectGenerationData {
  title: string
  description: string
  domain: string
  example_queries: string[]
  entity_types: string[]
}

interface Source {
  id: string
  title: string
  type: string
  content: string
  url?: string
}

export class ProjectService {
  /**
   * Generates project metadata using OpenAI based on source content
   */
  private async generateProjectMetadata(source: Source, content: string): Promise<ProjectGenerationData | null> {
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

    try {
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
            const parsedData = JSON.parse(generatedContent) as ProjectGenerationData
            return parsedData
          } catch (parseError) {
            console.error("Error parsing OpenAI response:", parseError)
            return null
          }
        }
      } else {
        console.error("OpenAI API error:", response.status, response.statusText)
        return null
      }
    } catch (error) {
      console.error("Error generating project metadata:", error)
      return null
    }

    return null
  }

  /**
   * Gets default project configuration as fallback
   */
  private getDefaultProjectConfig(source: Source) {
    return {
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
    }
  }

  /**
   * Handles project setup for the first source in a project
   * Generates project metadata and updates the project with AI-generated or default configs
   */
  async handleFirstSourceInProject(
    userId: string, 
    projectId: string, 
    source: Source, 
    content: string
  ): Promise<boolean> {
    try {
      // Check if this is the first source in the project
      const isFirstSource = await dbService.isFirstSourceInProject(userId, projectId)
      
      if (!isFirstSource) {
        return false
      }

      // Try to generate project metadata using AI
      const generatedData = await this.generateProjectMetadata(source, content)
      
      let projectUpdateData
      if (generatedData) {
        // Use AI-generated metadata
        projectUpdateData = {
          name: generatedData.title,
          description: generatedData.description,
          domain: generatedData.domain,
          example_queries: generatedData.example_queries,
          entity_types: generatedData.entity_types
        }
      } else {
        // Fallback to default configuration
        projectUpdateData = this.getDefaultProjectConfig(source)
      }

      // Update the project
      await dbService.updateProject(projectId, userId, projectUpdateData)
      
      return true
    } catch (error) {
      console.error("Error handling first source in project:", error)
      
      // Final fallback - still try to update with default config
      try {
        const defaultConfig = this.getDefaultProjectConfig(source)
        await dbService.updateProject(projectId, userId, defaultConfig)
        return true
      } catch (fallbackError) {
        console.error("Error in fallback project update:", fallbackError)
        return false
      }
    }
  }

  /**
   * Checks if the given source is the first source in the project
   */
  async isFirstSourceInProject(userId: string, projectId: string): Promise<boolean> {
    return await dbService.isFirstSourceInProject(userId, projectId)
  }
}

export const projectService = new ProjectService()
