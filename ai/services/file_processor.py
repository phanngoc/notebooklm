import os
import sys
import uuid
import logging
import requests
from typing import Dict, Any, Optional
from urllib.parse import urlparse
import tempfile
import mimetypes
from supabase import create_client, Client
from docling.document_converter import DocumentConverter
from urllib.parse import urlparse

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FileProcessor:
    """
    Service for processing different file types and converting them to markdown
    """
    
    def __init__(self):
        """Initialize the file processor"""
        logger.info("Initializing FileProcessor service...")
        self.supported_types: Dict[str, Any] = {
            'application/pdf': self._convert_to_markdown,
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': self._convert_to_markdown,
            'application/msword': self._convert_to_markdown,
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': self._convert_to_markdown,
            'application/vnd.openxmlformats-officedocument.presentationml.presentation': self._convert_to_markdown,
            'text/plain': self._convert_to_markdown,
            'text/markdown': self._convert_to_markdown,
            'text/html': self._convert_to_markdown,  # This will handle website content
            'application/json': self._convert_to_markdown,
            'text/csv': self._convert_to_markdown,
            'application/rtf': self._convert_to_markdown
        }
        logger.info(f"FileProcessor initialized with support for: {list(self.supported_types.keys())}")
        self.supabase = self._init_supabase_client()
        self.document_converter = DocumentConverter()
        logger.info("FileProcessor service initialized successfully")
    
    def _init_supabase_client(self) -> Client:
        """Initialize Supabase client"""
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SECRET_KEY")
        print("Initializing Supabase client with URL:", url, "and key:", key)
        if not url:
            raise ValueError("SUPABASE_URL environment variable is required")
        if not key:
            raise ValueError("SUPABASE_SECRET_KEY environment variable is required")

        try:
            client = create_client(supabase_url=url, supabase_key=key)
            logger.info("Supabase client initialized successfully")
            return client
        except Exception as e:
            logger.error(f"Failed to initialize Supabase client: {str(e)}")
            raise
    

    def _download_from_supabase(self, project_id: str, file_url: str) -> bytes:
        """
        Download file from Supabase storage
        
        Args:
            project_id: Project ID for organizing files
            file_url: URL to the file in Supabase storage
            
        Returns:
            File content as bytes
        """
        try:
            parsed_url = urlparse(file_url)
            if not parsed_url.path.startswith('/storage/v1/object/public/'):
                raise ValueError("Invalid Supabase file URL format")
            
            # Extract the file path from the URL
            file_path = parsed_url.path.replace('/storage/v1/object/public/', '')
            
            # Remove bucket name from path if it exists (assuming 'filedoc' is the bucket)
            if file_path.startswith('filedoc/'):
                file_path = file_path.replace('filedoc/', '', 1)
            
            # Download file from Supabase storage
            response = self.supabase.storage.from_("filedoc").download(file_path)
            
            logger.info(f"Downloaded file from Supabase: {file_url} (size: {len(response)} bytes)")
            return response
            
        except Exception as e:
            logger.error(f"Error downloading file from Supabase: {e}")
            raise
    
    def _convert_to_markdown(self, file_content: bytes, file_name: str, project_id: str, 
                           original_mime_type: Optional[str] = None) -> str:
        """
        Convert document content to markdown using docling (similar to Google Drive processor)
        
        Args:
            file_content: Raw file content as bytes
            file_name: Original filename
            project_id: Project ID for organizing files
            original_mime_type: Original MIME type of the file
            
        Returns:
            Markdown content as string
        """
        try:
            # Determine file extension based on MIME type
            file_extension = self._get_file_extension(original_mime_type, file_name)
            
            # Create temporary directory for processing
            temp_dir = os.path.join('./uploads/', project_id, 'file_processor')
            os.makedirs(temp_dir, exist_ok=True)
            
            # Generate unique filename
            clean_filename = f"{os.path.splitext(file_name)[0]}{file_extension}"
            temp_file_path = os.path.join(temp_dir, f"{uuid.uuid4()}_{clean_filename}")
            
            # Write file to temporary location
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
                    try:
                        os.remove(temp_file_path)
                    except:
                        pass  # Ignore cleanup errors
        
        except Exception as e:
            logger.error(f"Error converting {file_name} to markdown using docling: {e}")
            return ""
    
    def _get_file_extension(self, mime_type: Optional[str], file_name: str) -> str:
        """Get appropriate file extension based on MIME type"""
        if not mime_type:
            return os.path.splitext(file_name)[1] or '.txt'
        
        mime_to_ext = {
            'application/pdf': '.pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
            'application/msword': '.doc',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
            'text/plain': '.txt',
            'text/markdown': '.md',
            'text/html': '.html',
            'application/json': '.json',
            'text/csv': '.csv',
            'application/rtf': '.rtf'
        }
        
        return mime_to_ext.get(mime_type, os.path.splitext(file_name)[1] or '.txt')

    def process_file_from_url(self, file_url: str, file_name: str, mime_type: str, project_id: str) -> Dict[str, Any]:
        """
        Process file from Supabase URL or website URL through the complete pipeline:
        1. Download from Supabase storage or website
        2. Save to local uploads directory
        3. Convert to markdown
        4. Return processed data
        
        Args:
            file_url: URL to the file in Supabase storage or website URL
            file_name: Original filename or website title
            mime_type: MIME type of the file
            project_id: Project ID for organizing files
            
        Returns:
            Dictionary with processing results
        """
        try:
            logger.info(f"Processing file from URL: {file_url}")
            logger.info(f"File: {file_name}, MIME type: {mime_type}, Project: {project_id}")
            
            # Check if it's a website URL (not a Supabase storage URL)
            if file_url.startswith(('http://', 'https://')) and 'supabase' not in file_url and '/storage/v1/object/public/' not in file_url:
                # This is a website URL
                logger.info("Detected website URL, using website processing...")
                return self.process_website_from_url(file_url, file_name, project_id)
            
            # Check if file type is supported for regular file processing
            if mime_type not in self.supported_types:
                return {
                    'success': False,
                    'error': f"Unsupported file type: {mime_type}",
                    'markdown_content': '',
                    'content_length': 0,
                    'file_path': ''
                }
            
            # Step 1: Download file from Supabase
            logger.info("Step 1: Downloading file from Supabase...")
            file_content = self._download_from_supabase(project_id, file_url)
            
            # Step 2: Save file to local uploads directory
            logger.info("Step 2: Saving file to local directory...")
            uploads_dir = os.path.join('./uploads', project_id)
            os.makedirs(uploads_dir, exist_ok=True)
            
            # Clean filename and create local path
            clean_filename = file_name.replace('/', '_').replace('\\', '_')
            local_file_path = os.path.join(uploads_dir, clean_filename)
            
            # Write file to local storage
            with open(local_file_path, 'wb') as f:
                f.write(file_content)
            
            logger.info(f"File saved to: {local_file_path}")
            
            # Step 3: Convert to markdown
            logger.info("Step 3: Converting file to markdown...")
            markdown_content = self._convert_to_markdown(
                file_content=file_content,
                file_name=file_name,
                project_id=project_id,
                original_mime_type=mime_type
            )
            
            if not markdown_content:
                return {
                    'success': False,
                    'error': 'Failed to convert file to markdown',
                    'markdown_content': '',
                    'content_length': 0,
                    'file_path': local_file_path
                }
            
            # Return success result
            logger.info(f"File processing completed successfully. Content length: {len(markdown_content)} characters")
            return {
                'success': True,
                'error': '',
                'markdown_content': markdown_content,
                'content_length': len(markdown_content),
                'file_path': local_file_path
            }
            
        except Exception as e:
            logger.error(f"Error processing file from URL: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'markdown_content': '',
                'content_length': 0,
                'file_path': ''
            }
    
    def _download_from_website(self, url: str) -> bytes:
        """
        Download content from a website URL
        
        Args:
            url: Website URL to download content from
            
        Returns:
            Website content as bytes
        """
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
            
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()  # Raise an exception for bad status codes
            
            logger.info(f"Downloaded website content from: {url} (size: {len(response.content)} bytes)")
            return response.content
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error downloading website content from {url}: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error downloading website: {e}")
            raise

    def process_website_from_url(self, url: str, file_name: str, project_id: str) -> Dict[str, Any]:
        """
        Process website from URL through the complete pipeline:
        1. Download website content
        2. Save to local uploads directory
        3. Convert to markdown using docling
        4. Return processed data
        
        Args:
            url: Website URL to process
            file_name: Display name for the website
            project_id: Project ID for organizing files
            
        Returns:
            Dictionary with processing results
        """
        try:
            logger.info(f"Processing website from URL: {url}")
            logger.info(f"Name: {file_name}, Project: {project_id}")
            
            # Step 1: Download website content
            logger.info("Step 1: Downloading website content...")
            
            # Step 3: Convert to markdown using docling
            logger.info("Step 3: Converting website content to markdown...")
            converter = DocumentConverter()
            result = converter.convert(source=url)
            markdown_content = result.document.export_to_markdown()
            print(f"Markdown content length: {len(markdown_content)} characters", markdown_content)
            
            if not markdown_content:
                return {
                    'success': False,
                    'error': 'Failed to convert website content to markdown',
                    'markdown_content': '',
                    'content_length': 0,
                    'file_path': url
                }
            
            # Return success result
            logger.info(f"Website processing completed successfully. Content length: {len(markdown_content)} characters")
            return {
                'success': True,
                'error': '',
                'markdown_content': markdown_content,
                'content_length': len(markdown_content),
                'file_path': url
            }
            
        except Exception as e:
            logger.error(f"Error processing website from URL: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'markdown_content': '',
                'content_length': 0,
                'file_path': ''
            }


# Global instance
file_processor = FileProcessor()

