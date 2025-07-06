# Qdrant Vector Storage Implementation

## Overview

This document describes the new `QdrantVectorStorage` implementation that replaces the HNSW-based vector storage with a Qdrant-based solution. Qdrant is a high-performance vector similarity search engine that provides better scalability, persistence, and advanced features compared to the in-memory HNSW implementation.

## Key Features

### Advantages over HNSW Implementation

1. **Persistence**: Data is automatically persisted to disk
2. **Scalability**: Can handle much larger datasets
3. **Multi-tenancy**: Multiple collections with isolated data
4. **Advanced Search**: Support for filtering, exact search, and various distance metrics
5. **Memory Management**: Better memory usage for large datasets
6. **Concurrent Access**: Multiple clients can access the same data safely
7. **REST API**: Can be accessed via HTTP REST API
8. **Clustering**: Supports distributed deployments

### Trade-offs

1. **Network Latency**: Requires network communication to Qdrant server
2. **Setup Complexity**: Requires running Qdrant server
3. **Resource Usage**: Additional server process running

## Configuration Mapping

### HNSW to Qdrant Configuration

| HNSW Parameter | Qdrant Equivalent | Description |
|----------------|-------------------|-------------|
| `ef_construction` | `hnsw_config.ef_construct` | Size of dynamic candidate list during indexing |
| `M` | `hnsw_config.m` | Number of bi-directional links per element |
| `ef_search` | `search_params.hnsw_ef` | Size of dynamic candidate list during search |
| `num_threads` | Not directly applicable | Qdrant manages threading internally |

### Additional Qdrant-Specific Configuration

```python
@dataclass
class QdrantVectorStorageConfig:
    # Connection settings
    host: str = "localhost"
    port: int = 6333
    grpc_port: Optional[int] = None
    prefer_grpc: bool = False
    https: bool = False
    api_key: Optional[str] = None
    
    # Collection settings
    collection_name: str = "embeddings"
    distance: qdrant_models.Distance = qdrant_models.Distance.COSINE
    
    # Performance tuning
    hnsw_config: Optional[qdrant_models.HnswConfigDiff] = None
    optimizers_config: Optional[qdrant_models.OptimizersConfigDiff] = None
    quantization_config: Optional[qdrant_models.QuantizationConfig] = None
    
    # Search settings
    search_params: Optional[qdrant_models.SearchParams] = None
    exact_search: bool = False
```

## Migration Guide

### Step 1: Install and Start Qdrant

```bash
# Using Docker (recommended)
docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant

# Or using Docker Compose (for persistent storage)
# Create docker-compose.yml with Qdrant service
```

### Step 2: Update Code

```python
# Old HNSW implementation
from fast_graphrag._storage._vdb_hnswlib import HNSWVectorStorage, HNSWVectorStorageConfig

config = HNSWVectorStorageConfig(
    ef_construction=128,
    M=64,
    ef_search=96,
    num_threads=-1
)

storage = HNSWVectorStorage(
    config=config,
    embedding_dim=384
)

# New Qdrant implementation
from fast_graphrag._storage._vdb_qdrant import QdrantVectorStorage, QdrantVectorStorageConfig
from qdrant_client.http import models as qdrant_models

config = QdrantVectorStorageConfig(
    host="localhost",
    port=6333,
    collection_name="my_embeddings",
    distance=qdrant_models.Distance.COSINE,
    hnsw_config=qdrant_models.HnswConfigDiff(
        ef_construct=128,  # Was ef_construction
        m=64,              # Was M
    ),
    search_params=qdrant_models.SearchParams(
        hnsw_ef=96,        # Was ef_search
        exact=False
    )
)

storage = QdrantVectorStorage(
    config=config,
    embedding_dim=384
)
```

### Step 3: Data Migration (if needed)

If you have existing HNSW data that needs to be migrated:

```python
async def migrate_hnsw_to_qdrant(old_storage, new_storage):
    """Migrate data from HNSW to Qdrant storage."""
    # This is conceptual - actual implementation depends on your data structure
    
    # Extract all vectors from old storage
    # Note: HNSW doesn't provide a direct way to extract all data
    # You would need to re-process your original documents
    
    # Insert into new storage
    await new_storage.insert_start()
    await new_storage.upsert(ids, embeddings, metadata)
    await new_storage.insert_done()
```

