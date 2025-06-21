import os
import psycopg2
import json
import logging
from typing import Optional, Dict, Any
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

class DatabaseService:
    """
    Database service for Python AI backend to access user settings directly
    """
    
    def __init__(self):
        """Initialize database connection"""
        self.connection_string = self._get_connection_string()
        self.connection = None
        logger.info("DatabaseService initialized")
    
    def _get_connection_string(self) -> str:
        """Get database connection string from environment"""
        # Try different environment variable names
        database_url = (
            os.getenv('DATABASE_URL') or 
            os.getenv('SUPABASE_DB_URL') or 
            os.getenv('POSTGRES_URL')
        )
        
        if not database_url:
            # Construct from individual components
            host = os.getenv('DB_HOST', 'localhost')
            port = os.getenv('DB_PORT', '5432')
            database = os.getenv('DB_NAME', 'postgres')
            user = os.getenv('DB_USER', 'postgres')
            password = os.getenv('DB_PASSWORD', '')
            
            database_url = f"postgresql://{user}:{password}@{host}:{port}/{database}"
        
        return database_url
    
    def _get_connection(self):
        """Get database connection, create if not exists"""
        if self.connection is None or self.connection.closed:
            try:
                self.connection = psycopg2.connect(self.connection_string)
                logger.info("Database connection established")
            except Exception as e:
                logger.error(f"Failed to connect to database: {str(e)}")
                raise
        
        return self.connection
    
    def get_user_setting(self, user_id: str, key: str) -> Optional[Dict[str, Any]]:
        """Get a specific user setting"""
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            
            query = """
                SELECT id, user_id, key, value, description, is_encrypted, created_at, updated_at
                FROM settings 
                WHERE user_id = %s AND key = %s
            """
            
            cursor.execute(query, (user_id, key))
            result = cursor.fetchone()
            
            if result:
                return {
                    'id': result[0],
                    'user_id': result[1],
                    'key': result[2],
                    'value': result[3],
                    'description': result[4],
                    'is_encrypted': result[5],
                    'created_at': result[6],
                    'updated_at': result[7]
                }
            
            return None
            
        except Exception as e:
            logger.error(f"Error fetching user setting: {str(e)}")
            return None
        finally:
            if cursor:
                cursor.close()
    
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
                           content: str, doc_type: str = 'google-drive', 
                           url: Optional[str] = None) -> Optional[str]:
        """Save a document to the sources table and return source ID"""
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            
            # Insert into sources table
            query = """
                INSERT INTO sources (user_id, project_id, title, type, content, url, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, NOW(), NOW())
                RETURNING id
            """
            
            cursor.execute(query, (user_id, project_id, title, doc_type, content, url))
            result = cursor.fetchone()
            
            if result:
                source_id = result[0]
                conn.commit()
                logger.info(f"Document saved to database with ID: {source_id}")
                return str(source_id)
            
            return None
            
        except Exception as e:
            logger.error(f"Error saving document to database: {str(e)}")
            if conn:
                conn.rollback()
            return None
        finally:
            if cursor:
                cursor.close()
    
    def close(self):
        """Close database connection"""
        if self.connection and not self.connection.closed:
            self.connection.close()
            logger.info("Database connection closed")

# Singleton instance
_db_service = None

def get_db_service() -> DatabaseService:
    """Get singleton database service instance"""
    global _db_service
    if _db_service is None:
        _db_service = DatabaseService()
    return _db_service
