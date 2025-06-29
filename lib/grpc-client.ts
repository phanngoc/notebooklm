import * as grpc from '@grpc/grpc-js'
import * as protoLoader from '@grpc/proto-loader'
import path from 'path'

// gRPC status codes for better error handling
const { status } = grpc

// Define types for the gRPC service
interface ChatMessage {
  role: string
  content: string
}

interface ChatRequest {
  message: string
  user_id: string
  source_ids: string[]
  context: string
}

interface ChatResponse {
  response: string
  relevant_memories: string[]
  success: boolean
  error: string
}

interface AddMemoriesRequest {
  messages: ChatMessage[]
  user_id: string
}

interface AddMemoriesResponse {
  success: boolean
  error: string
}

interface SearchRequest {
  query: string
  user_id: string
  limit: number
}

interface SearchResponse {
  memories: string[]
  success: boolean
  error: string
}

// GraphRAG service interfaces
interface InsertContentRequest {
  content: string
  user_id: string
  project_id: string
}

interface InsertContentResponse {
  success: boolean
  error: string
}

interface ProcessFileRequest {
  file_url: string
  user_id: string
  project_id: string
  file_name: string
  mime_type: string
  source_id: string
}

interface ProcessFileResponse {
  success: boolean
  error: string
  markdown_content: string
  content_length: number
}

interface QueryGraphRequest {
  query: string
  user_id: string
  project_id: string
  max_results?: number
  similarity_threshold?: number
  entity_types?: string[]
}

interface QueryGraphResponse {
  response: string
  context: any
  success: boolean
  error: string
}

class ChatMemoryClient {
  private client: any
  
  constructor(serverAddress?: string) {
    const address = serverAddress || process.env.CHAT_MEMORY_GRPC_ADDRESS || 'localhost:50051'
    // Load the protobuf definition
    const PROTO_PATH = path.join(process.cwd(), 'ai', 'proto', 'chat_memory.proto')
    
    const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    })
    
    const chatMemoryProto = grpc.loadPackageDefinition(packageDefinition) as any
    
    // Create the client
    this.client = new chatMemoryProto.chat_memory.ChatMemoryService(
      address,
      grpc.credentials.createInsecure()
    )
  }
  
  async chatWithMemories(request: ChatRequest): Promise<ChatResponse> {
    return new Promise((resolve, reject) => {
      this.client.ChatWithMemories(request, (error: any, response: ChatResponse) => {
        if (error) {
          reject(error)
        } else {
          resolve(response)
        }
      })
    })
  }
  
  async addMemories(request: AddMemoriesRequest): Promise<AddMemoriesResponse> {
    return new Promise((resolve, reject) => {
      this.client.AddMemories(request, (error: any, response: AddMemoriesResponse) => {
        if (error) {
          reject(error)
        } else {
          resolve(response)
        }
      })
    })
  }
  
  async searchMemories(request: SearchRequest): Promise<SearchResponse> {
    return new Promise((resolve, reject) => {
      this.client.SearchMemories(request, (error: any, response: SearchResponse) => {
        if (error) {
          reject(error)
        } else {
          resolve(response)
        }
      })
    })
  }
}

class GraphRAGClient {
  private client: any
  
