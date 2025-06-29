/**
 * File upload service using Supabase Storage
 * Handles file uploads to Supabase buckets with proper error handling
 */

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { v4 as uuidv4 } from 'uuid'

export interface UploadResult {
  success: boolean
  fileUrl?: string
  fileName?: string
  filePath?: string
  error?: string
  fileSize?: number
  mimeType?: string
}

export interface UploadProgress {
  loaded: number
  total: number
  percentage: number
}

export class FileUploadService {
  private supabase
  private bucketName = 'filedoc'

  constructor() {
    this.supabase = createClientComponentClient()
  }

  /**
   * Upload a file to Supabase Storage
   */
  async uploadFile(
    file: File,
    projectId: string,
    userId: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<UploadResult> {
    try {
      // Validate file
      const validation = this.validateFile(file)
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error
        }
      }

      // Generate unique file path
      const fileExtension = file.name.split('.').pop()
      const uniqueFileName = `${uuidv4()}.${fileExtension}`
      const filePath = `${userId}/${projectId}/${uniqueFileName}`

      // Check if bucket exists, create if not
      await this.ensureBucketExists()

      // Upload file with progress tracking
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (error) {
        console.error('Upload error:', error)
        return {
          success: false,
          error: `Upload failed: ${error.message}`
        }
      }

      // Get public URL
      const { data: publicUrlData } = this.supabase.storage
        .from(this.bucketName)
        .getPublicUrl(filePath)

      return {
        success: true,
        fileUrl: publicUrlData.publicUrl,
        fileName: file.name,
        filePath: filePath,
        fileSize: file.size,
        mimeType: file.type
      }

    } catch (error) {
      console.error('File upload error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown upload error'
      }
    }
  }

  /**
   * Delete a file from Supabase Storage
   */
  async deleteFile(filePath: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.supabase.storage
        .from(this.bucketName)
        .remove([filePath])

      if (error) {
        return {
          success: false,
          error: `Delete failed: ${error.message}`
        }
      }

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown delete error'
      }
    }
  }

  /**
   * Download a file from Supabase Storage
   */
  async downloadFile(filePath: string): Promise<{ success: boolean; blob?: Blob; error?: string }> {
    try {
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .download(filePath)

      if (error) {
        return {
          success: false,
          error: `Download failed: ${error.message}`
        }
      }

      return {
        success: true,
        blob: data
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown download error'
      }
    }
  }

  /**
   * Get file info from Supabase Storage
   */
  async getFileInfo(filePath: string): Promise<{ success: boolean; info?: any; error?: string }> {
    try {
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .list(filePath.substring(0, filePath.lastIndexOf('/')), {
          limit: 1,
          search: filePath.substring(filePath.lastIndexOf('/') + 1)
        })

      if (error) {
        return {
          success: false,
          error: `Info retrieval failed: ${error.message}`
        }
      }

      return {
        success: true,
        info: data?.[0]
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown info retrieval error'
      }
    }
  }

  /**
   * Validate file before upload
   */
  private validateFile(file: File): { valid: boolean; error?: string } {
    // Check file size (50MB limit)
    const maxSize = 50 * 1024 * 1024 // 50MB
    if (file.size > maxSize) {
      return {
        valid: false,
        error: 'File size exceeds 50MB limit'
      }
    }

    // Check file type
    const allowedTypes = [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/csv',
      'application/json',
      'text/html',
      'application/rtf'
    ]

    if (!allowedTypes.includes(file.type)) {
      return {
        valid: false,
        error: 'File type not supported. Please upload PDF, TXT, MD, DOC, DOCX, CSV, JSON, HTML, or RTF files.'
      }
    }

    return { valid: true }
  }

  /**
   * Ensure the documents bucket exists
   */
  private async ensureBucketExists(): Promise<void> {
    try {
      const { data: buckets } = await this.supabase.storage.listBuckets()
      console.log('Available buckets:', buckets)
      const bucketExists = buckets?.some(bucket => bucket.name === this.bucketName)

      if (!bucketExists) {
        console.log(`Bucket "${this.bucketName}" does not exist, creating...`)
        const { error } = await this.supabase.storage.createBucket(this.bucketName, {
          public: true,
          allowedMimeTypes: [
            'application/pdf',
            'text/plain',
            'text/markdown',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/csv',
            'application/json',
            'text/html',
            'application/rtf'
          ],
          fileSizeLimit: 52428800 // 50MB
        })

        if (error) {
          console.error('Failed to create bucket:', error)
        }
      }
    } catch (error) {
      console.error('Error checking/creating bucket:', error)
    }
  }

  /**
   * List files in a project directory
   */
  async listProjectFiles(userId: string, projectId: string): Promise<{ success: boolean; files?: any[]; error?: string }> {
    try {
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .list(`${userId}/${projectId}`)

      if (error) {
        return {
          success: false,
          error: `Failed to list files: ${error.message}`
        }
      }

      return {
        success: true,
        files: data
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown list error'
      }
    }
  }
}

// Create singleton instance
export const fileUploadService = new FileUploadService()
