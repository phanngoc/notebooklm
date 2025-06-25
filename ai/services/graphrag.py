import os
import sys
import json
import logging
import asyncio
from typing import List, Dict, Any, Optional
from datetime import datetime
from fast_graphrag import GraphRAG

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class GraphRAGService:
    """
    GraphRAG implementation using fast-graphrag library
    """
    
    def __init__(self, working_dir: str = "./data"):
        """Initialize the GraphRAG service"""
        logger.info("Initializing GraphRAG service with fast-graphrag...")
        
        self.working_dir = working_dir
        # Ensure working directory exists
        os.makedirs(working_dir, exist_ok=True)
        
        # Default domain and configuration for financial/business documents
        self.domain = """Analyze documents to identify key information that affects business value, growth potential, and strategic insights. 
        Focus on entities like companies, people, financial metrics, market trends, technologies, strategies, and their relationships."""
        
        self.example_queries = [
            "What are the key factors driving business value?",
            "How do market trends affect competitive position?",
            "What strategic initiatives are mentioned in the documents?",
            "What are the main risk factors discussed?",
            "What financial metrics or performance indicators are highlighted?",
            "Who are the key people or organizations mentioned?",
            "What technologies or innovations are discussed?"
        ]
        
        self.entity_types = [
            "Company", "Person", "Financial_Metric", "Market_Trend", 
            "Technology", "Strategy", "Risk_Factor", "Product", 
            "Location", "Industry", "Partnership", "Investment"
        ]
        
        # Store GraphRAG instances per user/collection
        self.graphrag_instances: Dict[str, GraphRAG] = {}
        
        logger.info("GraphRAG service initialized successfully")
    
    def _get_graph_key(self, user_id: str, project_id: str = "default") -> str:
        """Generate a unique key for user's graph"""
        return f"{user_id}_{project_id}"

    def _get_or_create_graphrag(self, user_id: str, project_id: str = "default") -> GraphRAG:
        """Get or create a GraphRAG instance for the user/project"""
        graph_key = self._get_graph_key(user_id, project_id)

        if graph_key not in self.graphrag_instances:
            # Create user-specific working directory
            user_working_dir = os.path.join(self.working_dir, graph_key)
            os.makedirs(user_working_dir, exist_ok=True)
            
            # Create new GraphRAG instance
            self.graphrag_instances[graph_key] = GraphRAG(
                working_dir=user_working_dir,
                domain=self.domain,
                example_queries="\n".join(self.example_queries),
                entity_types=self.entity_types
            )
            logger.info(f"Created new GraphRAG instance for {graph_key}")
        
        return self.graphrag_instances[graph_key]

    def insert(self, content: str, user_id: str, project_id: str = "default") -> Dict[str, Any]:
        """Insert a single document into the knowledge graph"""
        try:
            logger.info(f"Inserting document for user {user_id} in project {project_id}")

            grag = self._get_or_create_graphrag(user_id, project_id)

            # Insert content into GraphRAG - handle async/sync properly
            try:
                # Check if we have an async version
                if hasattr(grag, 'ainsert'):
                    # Use async version with proper event loop handling
                    try:
                        loop = asyncio.get_event_loop()
                        if loop.is_running():
                            # Already in async context, use thread executor
                            import concurrent.futures
                            with concurrent.futures.ThreadPoolExecutor() as executor:
                                future = executor.submit(self._run_async_insert, grag, content)
                                future.result()
                        else:
                            # No running loop, safe to use asyncio.run
                            asyncio.run(grag.ainsert(content))
                    except RuntimeError as e:
                        if "This event loop is already running" in str(e):
                            # Fallback to thread executor
                            import concurrent.futures
                            with concurrent.futures.ThreadPoolExecutor() as executor:
                                future = executor.submit(self._run_async_insert, grag, content)
                                future.result()
                        else:
                            raise
                elif hasattr(grag, 'async_insert'):
                    # Alternative async method name
                    try:
                        loop = asyncio.get_event_loop()
                        if loop.is_running():
                            import concurrent.futures
                            with concurrent.futures.ThreadPoolExecutor() as executor:
                                future = executor.submit(asyncio.run, grag.async_insert(content))
                                future.result()
                        else:
                            asyncio.run(grag.async_insert(content))
                    except RuntimeError as e:
                        if "This event loop is already running" in str(e):
                            import concurrent.futures
                            with concurrent.futures.ThreadPoolExecutor() as executor:
                                future = executor.submit(self._run_async_insert_alt, grag, content)
                                future.result()
                        else:
                            raise
                else:
                    # Fallback to sync version
                    grag.insert(content)
            except Exception as inner_e:
                logger.warning(f"Async insert failed: {inner_e}, trying sync version")
                # Fallback to sync version
                grag.insert(content)
            
            return {
                'success': True,
                'document_id': '',  # fast-graphrag doesn't expose this directly
                'entities_extracted': -1,  # fast-graphrag doesn't expose this directly
                'relationships_extracted': -1  # fast-graphrag doesn't expose this directly
            }
            
        except Exception as e:
            logger.error(f"Error inserting document: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'document_id': '',
                'entities_extracted': 0,
                'relationships_extracted': 0
            }
    
    def _run_async_insert(self, grag, content: str):
        """Helper method to run async insert in a new event loop"""
        asyncio.run(grag.ainsert(content))
        
    def _run_async_insert_alt(self, grag, content: str):
        """Helper method to run async insert (alternative method) in a new event loop"""
        asyncio.run(grag.async_insert(content))

    def query_graph(self, query: str, user_id: str, project_id: str = "default") -> Dict[str, Any]:
        """Query the knowledge graph for relevant information"""
        try:
            print(f"Querying graph for user {user_id}: {query}")

            graph = self._get_or_create_graphrag(user_id, project_id)
            result = graph.query(query)

            return {
                'response': result.response if hasattr(result, 'response') else str(result),
                'entities': [],  # fast-graphrag doesn't expose entities directly
                'relationships': [],  # fast-graphrag doesn't expose relationships directly
                'context': {},
                'success': True,
                'error': ""
            }
            
        except Exception as e:
            logger.error(f"Error querying graph: {str(e)}")
            print(f"Error querying graph: {str(e)}")
            return {
                'response': "",
                'entities': [],
                'relationships': [],
                'success': False,
                'error': str(e)
            }
    
    def _run_async_query(self, grag, query: str):
        """Helper method to run async query in a new event loop"""
        return asyncio.run(grag.aquery(query))
        
    def _run_async_query_alt(self, grag, query: str):
        """Helper method to run async query (alternative method) in a new event loop"""
        return asyncio.run(grag.async_query(query))
