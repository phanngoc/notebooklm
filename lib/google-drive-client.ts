import * as grpc from '@grpc/grpc-js'
import * as protoLoader from '@grpc/proto-loader'
import path from 'path'

// Load Google Drive proto definition
const GOOGLE_DRIVE_PROTO_PATH = path.join(process.cwd(), 'ai/proto/google_drive.proto')

const googleDrivePackageDefinition = protoLoader.loadSync(GOOGLE_DRIVE_PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
})

const googleDriveProto = grpc.loadPackageDefinition(googleDrivePackageDefinition) as any

interface ProcessFolderRequest {
  folder_url: string
  user_id: string
  project_id: string
  file_types: string[]
}

interface ProcessFolderResponse {
  success: boolean
  message: string
  task_id: string
  files_found: number
  files_processed: number
  processed_files: ProcessedFile[]
}

interface ProcessedFile {
  file_name: string
  file_id: string
  source_id: string
  success: boolean
  error_message: string
  markdown_content: string
  file_size: number
}

interface GetStatusRequest {
  task_id: string
}

interface GetStatusResponse {
  success: boolean
  status: string
  message: string
  total_files: number
  processed_files: number
  failed_files: number
  results: ProcessedFile[]
}

export class GoogleDriveClient {
  private client: any

  constructor(serverAddress: string = 'localhost:50052') {
    this.client = new googleDriveProto.google_drive.GoogleDriveService(
      serverAddress,
      grpc.credentials.createInsecure()
    )
  }

  async processFolder(request: ProcessFolderRequest): Promise<ProcessFolderResponse> {
    return new Promise((resolve, reject) => {
      this.client.ProcessFolder(request, (error: any, response: ProcessFolderResponse) => {
        if (error) {
          console.error('Error processing folder:', error)
          reject(error)
        } else {
          resolve(response)
        }
      })
    })
  }

  async getProcessingStatus(taskId: string): Promise<GetStatusResponse> {
    return new Promise((resolve, reject) => {
      const request: GetStatusRequest = { task_id: taskId }
      
      this.client.GetProcessingStatus(request, (error: any, response: GetStatusResponse) => {
        if (error) {
          console.error('Error getting processing status:', error)
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

// Singleton instance
let googleDriveClient: GoogleDriveClient | null = null

export function getGoogleDriveClient(): GoogleDriveClient {
  if (!googleDriveClient) {
    const serverAddress = process.env.GRPC_SERVER_ADDRESS || 'localhost:50052'
    googleDriveClient = new GoogleDriveClient(serverAddress)
  }
  return googleDriveClient
}

export type {
  ProcessFolderRequest,
  ProcessFolderResponse,
  ProcessedFile,
  GetStatusRequest,
  GetStatusResponse,
}