## Performance Tuning

### For Speed-Optimized Configuration

```python
fast_config = QdrantVectorStorageConfig(
    host="localhost",
    port=6333,
    collection_name="fast_search",
    distance=qdrant_models.Distance.DOT,  # Faster for normalized vectors
    hnsw_config=qdrant_models.HnswConfigDiff(
        m=16,              # Lower M for faster indexing
        ef_construct=100,  # Lower ef_construct
    ),
    search_params=qdrant_models.SearchParams(
        hnsw_ef=32,        # Lower ef for faster search
        exact=False
    ),
    optimizers_config=qdrant_models.OptimizersConfigDiff(
        indexing_threshold=20000,  # Higher threshold for less frequent optimization
    )
)
```

### For Accuracy-Optimized Configuration

```python
accurate_config = QdrantVectorStorageConfig(
    host="localhost",
    port=6333, 
    collection_name="accurate_search",
    distance=qdrant_models.Distance.COSINE,
    hnsw_config=qdrant_models.HnswConfigDiff(
        m=64,              # Higher M for better recall
        ef_construct=500,  # Higher ef_construct
    ),
    search_params=qdrant_models.SearchParams(
        hnsw_ef=256,       # Higher ef for better search
        exact=False
    )
)
```

### For Memory-Optimized Configuration

```python
memory_config = QdrantVectorStorageConfig(
    host="localhost",
    port=6333,
    collection_name="memory_efficient",
    distance=qdrant_models.Distance.COSINE,
    quantization_config=qdrant_models.ScalarQuantization(
        scalar=qdrant_models.ScalarQuantizationConfig(
            type=qdrant_models.ScalarType.INT8,
            quantile=0.99,
            always_ram=False
        )
    ),
    hnsw_config=qdrant_models.HnswConfigDiff(
        m=16,
        ef_construct=100,
        full_scan_threshold=10000,
        max_indexing_threads=0,  # Use default
    )
)
```

## Advanced Features

### 1. Payload Filtering

```python
# When upserting, include rich metadata
metadata = [
    {
        "category": "technology",
        "date": "2024-01-01",
        "score": 0.95,
        "tags": ["AI", "ML", "search"]
    }
]

# Search with filters (requires custom implementation in search methods)
# This would need to be added to the get_knn method
```

### 2. Collection Management

```python
# Get collection information
info = await storage.get_collection_info()
print(f"Collection has {info['points_count']} vectors")

# Delete collection (use with caution!)
await storage.delete_collection()
```

### 3. Connection Management

```python
# Close connections properly
storage.close()

# Or use context manager (would need to implement __aenter__ and __aexit__)
```

## Best Practices

### 1. Resource Management

- Always call `storage.close()` when done
- Use appropriate batch sizes for bulk operations
- Monitor Qdrant server memory usage

### 2. Performance Optimization

- Choose appropriate distance metric for your use case
- Tune HNSW parameters based on your data characteristics
- Use quantization for memory-constrained environments
- Consider using gRPC for better performance (set `prefer_grpc=True`)

### 3. Production Deployment

- Use persistent storage for Qdrant data
- Set up monitoring for Qdrant server
- Configure backup strategies
- Use authentication in production (`api_key`)
- Consider clustering for high availability

### 4. Error Handling

- Handle network connectivity issues
- Implement retry logic for transient failures
- Monitor collection status and health

## Testing

Run the example script to test the implementation:

```bash
python fast_graphrag/_storage/example_qdrant_usage.py
```

Make sure Qdrant server is running before testing.

## Troubleshooting

### Common Issues

1. **Connection refused**: Ensure Qdrant server is running on specified host/port
2. **Collection already exists**: Use unique collection names or delete existing collections
3. **Dimension mismatch**: Ensure `embedding_dim` matches your actual embeddings
4. **Memory issues**: Consider using quantization or reducing batch sizes
5. **Slow queries**: Tune HNSW parameters or check server resources

### Debugging

Enable debug logging to see detailed information:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

## Conclusion

The Qdrant implementation provides a robust, scalable alternative to the HNSW implementation while maintaining the same interface. It's particularly beneficial for:

- Large datasets that don't fit in memory
- Production deployments requiring persistence
- Multi-user environments
- Applications needing advanced search features

The migration path is straightforward, and the performance can be tuned based on your specific requirements.
