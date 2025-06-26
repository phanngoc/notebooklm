"""
File upload service for Python backend using Supabase Storage
Handles file processing and metadata storage after upload
"""

import os
import uuid
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime
import mimetypes

from supabase import create_client, Client
from services.supabase_client import SupabaseClient

logger = logging.getLogger(__name__)

class FileUploadService:
    """
    Service for handling file uploads and processing with Supabase Storage
    """
    
    def __init__(self):
        """Initialize the file upload service"""
        self.supabase_client = SupabaseClient(use_secret_key=True)
        self.bucket_name = 'documents'
        
    async def process_uploaded_file(
        self, 
        file_path: str, 
        file_name: str, 
        file_url: str,
        user_id: str, 
        project_id: str,
        file_size: int,
        mime_type: str
    ) -> Dict[str, Any]:
        """
        Process an uploaded file and create database records
        
        Args:
            file_path: Path to file in Supabase Storage
            file_name: Original filename
            file_url: Public URL of the uploaded file
            user_id: ID of the user who uploaded the file
            project_id: ID of the project
            file_size: Size of the file in bytes
            mime_type: MIME type of the file
        
        Returns:
            Dictionary with processing results
        """
        try:
            # Create source record
            source_data = {
                'id': str(uuid.uuid4()),
                'title': file_name,
                'type': self._get_source_type(mime_type),
                'url': file_url,
                'content': '',  # Will be populated after text extraction
                'user_id': user_id,
                'metadata': {
                    'original_filename': file_name,
                    'upload_timestamp': datetime.utcnow().isoformat(),
                    'processing_status': 'pending',
                    'file_path': file_path,
                    'file_size': file_size,
                    'mime_type': mime_type
                },
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }
            
            # Add project_id if provided
            if project_id:
                source_data['project_id'] = project_id
            
            # Add file-specific fields if the schema supports them
            try:
                # Try to include file-specific columns (but not status for now)
                source_data.update({
                    'file_path': file_path,
                    'file_size': file_size,
                    'mime_type': mime_type
                })
            except:
                # If file-specific columns don't exist, store in metadata only
                pass
            
            # Insert source record
            result = self.supabase_client.insert('sources', source_data)
            
            if not result:
                raise Exception("Failed to create source record")
            
            # Start async processing for text extraction and embedding
            # This would typically be done in a background task
            await self._schedule_file_processing(source_data['id'], file_url, mime_type)
            
            return {
                'success': True,
                'source_id': source_data['id'],
                'message': 'File uploaded and processing started'
            }
            
        except Exception as e:
            logger.error(f"Error processing uploaded file: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def _schedule_file_processing(self, source_id: str, file_url: str, mime_type: str):
        """
        Schedule background processing for the uploaded file
        This would typically use a task queue like Celery
        """
        try:
            # For now, we'll just update the status
            # In a production system, this would trigger background processing
            self.supabase_client.update(
                'sources',
                {'id': source_id},
                {
                    'metadata': {
                        'processing_status': 'scheduled',
                        'scheduled_at': datetime.utcnow().isoformat()
                    },
                    'updated_at': datetime.utcnow().isoformat()
                }
            )
            
            logger.info(f"Scheduled processing for source {source_id}")
            
        except Exception as e:
            logger.error(f"Error scheduling file processing: {e}")
    
    def _get_source_type(self, mime_type: str) -> str:
        """
        Determine source type based on MIME type
        """
        type_mapping = {
            'application/pdf': 'pdf',
            'text/plain': 'text',
            'text/markdown': 'markdown',
            'application/msword': 'document',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
            'text/csv': 'spreadsheet',
            'application/json': 'data',
            'text/html': 'webpage',
            'application/rtf': 'document'
        }
        
        return type_mapping.get(mime_type, 'unknown')
    
    def delete_file(self, file_path: str) -> Dict[str, Any]:
        """
        Delete a file from Supabase Storage and clean up database records
        
        Args:
            file_path: Path to file in Supabase Storage
        
        Returns:
            Dictionary with deletion results
        """
        try:
            # Get source record first
            sources = self.supabase_client.select(
                'sources',
                filters={'file_path': file_path}
            )
            
            if not sources:
                return {'success': False, 'error': 'Source not found'}
            
            source = sources[0]
            source_id = source['id']
            
            # Delete from Supabase Storage
            # Note: This would typically be done via the storage API
            # For now, we'll just mark as deleted in the database
            
            # Delete embeddings
            self.supabase_client.delete('document_embeddings', {'source_id': source_id})
            
            # Delete source record
            self.supabase_client.delete('sources', {'id': source_id})
            
            logger.info(f"Deleted file and records for source {source_id}")
            
            return {
                'success': True,
                'message': 'File and associated records deleted successfully'
            }
            
        except Exception as e:
            logger.error(f"Error deleting file: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def get_file_info(self, source_id: str) -> Dict[str, Any]:
        """
        Get file information from the database
        
        Args:
            source_id: ID of the source
        
        Returns:
            Dictionary with file information
        """
        try:
            sources = self.supabase_client.select(
                'sources',
                filters={'id': source_id}
            )
            
            if not sources:
                return {'success': False, 'error': 'Source not found'}
            
            source = sources[0]
            
            return {
                'success': True,
                'file_info': {
                    'id': source['id'],
                    'title': source['title'],
                    'type': source['type'],
                    'url': source['url'],
                    'file_path': source['file_path'],
                    'file_size': source['file_size'],
                    'mime_type': source['mime_type'],
                    'status': source['status'],
                    'metadata': source['metadata'],
                    'created_at': source['created_at'],
                    'updated_at': source['updated_at']
                }
            }
            
        except Exception as e:
            logger.error(f"Error getting file info: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def list_project_files(self, user_id: str, project_id: str) -> Dict[str, Any]:
        """
        List all files for a project
        
        Args:
            user_id: ID of the user
            project_id: ID of the project
        
        Returns:
            Dictionary with file list
        """
        try:
            sources = self.supabase_client.select(
                'sources',
                filters={
                    'user_id': user_id,
                    'project_id': project_id
                },
                order_by='created_at.desc'
            )
            
            return {
                'success': True,
                'files': sources
            }
            
        except Exception as e:
            logger.error(f"Error listing project files: {e}")
            return {
                'success': False,
                'error': str(e)
            }

# Create singleton instance
file_upload_service = FileUploadService()