  constructor(serverAddress?: string) {
    const address = serverAddress || process.env.GRAPHRAG_GRPC_ADDRESS || 'localhost:50052'
    // Load the protobuf definition
    const PROTO_PATH = path.join(process.cwd(), 'ai', 'proto', 'graphrag.proto')
    
    const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    })
    
    const graphragProto = grpc.loadPackageDefinition(packageDefinition) as any
    
    // Create the client
    this.client = new graphragProto.graphrag.GraphRAGService(
      address,
      grpc.credentials.createInsecure()
    )
  }
  
  async insertContent(request: InsertContentRequest): Promise<InsertContentResponse> {
    return new Promise((resolve, reject) => {
      // Set timeout for content insertion (2 minutes)
      const timeout = setTimeout(() => {
        reject(new Error('gRPC call timeout: Content insertion took too long'))
      }, 2 * 60 * 1000)

      this.client.InsertContent(request, (error: any, response: InsertContentResponse) => {
        clearTimeout(timeout)
        
        if (error) {
          // Enhanced error handling
          let enhancedError = error
          if (error.code === status.UNAVAILABLE) {
            enhancedError = new Error('GraphRAG service is unavailable')
          } else if (error.code === status.INVALID_ARGUMENT) {
            enhancedError = new Error(`Invalid content parameters: ${error.details || error.message}`)
          }
          reject(enhancedError)
        } else {
          resolve(response)
        }
      })
    })
  }

  async processFile(request: ProcessFileRequest): Promise<ProcessFileResponse> {
    return new Promise((resolve, reject) => {
      // Set timeout for file processing (5 minutes)
      const timeout = setTimeout(() => {
        reject(new Error('gRPC call timeout: File processing took too long'))
      }, 5 * 60 * 1000)

      this.client.ProcessFile(request, (error: any, response: ProcessFileResponse) => {
        clearTimeout(timeout)
        
        if (error) {
          // Enhanced error handling
          let enhancedError = error
          if (error.code === status.UNAVAILABLE) {
            enhancedError = new Error('Processing service is unavailable - please try again later')
          } else if (error.code === status.INVALID_ARGUMENT) {
            enhancedError = new Error(`Invalid request parameters: ${error.details || error.message}`)
          } else if (error.code === status.DEADLINE_EXCEEDED) {
            enhancedError = new Error('Processing timeout - file may be too large')
          } else {
            enhancedError = new Error(`Processing service error: ${error.message || 'Unknown error'}`)
          }
          reject(enhancedError)
        } else {
          // Validate response structure
          if (!response || typeof response.success !== 'boolean') {
            reject(new Error('Invalid response from processing service'))
            return
          }
          
          // Ensure string fields are strings
          const validatedResponse: ProcessFileResponse = {
            success: response.success,
            error: response.error || '',
            markdown_content: response.markdown_content || '',
            content_length: response.content_length || 0
          }
          
          resolve(validatedResponse)
        }
      })
    })
  }
  
  async queryGraph(request: QueryGraphRequest): Promise<QueryGraphResponse> {
    return new Promise((resolve, reject) => {
      // Set timeout for graph queries (30 seconds)
      const timeout = setTimeout(() => {
        reject(new Error('gRPC call timeout: Graph query took too long'))
      }, 30 * 1000)

      this.client.QueryGraph(request, (error: any, response: QueryGraphResponse) => {
        clearTimeout(timeout)
        
        if (error) {
          let enhancedError = error
          if (error.code === status.UNAVAILABLE) {
            enhancedError = new Error('GraphRAG service is unavailable')
          } else if (error.code === status.INVALID_ARGUMENT) {
            enhancedError = new Error(`Invalid query parameters: ${error.details || error.message}`)
          }
          reject(enhancedError)
        } else {
          // Validate response structure
          const validatedResponse: QueryGraphResponse = {
            response: response.response || '',
            context: response.context || {},
            success: response.success || false,
            error: response.error || ''
          }
          resolve(validatedResponse)
        }
      })
    })
  }
  
  async healthCheck(): Promise<boolean> {
    try {
      // Simple health check by attempting a small query
      const result = await this.queryGraph({
        query: "health check",
        user_id: "system",
        project_id: "health",
        max_results: 1
      })
      return true
    } catch (error) {
      console.warn('GraphRAG service health check failed:', error)
      return false
    }
  }

  close() {
    this.client.close()
  }
}

// Export singleton instances
export const chatMemoryClient = new ChatMemoryClient()
export const graphragClient = new GraphRAGClient()
export { ChatMemoryClient, GraphRAGClient }
export type { 
  ChatRequest, 
  ChatResponse, 
  ChatMessage, 
  AddMemoriesRequest, 
  AddMemoriesResponse, 
  SearchRequest, 
  SearchResponse,
  InsertContentRequest,
  InsertContentResponse,
  ProcessFileRequest,
  ProcessFileResponse,
  QueryGraphRequest,
  QueryGraphResponse
}
