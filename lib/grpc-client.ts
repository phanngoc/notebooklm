import * as grpc from '@grpc/grpc-js'
import * as protoLoader from '@grpc/proto-loader'
import path from 'path'

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

class ChatMemoryClient {
  private client: any
  
  constructor(serverAddress: string = 'localhost:50051') {
    // Load the protobuf definition
    const PROTO_PATH = path.join(process.cwd(), 'ai', 'chat_memory.proto')
    
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
      serverAddress,
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
  
  close() {
    this.client.close()
  }
}

// Export singleton instance
export const chatMemoryClient = new ChatMemoryClient()
export { ChatMemoryClient }
export type { ChatRequest, ChatResponse, ChatMessage, AddMemoriesRequest, AddMemoriesResponse, SearchRequest, SearchResponse }
