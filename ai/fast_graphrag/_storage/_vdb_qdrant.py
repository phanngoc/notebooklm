import json
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Tuple, Union

import numpy as np
import numpy.typing as npt
from scipy.sparse import csr_matrix
from qdrant_client import QdrantClient
from qdrant_client.http import models as qdrant_models
from qdrant_client.http.exceptions import UnexpectedResponse

from fast_graphrag._exceptions import InvalidStorageError
from fast_graphrag._types import GTEmbedding, GTId, TScore
from fast_graphrag._utils import logger

from ._base import BaseVectorStorage


@dataclass
class QdrantVectorStorageConfig:
    """Configuration for Qdrant vector storage."""
    
    # Connection settings
    host: str = field(default="localhost")
    port: int = field(default=6333)
    grpc_port: Optional[int] = field(default=None)
    prefer_grpc: bool = field(default=False)
    https: bool = field(default=False)
    api_key: Optional[str] = field(default=None)
    prefix: Optional[str] = field(default=None)
    timeout: Optional[float] = field(default=None)
    
    # Collection settings
    collection_name: str = field(default="embeddings")
    vector_size: Optional[int] = field(default=None)  # Will be set automatically
    distance: qdrant_models.Distance = field(default=qdrant_models.Distance.COSINE)
    
    # Performance settings
    hnsw_config: Optional[qdrant_models.HnswConfigDiff] = field(default=None)
    optimizers_config: Optional[qdrant_models.OptimizersConfigDiff] = field(default=None)
    wal_config: Optional[qdrant_models.WalConfigDiff] = field(default=None)
    quantization_config: Optional[qdrant_models.QuantizationConfig] = field(default=None)
    
    # Search settings
    search_params: Optional[qdrant_models.SearchParams] = field(default=None)
    # Note: exact_search is kept for backward compatibility but should be configured
    # through search_params using qdrant_models.SearchParams(exact=True) if needed
    exact_search: bool = field(default=False)


