import os
import json
import logging
from typing import Optional, Dict, Any
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

class DatabaseService:
    """
    Database service for Python AI backend to access user settings directly using Supabase
    """
    
    def __init__(self):
        """Initialize Supabase client"""
        self.supabase = self._init_supabase_client()
        logger.info("DatabaseService initialized with Supabase client")
    
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
    
    def get_user_setting(self, user_id: str, key: str) -> Optional[Dict[str, Any]]:
        """Get a specific user setting"""
        try:
            response = self.supabase.table('settings').select('*').eq('user_id', user_id).eq('key', key).execute()
            
            if response.data and len(response.data) > 0:
                return response.data[0]
            
            return None
            
        except Exception as e:
            logger.error(f"Error fetching user setting: {str(e)}")
            return None
    
    def get_google_drive_credentials(self, user_id: str) -> Optional[str]:
        """Get Google Drive credentials for a user"""
        try:
            setting = self.get_user_setting(user_id, 'google_drive_credentials')
            if setting and setting['value']:
                return setting['value']
            return None
            
        except Exception as e:
            logger.error(f"Error fetching Google Drive credentials: {str(e)}")
            return None
    
    def save_document_to_db(self, user_id: str, project_id: str, title: str, 
                           content: str, doc_type: str = 'google-doc', 
                           url: Optional[str] = None) -> Optional[str]:
        """Save a document to the sources table and return source ID"""
        try:
            # Prepare document data
            document_data = {
                'user_id': user_id,
                'project_id': project_id,
                'title': title,
                'type': doc_type,
                'content': content,
                'url': url
            }
            
            response = self.supabase.table('sources').insert(document_data).execute()
            
            if response.data and len(response.data) > 0:
                source_id = response.data[0]['id']
                logger.info(f"Document saved to database with ID: {source_id}")
                return str(source_id)
            
            return None
            
        except Exception as e:
            logger.error(f"Error saving document to database: {str(e)}")
            return None
    
    def get_project(self, project_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        """Get project configuration including GraphRAG settings"""
        try:
            response = self.supabase.table('projects').select('*').eq('id', project_id).eq('user_id', user_id).execute()
            
            if response.data and len(response.data) > 0:
                return {"data": response.data[0]}
            
            return None
            
        except Exception as e:
            logger.error(f"Error fetching project: {str(e)}")
            return None

    def close(self):
        """Close Supabase client connection"""
        # Supabase client doesn't need explicit closing like psycopg2
        logger.info("DatabaseService cleanup completed")

# Singleton instance
_db_service = None

def get_db_service() -> DatabaseService:
    """Get singleton database service instance"""
    global _db_service
    if _db_service is None:
        _db_service = DatabaseService()
    return _db_service
