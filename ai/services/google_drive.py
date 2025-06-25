import os
import io
import uuid
import json
import tempfile
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
from .database import get_db_service

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
        self.db_service = get_db_service()
        
        # Processing tasks storage (in production, use Redis or database)
        self.processing_tasks: Dict[str, Dict[str, Any]] = {}
        
        # Thread pool for async processing
        self.executor = ThreadPoolExecutor(max_workers=3)
        
        logger.info("GoogleDriveProcessor initialized")
    
    def _get_user_credentials(self, user_id: str) -> Optional[str]:
        """Get user's Google Drive credentials from database"""
        try:
            credentials = self.db_service.get_google_drive_credentials(user_id)
            if credentials:
                logger.info(f"Found Google Drive credentials for user {user_id}")
                return credentials
            
            logger.warning(f"No Google Drive credentials found for user {user_id}")
            return None
            
        except Exception as e:
            logger.error(f"Error fetching user credentials from database: {str(e)}")
            return None
    
    def _get_drive_service(self, user_id: Optional[str] = None):
        """Create and return Google Drive service"""
        credentials_json = None
        
        # Try to get user-specific credentials first
        if user_id:
            credentials_json = self._get_user_credentials(user_id)
        
        # Fall back to file-based credentials
        if not credentials_json and self.credentials_path and os.path.exists(self.credentials_path):
            credentials = Credentials.from_service_account_file(
                self.credentials_path,
                scopes=['https://www.googleapis.com/auth/drive.readonly']
            )
            return build('drive', 'v3', credentials=credentials)
        
        # Try JSON credentials from database
        if credentials_json:
            try:
                # Assume it's JSON string from database
                cred_data = json.loads(credentials_json)
                
                credentials = Credentials.from_service_account_info(
                    cred_data,
                    scopes=['https://www.googleapis.com/auth/drive.readonly']
                )
                return build('drive', 'v3', credentials=credentials)
                
            except Exception as e:
                logger.error(f"Error creating credentials from JSON: {str(e)}")
        
        raise Exception("Google Drive credentials not found. Please configure credentials in your profile settings.")
    
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
            file_types = ['docx', 'google-docs']
        
        # Build query for file types
        type_queries = []
        for file_type in file_types:
            if file_type.lower() == 'docx':
                type_queries.append("mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document'")
            elif file_type.lower() == 'pdf':
                type_queries.append("mimeType='application/pdf'")
            elif file_type.lower() == 'txt':
                type_queries.append("mimeType='text/plain'")
            elif file_type.lower() == 'google-docs':
                type_queries.append("mimeType='application/vnd.google-apps.document'")
            elif file_type.lower() == 'google-sheets':
                type_queries.append("mimeType='application/vnd.google-apps.spreadsheet'")
            elif file_type.lower() == 'google-slides':
                type_queries.append("mimeType='application/vnd.google-apps.presentation'")
        
        # If no specific file types requested, search for common document types
        if not type_queries:
            type_queries = [
                "mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document'",
                "mimeType='application/pdf'",
                "mimeType='text/plain'",
                "mimeType='application/vnd.google-apps.document'",
                "mimeType='application/vnd.google-apps.spreadsheet'",
                "mimeType='application/vnd.google-apps.presentation'"
            ]
        
        # Combine folder query with fijle type queries
        type_query = " or ".join(type_queries)
        query = f"'{folder_id}' in parents"
        
        logger.info(f"Searching with query: {query}")
        
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
                
                current_files = results.get('files', [])
                print("current_files", current_files)
                files.extend(current_files)
                page_token = results.get('nextPageToken')
                
                logger.info(f"Found {len(current_files)} files in this batch")
                
                if not page_token:
                    break
                    
            except Exception as e:
                logger.error(f"Error listing files: {str(e)}")
                break
        
        logger.info(f"Found {len(files)} total files in folder {folder_id}")
        return files
    
    def _download_file(self, service, file_id: str, mime_type: str = None) -> bytes:
        """Download file content from Google Drive"""
        try:
            # First, try to get the file metadata to check the MIME type
            if not mime_type:
                file_metadata = service.files().get(fileId=file_id, fields='mimeType').execute()
                mime_type = file_metadata.get('mimeType')
            
            # Check if it's a Google Workspace document that needs to be exported
            google_workspace_mimes = {
                'application/vnd.google-apps.document': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  # Google Docs -> DOCX
                'application/vnd.google-apps.spreadsheet': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  # Google Sheets -> XLSX
                'application/vnd.google-apps.presentation': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',  # Google Slides -> PPTX
                'application/vnd.google-apps.drawing': 'application/pdf',  # Google Drawings -> PDF
            }
            
            if mime_type in google_workspace_mimes:
                # Export Google Workspace document
                export_mime_type = google_workspace_mimes[mime_type]
                logger.info(f"Exporting Google Workspace file {file_id} from {mime_type} to {export_mime_type}")
                request = service.files().export_media(fileId=file_id, mimeType=export_mime_type)
            else:
                # Download binary file directly
                logger.info(f"Downloading binary file {file_id} with MIME type {mime_type}")
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
    
    def _convert_to_markdown(self, file_content: bytes, file_name: str, original_mime_type: str = None) -> str:
        """Convert document content to markdown using docling"""
        try:
            # Determine file extension based on original MIME type
            if original_mime_type == 'application/vnd.google-apps.document':
                # Google Docs exported as DOCX
                file_extension = '.docx'
            elif original_mime_type == 'application/vnd.google-apps.spreadsheet':
                # Google Sheets exported as XLSX
                file_extension = '.xlsx'
            elif original_mime_type == 'application/vnd.google-apps.presentation':
                # Google Slides exported as PPTX
                file_extension = '.pptx'
            elif original_mime_type == 'application/vnd.google-apps.drawing':
                # Google Drawings exported as PDF
                file_extension = '.pdf'
            else:
                # Use original file extension or guess from content
                file_extension = os.path.splitext(file_name)[1] or '.docx'
            
            # Generate unique temp filename
            temp_file_path = f"/tmp/{uuid.uuid4()}_{os.path.splitext(file_name)[0]}{file_extension}"
            
            with open(temp_file_path, 'wb') as temp_file:
                temp_file.write(file_content)
            
            try:
                # Convert document using docling
                logger.info(f"Converting {file_name} using docling with extension {file_extension}")
                result = self.document_converter.convert(temp_file_path)
                
                # Extract markdown content
                markdown_content = result.document.export_to_markdown()
                
                # Check if conversion was successful
                if not markdown_content or len(markdown_content.strip()) == 0:
                    raise ValueError("Document conversion resulted in empty content")
                
                logger.info(f"Successfully converted {file_name} to markdown ({len(markdown_content)} characters)")
                return markdown_content
                
            finally:
                # Clean up temporary file
                if os.path.exists(temp_file_path):
                    os.remove(temp_file_path)
                    
        except Exception as e:
            logger.error(f"Error converting {file_name} to markdown: {str(e)}")
            
            # For unsupported files, try to extract text as fallback
            if original_mime_type == 'application/vnd.google-apps.document':
                logger.info(f"Fallback: treating {file_name} as plain text")
                try:
                    # Try to decode as text (this might work for some exported formats)
                    text_content = file_content.decode('utf-8', errors='ignore')
                    if text_content.strip():
                        return f"# {file_name}\n\n{text_content}"
                except:
                    pass
            
            # If all else fails, return a placeholder
            return f"# {file_name}\n\n*Error: Could not convert this document to markdown. Original error: {str(e)}*"
    
    def _save_to_database(self, user_id: str, project_id: str, file_info: Dict[str, Any], 
                         markdown_content: str) -> str:
        """Save document to database and return source ID"""
        try:
            # Save document directly to database
            source_id = self.db_service.save_document_to_db(
                user_id=user_id,
                project_id=project_id,
                title=file_info['name'],
                content=markdown_content,
                doc_type=file_info.get('mimeType', 'google-doc'),
                url=f"https://drive.google.com/file/d/{file_info['id']}/view"
            )
            
            if source_id:
                logger.info(f"Document {file_info['name']} saved with source ID: {source_id}")
                return source_id
            else:
                logger.error(f"Failed to save document {file_info['name']} to database")
                return str(uuid.uuid4())  # Fallback ID
                
        except Exception as e:
            logger.error(f"Error saving document to database: {str(e)}")
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
            logger.info(f"Downloading file: {file_info['name']} (MIME: {file_info.get('mimeType', 'unknown')})")
            file_content = self._download_file(service, file_info['id'], file_info.get('mimeType'))
            
            # Convert to markdown
            logger.info(f"Converting file to markdown: {file_info['name']}")
            markdown_content = self._convert_to_markdown(
                file_content, 
                file_info['name'], 
                file_info.get('mimeType')
            )
            result['markdown_content'] = markdown_content
            
            # Check if we got valid content
            if not markdown_content or len(markdown_content.strip()) < 10:
                result['error_message'] = "Document conversion resulted in minimal or no content"
                return result
            
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
            service = self._get_drive_service(user_id)
            
            # List files
            self.processing_tasks[task_id]['message'] = 'Scanning folder for files...'
            files = self._list_folder_files(service, folder_id, file_types)
            print("files", files, len(files))
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
