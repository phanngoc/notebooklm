#!/usr/bin/env python3
"""
Example and test script for QdrantVectorStorage implementation.

This script demonstrates how to use the new Qdrant-based vector storage
as a replacement for the HNSW implementation.
"""

import asyncio
import numpy as np
from typing import List, Dict, Any

# Import the new Qdrant implementation
from fast_graphrag._storage._vdb_qdrant import QdrantVectorStorage, QdrantVectorStorageConfig
from qdrant_client.http import models as qdrant_models


async def basic_usage_example():
    """Basic usage example of QdrantVectorStorage."""
    print("=== Basic Usage Example ===")
    
    # Configuration for Qdrant
    config = QdrantVectorStorageConfig(
        host="localhost",
        port=6333,
        collection_name="test_embeddings",
        distance=qdrant_models.Distance.COSINE,
        # Optional: Configure HNSW parameters for better performance
        hnsw_config=qdrant_models.HnswConfigDiff(
            m=16,  # Number of bi-directional links created for every new element during construction
            ef_construct=200,  # Size of the dynamic candidate list
        ),
    )
    
    # Create storage instance
    storage = QdrantVectorStorage(
        config=config,
        embedding_dim=384,  # Example dimension, adjust as needed
    )
    
    try:
        # Initialize for insertion
        await storage.insert_start()
        
        # Sample data
        ids = ["doc1", "doc2", "doc3", "doc4", "doc5"]
        embeddings = [
            np.random.rand(384).astype(np.float32) for _ in range(5)
        ]
        metadata = [
            {"title": f"Document {i+1}", "type": "text", "source": "example"}
            for i in range(5)
        ]
        
        # Insert vectors
        print(f"Inserting {len(ids)} vectors...")
        await storage.upsert(ids, embeddings, metadata)
        
        # Finish insertion
        await storage.insert_done()
        
        print(f"Storage size after insertion: {storage.size}")
        
        # Query for similar vectors
        await storage.query_start()
        
        # Query with the first embedding
        query_embeddings = [embeddings[0]]
        knn_ids, knn_scores = await storage.get_knn(query_embeddings, top_k=3)
        
        print("\nK-NN Search Results:")
        for i, (ids_batch, scores_batch) in enumerate(zip(knn_ids, knn_scores)):
            print(f"Query {i+1}:")
            for j, (doc_id, score) in enumerate(zip(ids_batch, scores_batch)):
                print(f"  {j+1}. ID: {doc_id}, Score: {score:.4f}")
        
        # Test score_all functionality
        print("\nTesting score_all functionality...")
        sparse_scores = await storage.score_all(query_embeddings, top_k=3, threshold=0.5)
        print(f"Sparse matrix shape: {sparse_scores.shape}")
        print(f"Non-zero elements: {sparse_scores.nnz}")
        
        await storage.query_done()
        
        # Get collection info
        info = await storage.get_collection_info()
        print(f"\nCollection Info: {info}")
        
    except Exception as e:
        print(f"Error during basic usage: {e}")
        raise
    finally:
        # Clean up
        storage.close()


async def advanced_configuration_example():
    """Example with advanced Qdrant configuration."""
    print("\n=== Advanced Configuration Example ===")
    
    # Advanced configuration
    config = QdrantVectorStorageConfig(
        host="localhost",
        port=6333,
        collection_name="advanced_embeddings",
        distance=qdrant_models.Distance.COSINE,
        
        # Advanced HNSW configuration for better performance
        hnsw_config=qdrant_models.HnswConfigDiff(
            m=32,  # Higher M for better recall
            ef_construct=400,  # Higher ef_construct for better indexing
        ),
        
        # Optimization configuration
        optimizers_config=qdrant_models.OptimizersConfigDiff(
            deleted_threshold=0.2,
            vacuum_min_vector_number=1000,
            default_segment_number=2,
        ),
        
        # Search parameters
        search_params=qdrant_models.SearchParams(
            hnsw_ef=128,  # Higher ef for better search quality
            exact=False,
        ),
        
        # WAL configuration for durability
        wal_config=qdrant_models.WalConfigDiff(
            wal_capacity_mb=32,
            wal_segments_ahead=0,
        ),
    )
    
    storage = QdrantVectorStorage(
        config=config,
        embedding_dim=768,  # Larger embedding dimension
    )
    
    try:
        await storage.insert_start()
        
        # Insert larger batch of vectors
        batch_size = 100
        ids = [f"doc_{i}" for i in range(batch_size)]
        embeddings = [
            np.random.rand(768).astype(np.float32) for _ in range(batch_size)
        ]
        metadata = [
            {
                "title": f"Document {i}",
                "category": f"category_{i % 5}",
                "timestamp": f"2024-01-{(i % 30) + 1:02d}",
                "length": np.random.randint(100, 1000),
            }
            for i in range(batch_size)
        ]
        
        print(f"Inserting {batch_size} vectors with advanced configuration...")
        await storage.upsert(ids, embeddings, metadata)
        await storage.insert_done()
        
        print(f"Storage size: {storage.size}")
        
        # Perform multiple queries
        await storage.query_start()
        
        # Test with multiple query vectors
        num_queries = 5
        query_embeddings = [
            np.random.rand(768).astype(np.float32) for _ in range(num_queries)
        ]
        
        knn_ids, knn_scores = await storage.get_knn(query_embeddings, top_k=5)
        
        print(f"\nMulti-query results ({num_queries} queries):")
        for i, (ids_batch, scores_batch) in enumerate(zip(knn_ids, knn_scores)):
            print(f"Query {i+1}: Found {len(ids_batch)} results")
            if ids_batch:  # Only show first result
                print(f"  Best match: ID={ids_batch[0]}, Score={scores_batch[0]:.4f}")
        
        await storage.query_done()
        
        # Show collection info
        info = await storage.get_collection_info()
        print(f"\nAdvanced Collection Info:")
        for key, value in info.items():
            print(f"  {key}: {value}")
            
    except Exception as e:
        print(f"Error during advanced usage: {e}")
        raise
    finally:
        # Clean up - optionally delete the collection
        try:
            await storage.delete_collection()
            print("Collection deleted successfully")
        except Exception as e:
            print(f"Error deleting collection: {e}")
        storage.close()


