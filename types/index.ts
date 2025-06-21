export interface Document {
  id: string
  title: string
  type: "google-doc" | "google-drive" | "website" | "text" | "pdf" | "document" | "markdown" | "spreadsheet" | "data" | "webpage" | "unknown"
  content: string
  url?: string
  selected: boolean
  createdAt: Date
  // File upload specific fields
  filePath?: string
  fileSize?: number
  mimeType?: string
  metadata?: {
    original_filename?: string
    upload_timestamp?: string
    processing_status?: string
    [key: string]: any
  }
}

export interface Setting {
  id: string
  user_id: string
  key: string
  value: string
  description?: string
  is_encrypted: boolean
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  name: string
  description: string
  user_id: string
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  sources?: string[]
}

export interface ChatSession {
  id: string
  title: string
  createdAt: Date
  updatedAt: Date
}

export interface Note {
  id: string
  title: string
  content: string
  createdAt: Date
  sourceIds?: string[]
}

export interface User {
  id: string
  email: string
}
