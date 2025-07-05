import os
import sys
import json
import logging
import asyncio
import concurrent.futures
from typing import List, Dict, Any, Optional
from datetime import datetime

from fast_graphrag import GraphRAG
from fast_graphrag._storage._gdb_neo4j import Neo4jStorage, Neo4jStorageConfig
from fast_graphrag._storage._ikv_redis import RedisIndexedKeyValueStorage
from fast_graphrag._storage._vdb_qdrant import QdrantVectorStorage, QdrantVectorStorageConfig
from fast_graphrag._types import TEntity, TRelation, TId, THash, TChunk
from .database import DatabaseService

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Log the GraphRAG module location for debugging
logger.info(f"GraphRAG module loaded from: {GraphRAG.__module__}")

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
        
        # Initialize database service
        self.db_service = DatabaseService()

        self.qdrant_config = {
            'host': os.getenv('QDRANT_HOST', 'localhost'),
            'port': int(os.getenv('QDRANT_PORT', '6333')),
            'grpc_port': int(os.getenv('QDRANT_GRPC_PORT', '6334')) if os.getenv('QDRANT_GRPC_PORT') else None,
            'prefer_grpc': os.getenv('QDRANT_PREFER_GRPC', 'false').lower() == 'true',
            'https': os.getenv('QDRANT_HTTPS', 'false').lower() == 'true',
            'collection_name': os.getenv('QDRANT_COLLECTION_NAME', 'notebookllm_embeddings'),
            'vector_size': int(os.getenv('QDRANT_VECTOR_SIZE', '1536'))  # Default for OpenAI ada-002
        }

        # Redis configuration
        self.use_redis = os.getenv('USE_REDIS', 'true').lower() == 'true'
        self.redis_config = {
            'host': os.getenv('REDIS_HOST', 'localhost'),
            'port': int(os.getenv('REDIS_PORT', '6379')),
            'db': int(os.getenv('REDIS_DB', '0')),
            'password': os.getenv('REDIS_PASSWORD'),
            'prefix': 'graphrag_chunks'
        }

        # Default domain and configuration for financial/business documents
        self.default_domain = """Analyze documents to identify key information that affects business value, growth potential, and strategic insights. 
        Focus on entities like companies, people, financial metrics, market trends, technologies, strategies, and their relationships."""
        
        self.default_example_queries = [
            "What are the key factors driving business value?",
            "How do market trends affect competitive position?",
            "What strategic initiatives are mentioned in the documents?",
            "What are the main risk factors discussed?",
            "What financial metrics or performance indicators are highlighted?",
            "Who are the key people or organizations mentioned?",
            "What technologies or innovations are discussed?"
        ]
        
        self.default_entity_types = [
            "Company", "Person", "Financial_Metric", "Market_Trend", 
            "Technology", "Strategy", "Risk_Factor", "Product", 
            "Location", "Industry", "Partnership", "Investment"
        ]
        
        # Store GraphRAG instances per user/collection
        self.graphrag_instances: Dict[str, GraphRAG] = {}
        

    
    def _get_graph_key(self, user_id: str, project_id: str = "default") -> str:
        """Generate a unique key for user's graph"""
        return f"{user_id}_{project_id}"

    def _get_project_config(self, user_id: str, project_id: str) -> Dict[str, Any]:
        """Get project-specific configuration from database"""
        try:
            project_data = self.db_service.get_project(project_id, user_id)
            
            if project_data and 'data' in project_data and project_data['data']:
                project = project_data['data']
                return {
                    'domain': project.get('domain', self.default_domain),
                    'example_queries': project.get('example_queries', self.default_example_queries),
                    'entity_types': project.get('entity_types', self.default_entity_types)
                }
            else:
                logger.warning(f"No project data found for project {project_id}, using defaults")
                return {
                    'domain': self.default_domain,
                    'example_queries': self.default_example_queries,
                    'entity_types': self.default_entity_types
                }
        except Exception as e:
            logger.error(f"Error getting project config: {e}")
            # Return default configuration if database query fails
            return {
                'domain': self.default_domain,
                'example_queries': self.default_example_queries,
                'entity_types': self.default_entity_types
            }

    def _get_or_create_graphrag(self, user_id: str, project_id: str = "default") -> GraphRAG:
        """Get or create a GraphRAG instance for the user/project"""
        graph_key = self._get_graph_key(user_id, project_id)

        if graph_key not in self.graphrag_instances:
            # Get project-specific configuration
            config = self._get_project_config(user_id, project_id)
            
            # Create user-specific working directory
            user_working_dir = os.path.join(self.working_dir, graph_key)
            os.makedirs(user_working_dir, exist_ok=True)
            
            # Create GraphRAG configuration
            graphrag_config = GraphRAG.Config()
            
            # Setup Neo4j storage for graph
            neo4j_storage_config = Neo4jStorageConfig(
                node_cls=TEntity,
                edge_cls=TRelation,
                uri="bolt://localhost:7687",
                username="neo4j",
                password="password123",
                database=f"notebookllm",
                ppr_damping=0.85
            )
            neo4j_storage = Neo4jStorage(config=neo4j_storage_config)
            graphrag_config.graph_storage = neo4j_storage

            # Setup Qdrant vector storage
            qdrant_storage_config = QdrantVectorStorageConfig(
                host=self.qdrant_config['host'],
                port=self.qdrant_config['port'],
                grpc_port=self.qdrant_config['grpc_port'],
                prefer_grpc=self.qdrant_config['prefer_grpc'],
                https=self.qdrant_config['https'],
                collection_name=f"{self.qdrant_config['collection_name']}",
                vector_size=self.qdrant_config['vector_size'],
            )
            qdrant_storage = QdrantVectorStorage(config=qdrant_storage_config)
            graphrag_config.entity_storage = qdrant_storage
            logger.info(f"Configured Qdrant vector storage for {graph_key}")

            # Conditionally setup Redis storage for chunks
            redis_storage = RedisIndexedKeyValueStorage[THash, TChunk](
                config=None,
                redis_host=self.redis_config['host'],
                redis_port=self.redis_config['port'],
                redis_db=self.redis_config['db'],
                redis_password=self.redis_config['password'],
                redis_prefix=f"{self.redis_config['prefix']}_{graph_key}"
            )

            graphrag_config.chunk_storage = redis_storage

            self.graphrag_instances[graph_key] = GraphRAG(
                working_dir=user_working_dir,
                domain=config['domain'],
                example_queries="\n".join(config['example_queries']),
                entity_types=config['entity_types'],
                config=graphrag_config
            )

        
        return self.graphrag_instances[graph_key]

    def insert(self, content: str, user_id: str, project_id: str = "default") -> Dict[str, Any]:
        """Insert a single document into the knowledge graph"""
        try:
            logger.info(f"Inserting document for user {user_id} in project {project_id}")

            grag = self._get_or_create_graphrag(user_id, project_id)

            # Insert content into GraphRAG - handle async/sync properly
            try:
                # Check if we have an async version
                if hasattr(grag, 'async_insert'):
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
            logger.error(f"Error inserting document: {e}")
            return {
                'success': False,
                'error': str(e),
                'document_id': '',
                'entities_extracted': 0,
                'relationships_extracted': 0
            }
        
    def _run_async_insert_alt(self, grag, content: str):
        """Helper method to run async insert (alternative method) in a new event loop"""
        asyncio.run(grag.async_insert(content))

    def query_graph(self, query: str, user_id: str, project_id: str = "default") -> Dict[str, Any]:
        """Query the knowledge graph for relevant information"""
        try:
            print(f"Querying graph for user {user_id}: {query}")

            graph = self._get_or_create_graphrag(user_id, project_id)
            result = graph.query(query)
            # Only take the first entity and relation if available
            first_entity = result.context.entities[0] if result.context.entities else None
            first_relation = result.context.relations[0] if result.context.relations else None
            print("Graph query result:", first_entity, first_relation, len(result.context.chunks), len(result.context.entities), len(result.context.relations))
            print("Graph query response:", result.response)
            if isinstance(result.response, str):
                response_text = result.response
            else:
                response_text = result.response.answer

            chunks = result.context.chunks
            print("Graph query chunks:", chunks, type(result), response_text)

            return {
                'response': response_text,
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

    def clear_graphrag_cache(self, user_id: str, project_id: str = None):
        """Clear cached GraphRAG instance when project configuration changes"""
        if project_id:
            graph_key = self._get_graph_key(user_id, project_id)
            if graph_key in self.graphrag_instances:
                graphrag_instance = self.graphrag_instances[graph_key]
                
                # Close Neo4j connection
                try:
                    if hasattr(graphrag_instance.config, 'graph_storage') and hasattr(graphrag_instance.config.graph_storage, 'close'):
                        graphrag_instance.config.graph_storage.close()
                except Exception as e:
                    logger.warning(f"Error closing Neo4j connection for {graph_key}: {e}")
                
                # Close Qdrant connection if using Qdrant storage
                try:
                    if (hasattr(graphrag_instance.config, 'vector_storage') and 
                        hasattr(graphrag_instance.config.vector_storage, 'close')):
                        graphrag_instance.config.vector_storage.close()
                except Exception as e:
                    logger.warning(f"Error closing Qdrant connection for {graph_key}: {e}")
                
                # Close Redis connection if using Redis storage
                try:
                    if (hasattr(graphrag_instance.config, 'chunk_storage') and 
                        hasattr(graphrag_instance.config.chunk_storage, 'close')):
                        graphrag_instance.config.chunk_storage.close()
                except Exception as e:
                    logger.warning(f"Error closing Redis connection for {graph_key}: {e}")
                finally:
                   del self.graphrag_instances[graph_key]
                   logger.info(f"Cleared GraphRAG cache for {graph_key}")
        else:
            # Clear all instances for the user
            keys_to_remove = [key for key in self.graphrag_instances.keys() if key.startswith(f"{user_id}_")]
            for key in keys_to_remove:
                graphrag_instance = self.graphrag_instances[key]
                
                # Close Neo4j connections
                try:
                    if hasattr(graphrag_instance.config, 'graph_storage') and hasattr(graphrag_instance.config.graph_storage, 'close'):
                        graphrag_instance.config.graph_storage.close()
                except Exception as e:
                    logger.warning(f"Error closing Neo4j connection for {key}: {e}")
                
                # Close Qdrant connections if using Qdrant storage
                try:
                    if (hasattr(graphrag_instance.config, 'vector_storage') and 
                        hasattr(graphrag_instance.config.vector_storage, 'close')):
                        graphrag_instance.config.vector_storage.close()
                except Exception as e:
                    logger.warning(f"Error closing Qdrant connection for {key}: {e}")
                
                # Close Redis connections if using Redis storage

                try:
                    if (hasattr(graphrag_instance.config, 'chunk_storage') and 
                        hasattr(graphrag_instance.config.chunk_storage, 'close')):
                        graphrag_instance.config.chunk_storage.close()
                except Exception as e:
                    logger.warning(f"Error closing Redis connection for {key}: {e}")
                
                del self.graphrag_instances[key]
            logger.info(f"Cleared all GraphRAG cache for user {user_id}")

    def close_all_connections(self):
        """Close all connections (Neo4j, Qdrant, and Redis) - call this when shutting down the service"""
        for graph_key, graphrag_instance in self.graphrag_instances.items():
            try:
                # Close Neo4j connection
                if hasattr(graphrag_instance.config, 'graph_storage') and hasattr(graphrag_instance.config.graph_storage, 'close'):
                    graphrag_instance.config.graph_storage.close()
                    logger.info(f"Closed Neo4j connection for {graph_key}")
                
                # Close Qdrant connection
                if (hasattr(graphrag_instance.config, 'vector_storage') and 
                    hasattr(graphrag_instance.config.vector_storage, 'close')):
                    graphrag_instance.config.vector_storage.close()
                    logger.info(f"Closed Qdrant connection for {graph_key}")
                
                # Close Redis connection
                if (hasattr(graphrag_instance.config, 'chunk_storage') and 
                    hasattr(graphrag_instance.config.chunk_storage, 'close')):
                    graphrag_instance.config.chunk_storage.close()
                    logger.info(f"Closed Redis connection for {graph_key}")
                    
            except Exception as e:
                logger.error(f"Error closing connections for {graph_key}: {e}")
        
        self.graphrag_instances.clear()
        logger.info("All connections closed")

    def get_storage_info(self) -> Dict[str, Any]:
        """Get information about current storage configuration"""
        return {
            "graph_storage": "Neo4j",
            "vector_storage": "Qdrant",
            "chunk_storage": "Redis" if self.use_redis else "Default (Pickle)",
            "qdrant_config": self.qdrant_config,
            "redis_config": self.redis_config if self.use_redis else None,
            "active_instances": len(self.graphrag_instances),
            "instance_keys": list(self.graphrag_instances.keys())
        }

    def clear_redis_data(self, user_id: str, project_id: str = "default") -> Dict[str, Any]:
        """Clear Redis data for a specific user/project"""
        if not self.use_redis:
            return {"error": "Redis storage not enabled", "success": False}
        
        try:
            graph_key = self._get_graph_key(user_id, project_id)
            if graph_key in self.graphrag_instances:
                graphrag_instance = self.graphrag_instances[graph_key]
                chunk_storage = graphrag_instance.config.chunk_storage
                
                if hasattr(chunk_storage, 'clear_namespace'):
                    chunk_storage.clear_namespace()
                    return {"success": True, "message": f"Cleared Redis data for {graph_key}"}
                else:
                    return {"error": "Storage doesn't support namespace clearing", "success": False}
            else:
                return {"error": "GraphRAG instance not found", "success": False}
        except Exception as e:
            logger.error(f"Error clearing Redis data: {e}")
            return {"error": str(e), "success": False}

    def clear_qdrant_data(self, user_id: str, project_id: str = "default") -> Dict[str, Any]:
        """Clear Qdrant data for a specific user/project"""

        try:
            graph_key = self._get_graph_key(user_id, project_id)
            if graph_key in self.graphrag_instances:
                graphrag_instance = self.graphrag_instances[graph_key]
                vector_storage = graphrag_instance.config.vector_storage
                
                if hasattr(vector_storage, 'delete_collection'):
                    asyncio.run(vector_storage.delete_collection())
                    return {"success": True, "message": f"Cleared Qdrant data for {graph_key}"}
                else:
                    return {"error": "Vector storage doesn't support collection deletion", "success": False}
            else:
                return {"error": "GraphRAG instance not found", "success": False}
        except Exception as e:
            logger.error(f"Error clearing Qdrant data: {e}")
            return {"error": str(e), "success": False}

    def get_qdrant_collection_info(self, user_id: str, project_id: str = "default") -> Dict[str, Any]:
        """Get Qdrant collection information for a specific user/project"""
        
        try:
            graph_key = self._get_graph_key(user_id, project_id)
            if graph_key in self.graphrag_instances:
                graphrag_instance = self.graphrag_instances[graph_key]
                vector_storage = graphrag_instance.config.vector_storage
                
                if hasattr(vector_storage, 'get_collection_info'):
                    info = asyncio.run(vector_storage.get_collection_info())
                    return {"success": True, "info": info}
                else:
                    return {"error": "Vector storage doesn't support collection info", "success": False}
            else:
                return {"error": "GraphRAG instance not found", "success": False}
        except Exception as e:
            logger.error(f"Error getting Qdrant collection info: {e}")
            return {"error": str(e), "success": False}
