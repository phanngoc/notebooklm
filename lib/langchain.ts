import { OpenAIEmbeddings } from "@langchain/openai"
import { createServerClient } from "./supabase"
import { SimpleTextSplitter } from "./text-splitter"

const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: "text-embedding-ada-002",
})

export class VectorService {
  private textSplitter: SimpleTextSplitter

  constructor() {
    this.textSplitter = new SimpleTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    })
  }

  async addDocuments(sourceId: string, content: string, metadata: Record<string, any> = {}) {
    try {
      const supabaseClient = createServerClient()

      // Split the document into chunks
      const chunks = this.textSplitter.splitText(content)

      // Generate embeddings for each chunk
      const embeddings_results = await embeddings.embedDocuments(chunks)

      // Prepare data for insertion
      const documentsToInsert = chunks.map((chunk, index) => ({
        source_id: sourceId,
        content: chunk,
        embedding: embeddings_results[index],
        metadata: {
          sourceId,
          chunkIndex: index,
          ...metadata,
        },
      }))

      // Insert into Supabase in batches to avoid timeout
      const batchSize = 10
      for (let i = 0; i < documentsToInsert.length; i += batchSize) {
        const batch = documentsToInsert.slice(i, i + batchSize)
        const { error } = await supabaseClient.from("document_embeddings").insert(batch)

        if (error) throw error
      }

      return { success: true, chunksCount: chunks.length }
    } catch (error) {
      console.error("Error adding documents to vector store:", error)
      throw error
    }
  }

  async similaritySearch(query: string, sourceIds: string[] = [], k = 5) {
    try {
      const supabaseClient = createServerClient()

      // Generate embedding for the query
      const queryEmbedding = await embeddings.embedQuery(query)

      // Prepare the filter
      const filter = sourceIds.length > 0 ? { sourceId: sourceIds } : {}

      // Call the match function
      const { data, error } = await supabaseClient.rpc("match_documents", {
        query_embedding: queryEmbedding,
        match_threshold: 0.7,
        match_count: k,
        filter: filter,
      })

      console.log("Similarity search results:", data)

      if (error) throw error

      return (data || []).map((doc: any) => ({
        content: doc.content,
        metadata: doc.metadata,
        sourceId: doc.metadata.sourceId,
        similarity: doc.similarity,
      }))
    } catch (error) {
      console.error("Error performing similarity search:", error)
      throw error
    }
  }

  async deleteDocumentsBySourceId(sourceId: string) {
    try {
      const supabaseClient = createServerClient()
      const { error } = await supabaseClient.from("document_embeddings").delete().eq("source_id", sourceId)

      if (error) throw error
    } catch (error) {
      console.error("Error deleting documents from vector store:", error)
      throw error
    }
  }
}

export const vectorService = new VectorService()