@dataclass
class QdrantVectorStorage(BaseVectorStorage[GTId, GTEmbedding]):
    """Qdrant-based vector storage implementation."""
    
    config: QdrantVectorStorageConfig = field()
    _client: Optional[QdrantClient] = field(init=False, default=None)
    _collection_name: str = field(init=False, default="")
    _size_cache: int = field(init=False, default=0)
    
    def __post_init__(self):
        """Initialize the collection name with namespace and set embedding dimension."""
        if self.namespace and self.namespace.namespace:
            self._collection_name = f"{self.config.collection_name}_{self.namespace.namespace}"
        else:
            self._collection_name = self.config.collection_name
            
        # Set embedding dimension from config if not already set
        if self.embedding_dim == 0 and self.config.vector_size:
            self.embedding_dim = self.config.vector_size

    @property
    def size(self) -> int:
        """Get the current number of vectors in the collection."""
        if self._client is None:
            return 0
        
        try:
            collection_info = self._client.get_collection(self._collection_name)
            current_size = collection_info.points_count or 0
            self._size_cache = current_size
            return current_size
        except UnexpectedResponse as e:
            if e.status_code == 404:
                # Collection doesn't exist yet
                return 0
            logger.warning(f"Failed to get collection size: {e}")
            return self._size_cache
        except Exception as e:
            logger.warning(f"Failed to get collection size: {e}")
            return self._size_cache

    @property
    def max_size(self) -> int:
        """Qdrant doesn't have a fixed max size, return a large number."""
        return 2**31 - 1  # Max int32

    def _get_client(self) -> QdrantClient:
        """Get or create Qdrant client."""
        if self._client is None:
            self._client = QdrantClient(
                host=self.config.host,
                port=self.config.port,
                grpc_port=self.config.grpc_port,
                prefer_grpc=self.config.prefer_grpc,
                https=self.config.https,
                prefix=self.config.prefix,
                timeout=self.config.timeout,
            )
        return self._client

    def _ensure_collection_exists(self, sample_embedding: Optional[GTEmbedding] = None) -> None:
        """Ensure the collection exists with proper configuration."""
        client = self._get_client()
        
        try:
            # Check if collection exists
            collection_info = client.get_collection(self._collection_name)
            logger.debug(f"Collection '{self._collection_name}' already exists with {collection_info.points_count} points")
            
            # Validate embedding dimensions if sample provided
            if sample_embedding is not None:
                expected_size = collection_info.config.params.vectors.size
                actual_size = len(np.array(sample_embedding, dtype=np.float32))
                if expected_size != actual_size:
                    logger.warning(
                        f"Embedding dimension mismatch detected: collection expects {expected_size}, "
                        f"but got {actual_size}. Auto-recreating collection with correct dimensions."
                    )
                    # Auto-recreate collection with correct dimensions
                    try:
                        client.delete_collection(self._collection_name)
                        logger.info(f"Deleted incompatible collection '{self._collection_name}'")
                        self._size_cache = 0
                        # Fall through to create new collection
                    except Exception as delete_error:
                        logger.error(f"Failed to delete incompatible collection: {delete_error}")
                        raise InvalidStorageError(
                            f"Embedding dimension mismatch: collection expects {expected_size}, "
                            f"but got {actual_size}. Manual collection recreation required."
                        )
                else:
                    # Dimensions match, collection is ready
                    return
            else:
                # No sample to validate, assume collection is compatible
                return
        except UnexpectedResponse as e:
            if e.status_code == 404:
                # Collection doesn't exist, create it
                pass
            else:
                raise

        # Determine vector size with better error handling
        vector_size = self.config.vector_size or self.embedding_dim
        
        # If sample embedding provided, use its size
        if sample_embedding is not None:
            sample_size = len(np.array(sample_embedding, dtype=np.float32))
            if vector_size <= 0:
                vector_size = sample_size
                logger.info(f"Auto-detected vector size from sample embedding: {vector_size}")
            elif vector_size != sample_size:
                logger.warning(f"Vector size mismatch: config={vector_size}, sample={sample_size}. Using sample size.")
                vector_size = sample_size
        
        # If still no vector size, use a default for OpenAI embeddings
        if vector_size <= 0:
            logger.warning("No vector size specified in config or embedding_dim, defaulting to 1536 (OpenAI ada-002)")
            vector_size = 1536
            
        # Update the embedding_dim for consistency
        self.embedding_dim = vector_size

        # Create collection
        vectors_config = qdrant_models.VectorParams(
            size=vector_size,
            distance=self.config.distance,
            hnsw_config=self.config.hnsw_config,
        )

        client.create_collection(
            collection_name=self._collection_name,
            vectors_config=vectors_config,
            optimizers_config=self.config.optimizers_config,
            wal_config=self.config.wal_config,
            quantization_config=self.config.quantization_config,
        )
        
        logger.info(f"Created collection '{self._collection_name}' with vector size {vector_size}")

    def _convert_id(self, gt_id: GTId) -> Union[str, int]:
        """Convert GTId to Qdrant-compatible ID."""
        if isinstance(gt_id, (str, int)):
            return gt_id
        else:
            # Convert other types to string
            return str(gt_id)

    def _convert_ids(self, gt_ids: Iterable[GTId]) -> List[Union[str, int]]:
        """Convert GTIds to Qdrant-compatible IDs."""
        return [self._convert_id(gt_id) for gt_id in gt_ids]

    def _reconvert_id(self, qdrant_id: Union[str, int]) -> GTId:
        """Convert Qdrant ID back to GTId."""
        # This assumes GTId can be str or int. If GTId has a specific type,
        # you might need to implement proper conversion logic here.
        return qdrant_id  # type: ignore

    def _validate_embedding_dimensions(self, embeddings: Iterable[GTEmbedding]) -> List[GTEmbedding]:
        """Validate and normalize embedding dimensions."""
        embeddings_list = [np.array(emb, dtype=np.float32) for emb in embeddings]
        
        if not embeddings_list:
            return embeddings_list
        
        # Check consistency within the batch
        first_dim = len(embeddings_list[0])
        for i, emb in enumerate(embeddings_list):
            if len(emb) != first_dim:
                raise ValueError(
                    f"Embedding dimension inconsistency in batch: "
                    f"embedding {i} has dimension {len(emb)}, expected {first_dim}"
                )
        
        # Check against collection if it exists
        if self._client:
            try:
                collection_info = self._client.get_collection(self._collection_name)
                expected_dim = collection_info.config.params.vectors.size
                if first_dim != expected_dim:
                    raise ValueError(
                        f"Embedding dimension mismatch with collection: "
                        f"embeddings have dimension {first_dim}, collection expects {expected_dim}. "
                        f"Consider recreating the collection or using compatible embeddings."
                    )
            except UnexpectedResponse as e:
                if e.status_code != 404:  # Collection exists but other error
                    logger.warning(f"Failed to validate against existing collection: {e}")
        
        return embeddings_list

    async def upsert(
        self,
        ids: Iterable[GTId],
        embeddings: Iterable[GTEmbedding],
        metadata: Union[Iterable[Dict[str, Any]], None] = None,
    ) -> None:
        """Insert or update vectors in Qdrant."""
        ids_list = list(ids)
        # Validate embeddings first
        embeddings_list = self._validate_embedding_dimensions(embeddings)
        metadata_list = list(metadata) if metadata else None

        # Validate input lengths
        if not (len(ids_list) == len(embeddings_list)):
            raise ValueError("ids and embeddings must have the same length")
        
        if metadata_list is not None and len(metadata_list) != len(ids_list):
            raise ValueError("metadata must have the same length as ids and embeddings")

        if not ids_list:
            return  # Nothing to upsert

        # Ensure collection exists with dimension validation
        if embeddings_list:
            await self.ensure_dimension_compatibility(embeddings_list[0])
        else:
            self._ensure_collection_exists()
        
        client = self._get_client()
        
        logger.debug(f"Upserting {len(ids_list)} vectors to collection '{self._collection_name}'")
        # Prepare points for upsert
        points = []
        for i, (gt_id, embedding) in enumerate(zip(ids_list, embeddings_list)):
            qdrant_id = self._convert_id(gt_id)
            payload = {}
            
            # Add original ID to payload for reverse lookup
            payload["original_id"] = str(gt_id)
            
            # Add metadata if provided
            if metadata_list and i < len(metadata_list) and metadata_list[i]:
                payload.update(metadata_list[i])
            
            point = qdrant_models.PointStruct(
                id=qdrant_id,
                vector=embedding.tolist(),
                payload=payload,
            )
            points.append(point)

        try:
            # Upsert points in batches to avoid memory issues
            batch_size = 100
            for i in range(0, len(points), batch_size):
                batch = points[i:i + batch_size]
                client.upsert(collection_name=self._collection_name, points=batch)
            
            self._size_cache += len(points)
            logger.debug(f"Upserted {len(points)} points to collection '{self._collection_name}'")
            
        except Exception as e:
            logger.error(f"Error upserting vectors to Qdrant: {e}")
            # Log debugging information
            debug_info = await self.validate_collection_consistency()
            logger.error(f"Collection debug info: {debug_info}")
            raise InvalidStorageError(f"Failed to upsert vectors: {e}") from e

    async def get_knn(
        self, embeddings: Iterable[GTEmbedding], top_k: int
    ) -> Tuple[Iterable[Iterable[GTId]], npt.NDArray[TScore]]:
        """Get k-nearest neighbors for given embeddings."""
        # Validate embeddings first
        embeddings_list = self._validate_embedding_dimensions(embeddings)
        
        if not embeddings_list:
            return [], np.array([], dtype=TScore)

        if self.size == 0:
            empty_ids: List[List[GTId]] = [[] for _ in embeddings_list]
            empty_scores = np.array([[] for _ in embeddings_list], dtype=TScore)
            logger.info("Querying knn in empty collection.")
            return empty_ids, empty_scores

        client = self._get_client()
        top_k = min(top_k, self.size)
        
        all_ids: List[List[GTId]] = []
        all_scores: List[List[TScore]] = []
        
        try:
            for embedding in embeddings_list:
                search_result = client.search(
                    collection_name=self._collection_name,
                    query_vector=embedding.tolist(),
                    limit=top_k,
                    search_params=self.config.search_params,
                    with_payload=True,
                    with_vectors=False,
                )
                
                # Extract IDs and scores
                batch_ids = []
                batch_scores = []
                
                for scored_point in search_result:
                    # Try to get original ID from payload, fallback to point ID
                    if scored_point.payload and "original_id" in scored_point.payload:
                        original_id = scored_point.payload["original_id"]
                        # Try to convert back to appropriate type
                        try:
                            if original_id.isdigit():
                                original_id = int(original_id)
                        except (AttributeError, ValueError):
                            pass
                        batch_ids.append(self._reconvert_id(original_id))
                    else:
                        batch_ids.append(self._reconvert_id(scored_point.id))
                    
                    # Qdrant returns cosine similarity scores [0, 1] where 1 is most similar
                    # Convert to the expected format if needed
                    batch_scores.append(float(scored_point.score))
                
                all_ids.append(batch_ids)
                all_scores.append(batch_scores)
                
        except Exception as e:
            logger.error(f"Error querying Qdrant: {e}")
            raise InvalidStorageError(f"Failed to query vectors: {e}") from e

        # Convert scores to numpy array
        scores_array = np.array(all_scores, dtype=TScore)
        
        return all_ids, scores_array

    async def score_all(
        self, embeddings: Iterable[GTEmbedding], top_k: int = 1, threshold: Optional[float] = None
    ) -> csr_matrix:
        """Score all embeddings against the given queries."""
        # Validate embeddings first
        embeddings_list = self._validate_embedding_dimensions(embeddings)
        
        if not embeddings_list or self.size == 0:
            logger.warning(f"No provided embeddings ({len(embeddings_list)}) or empty collection ({self.size}).")
            return csr_matrix((len(embeddings_list), self.size))

        client = self._get_client()
        top_k = min(top_k, self.size)
        
        # Get actual collection size to ensure matrix dimensions are correct
        actual_size = self.size
        
        # Build point ID to index mapping
        # First, get all point IDs to create a consistent mapping
        try:
            # Get all points to create ID mapping
            all_points = client.scroll(
                collection_name=self._collection_name,
                limit=actual_size,
                with_payload=False,
                with_vectors=False
            )[0]  # Returns (points, next_page_offset)
            
            # Create mapping from point ID to sequential index
            id_to_index = {}
            for idx, point in enumerate(all_points):
                id_to_index[point.id] = idx
                
            # Update actual size based on retrieved points
            actual_size = len(all_points)
            
        except Exception as e:
            logger.warning(f"Failed to build ID mapping, falling back to direct indexing: {e}")
            id_to_index = {}
        
        # Collect all search results
        all_row_indices = []
        all_col_indices = []
        all_scores = []
        
        try:
            logger.debug(f"Scoring {len(embeddings_list)} embeddings against collection '{self._collection_name}' (size: {actual_size})")
            for query_idx, embedding in enumerate(embeddings_list):
                search_result = client.search(
                    collection_name=self._collection_name,
                    query_vector=embedding.tolist(),
                    limit=top_k,
                    search_params=self.config.search_params,
                    with_payload=True,
                    with_vectors=False,
                )
                
                for scored_point in search_result:
                    score = float(scored_point.score)
                    
                    # Apply threshold if specified
                    if threshold is not None and score < threshold:
                        continue
                    
                    # Map point ID to column index
                    point_id = scored_point.id
                    
                    if id_to_index:
                        # Use the pre-built mapping
                        col_idx = id_to_index.get(point_id)
                        if col_idx is None:
                            logger.warning(f"Point ID {point_id} not found in mapping, skipping")
                            continue
                    else:
                        # Fallback to direct mapping with bounds checking
                        if isinstance(point_id, str) and point_id.isdigit():
                            col_idx = int(point_id)
                        elif isinstance(point_id, int):
                            col_idx = point_id
                        else:
                            # For non-numeric IDs, use hash modulo size
                            col_idx = hash(str(point_id)) % actual_size
                    
                    # Ensure column index is within bounds
                    if col_idx >= actual_size:
                        logger.warning(f"Column index {col_idx} exceeds matrix size {actual_size}, using modulo")
                        col_idx = col_idx % actual_size
                    
                    all_row_indices.append(query_idx)
                    all_col_indices.append(col_idx)
                    all_scores.append(score)
                    
        except Exception as e:
            logger.error(f"Error scoring all embeddings: {e}")
            raise InvalidStorageError(f"Failed to score embeddings: {e}") from e

        # Create sparse matrix with correct dimensions
        if all_scores:
            scores_matrix = csr_matrix(
                (all_scores, (all_row_indices, all_col_indices)),
                shape=(len(embeddings_list), actual_size),
            )
        else:
            scores_matrix = csr_matrix((len(embeddings_list), actual_size))

        return scores_matrix

    async def _insert_start(self):
        """Prepare the storage for inserting."""
        self._ensure_collection_exists()
        logger.debug(f"Qdrant collection '{self._collection_name}' ready for insertion")

    async def _insert_done(self):
        """Commit the storage operations after inserting."""
        # Qdrant automatically persists data, but we can optimize the collection
        if self._client:
            try:
                client = self._get_client()
                # Optionally trigger optimization
                # client.update_collection(
                #     collection_name=self._collection_name,
                #     optimizer_config=qdrant_models.OptimizersConfigDiff(
                #         indexing_threshold=10000,
                #     )
                # )
                logger.debug(f"Insert operations completed for collection '{self._collection_name}'")
            except Exception as e:
                logger.warning(f"Error during insert completion: {e}")

    async def _query_start(self):
        """Prepare the storage for querying."""
        self._ensure_collection_exists()
        logger.debug(f"Qdrant collection '{self._collection_name}' ready for querying")

    async def _query_done(self):
        """Release the storage after querying."""
        # Nothing specific needed for Qdrant
        logger.debug(f"Query operations completed for collection '{self._collection_name}'")

    def close(self):
        """Close the Qdrant client connection."""
        if self._client:
            try:
                self._client.close()
                logger.debug("Qdrant client connection closed")
            except Exception as e:
                logger.warning(f"Error closing Qdrant client: {e}")
            finally:
                self._client = None

    def __del__(self):
        """Cleanup when the object is destroyed."""
        self.close()

    async def delete_collection(self):
        """Delete the entire collection. Use with caution!"""
        if self._client:
            try:
                client = self._get_client()
                client.delete_collection(self._collection_name)
                logger.info(f"Deleted collection '{self._collection_name}'")
                self._size_cache = 0
            except Exception as e:
                logger.error(f"Error deleting collection: {e}")
                raise InvalidStorageError(f"Failed to delete collection: {e}") from e

    async def get_collection_info(self) -> Dict[str, Any]:
        """Get information about the collection."""
        if not self._client:
            return {"error": "Client not initialized"}
        
        try:
            client = self._get_client()
            collection_info = client.get_collection(self._collection_name)
            
            return {
                "name": self._collection_name,
                "points_count": collection_info.points_count,
                "segments_count": collection_info.segments_count,
                "status": collection_info.status,
                "optimizer_status": collection_info.optimizer_status,
                "vectors_count": collection_info.vectors_count,
                "indexed_vectors_count": collection_info.indexed_vectors_count,
            }
        except Exception as e:
            logger.error(f"Error getting collection info: {e}")
            return {"error": str(e)}

    async def get_collection_vector_size(self) -> Optional[int]:
        """Get the vector size of the existing collection."""
        if not self._client:
            return None
        
        try:
            client = self._get_client()
            collection_info = client.get_collection(self._collection_name)
            return collection_info.config.params.vectors.size
        except Exception as e:
            logger.warning(f"Failed to get collection vector size: {e}")
            return None

    async def validate_embedding_compatibility(self, embedding: GTEmbedding) -> bool:
        """Check if an embedding is compatible with the existing collection."""
        collection_size = await self.get_collection_vector_size()
        if collection_size is None:
            return True  # No collection exists yet
        
        embedding_size = len(np.array(embedding, dtype=np.float32))
        compatible = collection_size == embedding_size
        
        if not compatible:
            logger.warning(
                f"Embedding dimension mismatch: collection expects {collection_size}, "
                f"got {embedding_size}"
            )
        
        return compatible

    async def recreate_collection_with_size(self, vector_size: int) -> None:
        """Recreate the collection with a specific vector size. WARNING: This deletes all data!"""
        if self._client:
            try:
                client = self._get_client()
                # Delete existing collection
                try:
                    client.delete_collection(self._collection_name)
                    logger.info(f"Deleted existing collection '{self._collection_name}'")
                except UnexpectedResponse as e:
                    if e.status_code != 404:  # Ignore if collection doesn't exist
                        raise

                # Update config and recreate
                self.config.vector_size = vector_size
                self.embedding_dim = vector_size
                self._size_cache = 0
                
                # Create new collection
                vectors_config = qdrant_models.VectorParams(
                    size=vector_size,
                    distance=self.config.distance,
                    hnsw_config=self.config.hnsw_config,
                )

                client.create_collection(
                    collection_name=self._collection_name,
                    vectors_config=vectors_config,
                    optimizers_config=self.config.optimizers_config,
                    wal_config=self.config.wal_config,
                    quantization_config=self.config.quantization_config,
                )
                
                logger.info(f"Recreated collection '{self._collection_name}' with vector size {vector_size}")
                
            except Exception as e:
                logger.error(f"Error recreating collection: {e}")
                raise InvalidStorageError(f"Failed to recreate collection: {e}") from e

    async def debug_embedding_info(self) -> Dict[str, Any]:
        """Get debug information about embedding dimensions."""
        info = {
            "config_vector_size": self.config.vector_size,
            "instance_embedding_dim": self.embedding_dim,
            "collection_exists": False,
            "collection_vector_size": None,
            "collection_points_count": 0,
        }
        
        if self._client:
            try:
                collection_info = self._client.get_collection(self._collection_name)
                info.update({
                    "collection_exists": True,
                    "collection_vector_size": collection_info.config.params.vectors.size,
                    "collection_points_count": collection_info.points_count or 0,
                })
            except UnexpectedResponse as e:
                if e.status_code == 404:
                    info["collection_exists"] = False
                else:
                    info["collection_error"] = str(e)
            except Exception as e:
                info["collection_error"] = str(e)
        
        return info

    async def fix_dimension_mismatch(self, target_dimension: int) -> None:
        """Fix dimension mismatch by recreating collection with target dimension."""
        logger.warning(f"Recreating collection '{self._collection_name}' with dimension {target_dimension}")
        await self.recreate_collection_with_size(target_dimension)
        logger.info(f"Collection recreated successfully with dimension {target_dimension}")

    async def validate_collection_consistency(self) -> Dict[str, Any]:
        """Validate collection consistency and return debug information."""
        info = {
            "collection_exists": False,
            "collection_size": 0,
            "expected_dimension": self.embedding_dim,
            "actual_dimension": None,
            "config_dimension": self.config.vector_size,
            "collection_name": self._collection_name,
            "errors": []
        }
        
        if not self._client:
            info["errors"].append("No client connection")
            return info
        
        try:
            collection_info = self._client.get_collection(self._collection_name)
            info["collection_exists"] = True
            info["collection_size"] = collection_info.points_count or 0
            info["actual_dimension"] = collection_info.config.params.vectors.size
            
            # Check dimension consistency
            if self.embedding_dim > 0 and info["actual_dimension"] != self.embedding_dim:
                info["errors"].append(
                    f"Dimension mismatch: expected {self.embedding_dim}, collection has {info['actual_dimension']}"
                )
            
            if self.config.vector_size and info["actual_dimension"] != self.config.vector_size:
                info["errors"].append(
                    f"Config dimension mismatch: config {self.config.vector_size}, collection has {info['actual_dimension']}"
                )
                
        except UnexpectedResponse as e:
            if e.status_code == 404:
                info["errors"].append("Collection does not exist")
            else:
                info["errors"].append(f"Qdrant error: {e}")
        except Exception as e:
            info["errors"].append(f"Unexpected error: {e}")
        
        return info

    async def ensure_dimension_compatibility(self, sample_embedding: GTEmbedding) -> bool:
        """Ensure the collection is compatible with the given embedding dimension."""
        embedding_dim = len(np.array(sample_embedding, dtype=np.float32))
        
        try:
            collection_info = self._client.get_collection(self._collection_name)
            collection_dim = collection_info.config.params.vectors.size
            
            if collection_dim != embedding_dim:
                logger.warning(
                    f"Dimension mismatch detected: collection={collection_dim}, embedding={embedding_dim}. "
                    f"Recreating collection '{self._collection_name}'"
                )
                
                # Delete and recreate collection
                self._client.delete_collection(self._collection_name)
                self._size_cache = 0
                
                # Create new collection with correct dimension
                self._ensure_collection_exists(sample_embedding=sample_embedding)
                return True
                
        except UnexpectedResponse as e:
            if e.status_code == 404:
                # Collection doesn't exist, create it
                self._ensure_collection_exists(sample_embedding=sample_embedding)
                return True
            else:
                raise
        
        return True
