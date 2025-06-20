import os
import io
import uuid
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
import asyncio
from concurrent.futures import ThreadPoolExecutor

from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from docling.document_converter import DocumentConverter
from docling.datamodel.base_models import InputFormat

from .graphrag import GraphRAGService

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class GoogleDriveProcessor:
    """
    Service for processing Google Drive folders - scan, convert, and index documents
    """
    
    def __init__(self, credentials_path: Optional[str] = None):
        """Initialize the Google Drive processor"""
        self.credentials_path = credentials_path or os.getenv("GOOGLE_CREDENTIALS_PATH")
        self.graphrag_service = GraphRAGService()
        self.document_converter = DocumentConverter()
        
        # Processing tasks storage (in production, use Redis or database)
        self.processing_tasks: Dict[str, Dict[str, Any]] = {}
        
        # Thread pool for async processing
        self.executor = ThreadPoolExecutor(max_workers=3)
        
        logger.info("GoogleDriveProcessor initialized")
    
    def _get_drive_service(self):
        """Create and return Google Drive service"""
        if not self.credentials_path or not os.path.exists(self.credentials_path):
            raise Exception("Google Drive credentials not found. Please set GOOGLE_CREDENTIALS_PATH")
        
        credentials = Credentials.from_service_account_file(
            self.credentials_path,
            scopes=['https://www.googleapis.com/auth/drive.readonly']
        )
        
        return build('drive', 'v3', credentials=credentials)
    
    def _extract_folder_id(self, folder_url: str) -> str:
        """Extract folder ID from Google Drive URL"""
        # Handle different URL formats:
        # https://drive.google.com/drive/folders/FOLDER_ID
        # https://drive.google.com/drive/folders/FOLDER_ID?usp=sharing
        
        if '/folders/' in folder_url:
            folder_id = folder_url.split('/folders/')[1].split('?')[0]
            return folder_id
        else:
            raise ValueError("Invalid Google Drive folder URL format")
    
    def _list_folder_files(self, service, folder_id: str, file_types: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """List all files in the folder matching the specified types"""
        if file_types is None:
            file_types = ['docx']
        
        # Build query for file types
        type_queries = []
        for file_type in file_types:
            if file_type.lower() == 'docx':
                type_queries.append("mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document'")
            elif file_type.lower() == 'pdf':
                type_queries.append("mimeType='application/pdf'")
            elif file_type.lower() == 'txt':
                type_queries.append("mimeType='text/plain'")
        
        query = f"'{folder_id}' in parents and ({' or '.join(type_queries)}) and trashed=false"
        
        files = []
        page_token = None
        
        while True:
            try:
                results = service.files().list(
                    q=query,
                    pageSize=100,
                    fields="nextPageToken, files(id, name, size, mimeType, createdTime)",
                    pageToken=page_token
                ).execute()
                
                files.extend(results.get('files', []))
                page_token = results.get('nextPageToken')
                
                if not page_token:
                    break
                    
            except Exception as e:
                logger.error(f"Error listing files: {str(e)}")
                break
        
        logger.info(f"Found {len(files)} files in folder {folder_id}")
        return files
    
    def _download_file(self, service, file_id: str) -> bytes:
        """Download file content from Google Drive"""
        try:
            request = service.files().get_media(fileId=file_id)
            file_content = io.BytesIO()
            downloader = MediaIoBaseDownload(file_content, request)
            
            done = False
            while done is False:
                status, done = downloader.next_chunk()
            
            return file_content.getvalue()
            
        except Exception as e:
            logger.error(f"Error downloading file {file_id}: {str(e)}")
            raise
    
    def _convert_to_markdown(self, file_content: bytes, file_name: str) -> str:
        """Convert document content to markdown using docling"""
        try:
            # Save content to temporary file
            temp_file_path = f"/tmp/{uuid.uuid4()}_{file_name}"
            
            with open(temp_file_path, 'wb') as temp_file:
                temp_file.write(file_content)
            
            try:
                # Convert document using docling
                result = self.document_converter.convert(temp_file_path)
                
                # Extract markdown content
                markdown_content = result.document.export_to_markdown()
                
                return markdown_content
                
            finally:
                # Clean up temporary file
                if os.path.exists(temp_file_path):
                    os.remove(temp_file_path)
                    
        except Exception as e:
            logger.error(f"Error converting {file_name} to markdown: {str(e)}")
            raise
    
    def _save_to_database(self, user_id: str, project_id: str, file_info: Dict[str, Any], 
                         markdown_content: str) -> str:
        """Save document to database and return source ID"""
        # TODO: Integrate with actual database service
        # This is a placeholder - in production, you would:
        # 1. Make HTTP request to Next.js API to save the document
        # 2. Or use direct database connection
        
        import requests
        import json
        
        try:
            # Make API call to save document
            api_url = os.getenv('NEXTJS_API_URL', 'http://localhost:3000') + '/api/documents/process'
            
            payload = {
                'content': markdown_content,
                'title': file_info['name'],
                'type': 'google-drive',
                'url': f"https://drive.google.com/file/d/{file_info['id']}/view",
                'projectId': project_id
            }
            
            headers = {
                'Content-Type': 'application/json',
                # TODO: Add authentication headers
            }
            
            response = requests.post(api_url, json=payload, headers=headers)
            
            if response.status_code == 200:
                result = response.json()
                return result.get('sourceId', str(uuid.uuid4()))
            else:
                logger.error(f"API error saving document: {response.status_code}")
                return str(uuid.uuid4())  # Fallback
                
        except Exception as e:
            logger.error(f"Error calling API to save document: {str(e)}")
            # Fallback: generate a mock source ID
            return str(uuid.uuid4())
    
    def _index_document(self, user_id: str, project_id: str, content: str) -> bool:
        """Index document content using GraphRAG"""
        try:
            result = self.graphrag_service.insert(content, user_id, project_id)
            return result.get('success', False)
        except Exception as e:
            logger.error(f"Error indexing document: {str(e)}")
            return False
    
    def _process_single_file(self, service, file_info: Dict[str, Any], 
                           user_id: str, project_id: str) -> Dict[str, Any]:
        """Process a single file: download, convert, save, and index"""
        result = {
            'file_name': file_info['name'],
            'file_id': file_info['id'],
            'success': False,
            'error_message': '',
            'source_id': '',
            'markdown_content': '',
            'file_size': int(file_info.get('size', 0))
        }
        
        try:
            # Download file
            logger.info(f"Downloading file: {file_info['name']}")
            file_content = self._download_file(service, file_info['id'])
            
            # Convert to markdown
            logger.info(f"Converting file to markdown: {file_info['name']}")
            markdown_content = self._convert_to_markdown(file_content, file_info['name'])
            result['markdown_content'] = markdown_content
            
            # Save to database
            logger.info(f"Saving to database: {file_info['name']}")
            source_id = self._save_to_database(user_id, project_id, file_info, markdown_content)
            result['source_id'] = source_id
            
            # Index with GraphRAG
            logger.info(f"Indexing document: {file_info['name']}")
            indexed = self._index_document(user_id, project_id, markdown_content)
            
            if indexed:
                result['success'] = True
                logger.info(f"Successfully processed file: {file_info['name']}")
            else:
                result['error_message'] = "Failed to index document"
                
        except Exception as e:
            error_msg = f"Error processing file {file_info['name']}: {str(e)}"
            logger.error(error_msg)
            result['error_message'] = str(e)
        
        return result
    
    async def process_folder_async(self, folder_url: str, user_id: str, 
                                 project_id: str, file_types: Optional[List[str]] = None) -> str:
        """Process Google Drive folder asynchronously"""
        task_id = str(uuid.uuid4())
        
        # Initialize task status
        self.processing_tasks[task_id] = {
            'status': 'processing',
            'message': 'Starting folder processing...',
            'total_files': 0,
            'processed_files': 0,
            'failed_files': 0,
            'results': [],
            'created_at': datetime.now()
        }
        
        # Start async processing
        asyncio.create_task(self._process_folder_task(
            task_id, folder_url, user_id, project_id, file_types
        ))
        
        return task_id
    
    async def _process_folder_task(self, task_id: str, folder_url: str, 
                                 user_id: str, project_id: str, file_types: Optional[List[str]] = None):
        """Background task to process the folder"""
        try:
            # Extract folder ID
            folder_id = self._extract_folder_id(folder_url)
            
            # Get Drive service
            service = self._get_drive_service()
            
            # List files
            self.processing_tasks[task_id]['message'] = 'Scanning folder for files...'
            files = self._list_folder_files(service, folder_id, file_types)
            
            self.processing_tasks[task_id].update({
                'total_files': len(files),
                'message': f'Found {len(files)} files. Processing...'
            })
            
            # Process files
            results = []
            processed_count = 0
            failed_count = 0
            
            for file_info in files:
                try:
                    result = self._process_single_file(service, file_info, user_id, project_id)
                    results.append(result)
                    
                    if result['success']:
                        processed_count += 1
                    else:
                        failed_count += 1
                    
                    # Update progress
                    self.processing_tasks[task_id].update({
                        'processed_files': processed_count,
                        'failed_files': failed_count,
                        'results': results,
                        'message': f'Processed {processed_count + failed_count}/{len(files)} files'
                    })
                    
                except Exception as e:
                    logger.error(f"Error processing file {file_info['name']}: {str(e)}")
                    failed_count += 1
            
            # Mark as completed
            self.processing_tasks[task_id].update({
                'status': 'completed',
                'message': f'Processing completed. {processed_count} files processed, {failed_count} failed.'
            })
            
        except Exception as e:
            logger.error(f"Error in folder processing task {task_id}: {str(e)}")
            self.processing_tasks[task_id].update({
                'status': 'failed',
                'message': f'Processing failed: {str(e)}'
            })
    
    def get_processing_status(self, task_id: str) -> Dict[str, Any]:
        """Get the status of a processing task"""
        if task_id not in self.processing_tasks:
            return {
                'success': False,
                'message': 'Task not found'
            }
        
        task = self.processing_tasks[task_id]
        return {
            'success': True,
            'status': task['status'],
            'message': task['message'],
            'total_files': task['total_files'],
            'processed_files': task['processed_files'],
            'failed_files': task['failed_files'],
            'results': task['results']
        }
