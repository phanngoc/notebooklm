# Qdrant Vector Storage for fast-graphrag

This directory contains a new **QdrantVectorStorage** implementation that serves as a drop-in replacement for the HNSW-based vector storage. The implementation provides better scalability, persistence, and advanced features while maintaining the same interface.

## Quick Start

### 1. Install and Start Qdrant Server

Using Docker (recommended):
```bash
# Start Qdrant server
docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant

# Or with persistent storage
docker run -p 6333:6333 -p 6334:6334 -v $(pwd)/qdrant_storage:/qdrant/storage qdrant/qdrant
```

### 2. Update Your Code

Replace HNSW imports with Qdrant imports:

```python
# Old
from fast_graphrag._storage._vdb_hnswlib import HNSWVectorStorage, HNSWVectorStorageConfig

# New  
from fast_graphrag._storage._vdb_qdrant import QdrantVectorStorage, QdrantVectorStorageConfig
from qdrant_client.http import models as qdrant_models
```

### 3. Update Configuration

```python
# Old HNSW config
hnsw_config = HNSWVectorStorageConfig(
    ef_construction=128,
    M=64,
    ef_search=96,
    num_threads=-1
)

# New Qdrant config
qdrant_config = QdrantVectorStorageConfig(
    host="localhost",
    port=6333,
    collection_name="my_vectors",
    distance=qdrant_models.Distance.COSINE,
    hnsw_config=qdrant_models.HnswConfigDiff(
        ef_construct=128,  # was ef_construction
        m=64,              # was M
    ),
    search_params=qdrant_models.SearchParams(
        hnsw_ef=96,        # was ef_search
        exact=False
    )
)
```

### 4. Use the Same Interface

```python
storage = QdrantVectorStorage(
    config=qdrant_config,
    embedding_dim=384
)

# Same methods as before
await storage.insert_start()
await storage.upsert(ids, embeddings, metadata)
await storage.insert_done()

await storage.query_start()  
knn_ids, knn_scores = await storage.get_knn(query_embeddings, top_k=10)
await storage.query_done()
```

## Files Overview

- **`_vdb_qdrant.py`** - Main Qdrant vector storage implementation
- **`example_qdrant_usage.py`** - Complete usage examples and configuration options
- **`test_qdrant.py`** - Test suite to verify the implementation
- **`QDRANT_IMPLEMENTATION.md`** - Detailed documentation and migration guide

## Testing

Run the test suite to verify everything works:

```bash
# Make sure Qdrant server is running first
docker run -d -p 6333:6333 qdrant/qdrant

# Run tests
python fast_graphrag/_storage/test_qdrant.py
```

## Key Benefits

✅ **Persistent Storage** - Data survives restarts  
✅ **Better Scalability** - Handle millions of vectors  
✅ **Memory Efficiency** - Vectors stored on disk with intelligent caching  
✅ **Multi-tenancy** - Multiple collections in one server  
✅ **Production Ready** - REST API, monitoring, clustering support  
✅ **Advanced Features** - Filtering, exact search, quantization  

## Configuration Examples

### Speed Optimized
```python
fast_config = QdrantVectorStorageConfig(
    collection_name="fast_search",
    distance=qdrant_models.Distance.DOT,
    hnsw_config=qdrant_models.HnswConfigDiff(m=16, ef_construct=100),
    search_params=qdrant_models.SearchParams(hnsw_ef=32)
)
```

### Accuracy Optimized  
```python
accurate_config = QdrantVectorStorageConfig(
    collection_name="accurate_search", 
    distance=qdrant_models.Distance.COSINE,
    hnsw_config=qdrant_models.HnswConfigDiff(m=64, ef_construct=500),
    search_params=qdrant_models.SearchParams(hnsw_ef=256)
)
```

### Memory Optimized
```python
memory_config = QdrantVectorStorageConfig(
    collection_name="memory_efficient",
    quantization_config=qdrant_models.ScalarQuantization(
        scalar=qdrant_models.ScalarQuantizationConfig(
            type=qdrant_models.ScalarType.INT8,
            quantile=0.99
        )
    )
)
```

## Production Deployment

For production use:

1. **Persistent Storage**: Mount volume for data persistence
2. **Authentication**: Set API key in configuration  
3. **Monitoring**: Enable metrics collection
4. **Backup**: Regular snapshots of collections
5. **Clustering**: Deploy multiple Qdrant nodes for HA

See `QDRANT_IMPLEMENTATION.md` for detailed production guidance.

## Support

If you encounter issues:

1. Check that Qdrant server is running and accessible
2. Verify network connectivity (port 6333)
3. Review logs for connection errors
4. Run the test suite to isolate problems
5. Check Qdrant server logs for errors

For more detailed information, see the complete documentation in `QDRANT_IMPLEMENTATION.md`.