async def performance_comparison_example():
    """Example comparing performance characteristics."""
    print("\n=== Performance Comparison Setup ===")
    
    # Configuration optimized for speed
    fast_config = QdrantVectorStorageConfig(
        host="localhost",
        port=6333,
        collection_name="fast_embeddings",
        distance=qdrant_models.Distance.DOT,  # Faster than cosine for normalized vectors
        hnsw_config=qdrant_models.HnswConfigDiff(
            m=16,  # Lower M for faster indexing
            ef_construct=100,  # Lower ef_construct for faster indexing
        ),
        search_params=qdrant_models.SearchParams(
            hnsw_ef=32,  # Lower ef for faster search
            exact=False,
        ),
        exact_search=False,
    )
    
    # Configuration optimized for accuracy
    accurate_config = QdrantVectorStorageConfig(
        host="localhost",
        port=6333,
        collection_name="accurate_embeddings",
        distance=qdrant_models.Distance.COSINE,
        hnsw_config=qdrant_models.HnswConfigDiff(
            m=64,  # Higher M for better recall
            ef_construct=500,  # Higher ef_construct for better indexing
        ),
        search_params=qdrant_models.SearchParams(
            hnsw_ef=256,  # Higher ef for better search quality
            exact=False,
        ),
        exact_search=False,
    )
    
    print("Created configurations for performance comparison:")
    print("- Fast config: Optimized for speed")
    print("- Accurate config: Optimized for accuracy")
    print("In practice, you would benchmark these configurations with your specific data and queries.")


def migration_guide():
    """Guide for migrating from HNSW to Qdrant implementation."""
    print("\n=== Migration Guide from HNSW to Qdrant ===")
    
    migration_steps = [
        "1. Install Qdrant server (Docker: docker run -p 6333:6333 qdrant/qdrant)",
        "2. Update imports: from ._vdb_qdrant import QdrantVectorStorage, QdrantVectorStorageConfig",
        "3. Replace HNSWVectorStorageConfig with QdrantVectorStorageConfig",
        "4. Update configuration parameters:",
        "   - ef_construction -> hnsw_config.ef_construct",
        "   - M -> hnsw_config.m",
        "   - ef_search -> search_params.hnsw_ef",
        "5. Set host, port, and collection_name in config",
        "6. Optional: Configure advanced features like quantization, optimization",
        "7. Test with your existing data and queries",
        "8. Monitor performance and adjust configuration as needed",
    ]
    
    for step in migration_steps:
        print(step)
    
    print("\nKey differences:")
    print("- Qdrant is a standalone server vs HNSW in-memory")
    print("- Qdrant provides better scalability and persistence")
    print("- Qdrant supports metadata filtering and advanced search")
    print("- Qdrant requires network communication (slight latency)")
    print("- Qdrant provides better multi-tenancy and resource management")


async def main():
    """Run all examples."""
    print("QdrantVectorStorage Implementation Examples")
    print("=" * 50)
    
    try:
        await basic_usage_example()
        await advanced_configuration_example()
        await performance_comparison_example()
        migration_guide()
    except Exception as e:
        print(f"Error running examples: {e}")
        print("Make sure Qdrant server is running on localhost:6333")
        print("Start with: docker run -p 6333:6333 qdrant/qdrant")


if __name__ == "__main__":
    asyncio.run(main())
