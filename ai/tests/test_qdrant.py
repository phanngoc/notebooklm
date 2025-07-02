#!/usr/bin/env python3
"""
Test script for QdrantVectorStorage implementation.
Run this to verify the implementation works correctly.
"""

import asyncio
import numpy as np
import sys
import traceback
from typing import List

# Import the new Qdrant implementation
try:
    from fast_graphrag._storage._vdb_qdrant import QdrantVectorStorage, QdrantVectorStorageConfig
    from qdrant_client.http import models as qdrant_models
    from qdrant_client import QdrantClient
    from qdrant_client.http.exceptions import UnexpectedResponse
except ImportError as e:
    print(f"Import error: {e}")
    print("Make sure qdrant-client is installed: pip install qdrant-client")
    sys.exit(1)


async def test_qdrant_connection():
    """Test if Qdrant server is accessible."""
    print("Testing Qdrant server connection...")
    
    try:
        client = QdrantClient(host="localhost", port=6333)
        collections = client.get_collections()
        print(f"✓ Qdrant server is accessible. Found {len(collections.collections)} collections.")
        client.close()
        return True
    except Exception as e:
        print(f"✗ Cannot connect to Qdrant server: {e}")
        print("Please start Qdrant server with: docker run -p 6333:6333 qdrant/qdrant")
        return False


async def test_basic_operations():
    """Test basic vector storage operations."""
    print("\nTesting basic operations...")
    
    config = QdrantVectorStorageConfig(
        host="localhost",
        port=6333,
        collection_name="test_basic_ops",
        distance=qdrant_models.Distance.COSINE,
    )
    
    storage = QdrantVectorStorage(
        config=config,
        embedding_dim=128,
    )
    
    try:
        # Test insertion
        await storage.insert_start()
        
        # Create test data
        ids = ["test1", "test2", "test3"]
        embeddings = [
            np.random.rand(128).astype(np.float32),
            np.random.rand(128).astype(np.float32), 
            np.random.rand(128).astype(np.float32),
        ]
        metadata = [
            {"title": "Test Document 1"},
            {"title": "Test Document 2"},
            {"title": "Test Document 3"},
        ]
        
        await storage.upsert(ids, embeddings, metadata)
        await storage.insert_done()
        
        print(f"✓ Inserted {len(ids)} vectors")
        print(f"✓ Storage size: {storage.size}")
        
        # Test querying
        await storage.query_start()
        
        query_embedding = [embeddings[0]]  # Query with first embedding
        knn_ids, knn_scores = await storage.get_knn(query_embedding, top_k=2)
        
        print(f"✓ K-NN query returned {len(list(knn_ids)[0])} results")
        
        # Test score_all
        sparse_scores = await storage.score_all(query_embedding, top_k=3)
        print(f"✓ Score all returned matrix of shape {sparse_scores.shape}")
        
        await storage.query_done()
        
        # Test collection info
        info = await storage.get_collection_info()
        print(f"✓ Collection info: {info.get('points_count', 'N/A')} points")
        
        return True
        
    except Exception as e:
        print(f"✗ Basic operations test failed: {e}")
        traceback.print_exc()
        return False
    finally:
        try:
            await storage.delete_collection()
            print("✓ Test collection cleaned up")
        except:
            pass
        storage.close()


async def test_empty_operations():
    """Test operations on empty collection."""
    print("\nTesting empty collection operations...")
    
    config = QdrantVectorStorageConfig(
        host="localhost",
        port=6333,
        collection_name="test_empty_ops",
    )
    
    storage = QdrantVectorStorage(
        config=config,
        embedding_dim=64,
    )
    
    try:
        await storage.query_start()
        
        # Query empty collection
        query_embedding = [np.random.rand(64).astype(np.float32)]
        knn_ids, knn_scores = await storage.get_knn(query_embedding, top_k=5)
        
        knn_ids_list = list(knn_ids)
        print(f"✓ Empty collection query returned {len(knn_ids_list)} result batches")
        
        if knn_ids_list:
            print(f"✓ First batch has {len(knn_ids_list[0])} results (should be 0 or empty)")
        
        await storage.query_done()
        return True
        
    except Exception as e:
        print(f"✗ Empty operations test failed: {e}")
        traceback.print_exc()
        return False
    finally:
        try:
            await storage.delete_collection()
        except:
            pass
        storage.close()


async def test_large_batch():
    """Test with larger batch of vectors."""
    print("\nTesting large batch operations...")
    
    config = QdrantVectorStorageConfig(
        host="localhost",
        port=6333,
        collection_name="test_large_batch",
        hnsw_config=qdrant_models.HnswConfigDiff(
            m=16,
            ef_construct=200,
        ),
    )
    
    storage = QdrantVectorStorage(
        config=config,
        embedding_dim=256,
    )
    
    try:
        await storage.insert_start()
        
        # Create larger dataset
        batch_size = 50
        ids = [f"doc_{i}" for i in range(batch_size)]
        embeddings = [
            np.random.rand(256).astype(np.float32) for _ in range(batch_size)
        ]
        metadata = [
            {"doc_id": i, "category": f"cat_{i % 5}"}
            for i in range(batch_size)
        ]
        
        await storage.upsert(ids, embeddings, metadata)
        await storage.insert_done()
        
        print(f"✓ Inserted large batch of {batch_size} vectors")
        print(f"✓ Storage size: {storage.size}")
        
        # Test multiple queries
        await storage.query_start()
        
        num_queries = 5
        query_embeddings = [
            np.random.rand(256).astype(np.float32) for _ in range(num_queries)
        ]
        
        knn_ids, knn_scores = await storage.get_knn(query_embeddings, top_k=10)
        knn_ids_list = list(knn_ids)
        knn_scores_list = list(knn_scores)
        
        print(f"✓ Multi-query returned results for {len(knn_ids_list)} queries")
        
        for i, (ids_batch, scores_batch) in enumerate(zip(knn_ids_list, knn_scores_list)):
            if i < 2:  # Only print first 2 for brevity
                print(f"  Query {i+1}: {len(ids_batch)} results, best score: {scores_batch[0] if scores_batch else 'N/A'}")
        
        await storage.query_done()
        return True
        
    except Exception as e:
        print(f"✗ Large batch test failed: {e}")
        traceback.print_exc()
        return False
    finally:
        try:
            await storage.delete_collection()
            print("✓ Large batch test collection cleaned up")
        except:
            pass
        storage.close()


async def test_configuration_options():
    """Test different configuration options."""
    print("\nTesting configuration options...")
    
    configs = [
        ("Cosine distance", QdrantVectorStorageConfig(
            collection_name="test_cosine",
            distance=qdrant_models.Distance.COSINE,
        )),
        ("Dot product distance", QdrantVectorStorageConfig(
            collection_name="test_dot",
            distance=qdrant_models.Distance.DOT,
        )),
        ("Euclidean distance", QdrantVectorStorageConfig(
            collection_name="test_euclidean", 
            distance=qdrant_models.Distance.EUCLID,
        )),
    ]
    
    successful_configs = 0
    
    for config_name, config in configs:
        try:
            storage = QdrantVectorStorage(
                config=config,
                embedding_dim=32,
            )
            
            await storage.insert_start()
            
            # Small test insertion
            ids = ["test1", "test2"]
            embeddings = [
                np.random.rand(32).astype(np.float32),
                np.random.rand(32).astype(np.float32),
            ]
            
            await storage.upsert(ids, embeddings)
            await storage.insert_done()
            
            # Quick query test
            await storage.query_start()
            query_embedding = [embeddings[0]]
            knn_ids, knn_scores = await storage.get_knn(query_embedding, top_k=1)
            await storage.query_done()
            
            print(f"✓ {config_name} configuration works")
            successful_configs += 1
            
            await storage.delete_collection()
            storage.close()
            
        except Exception as e:
            print(f"✗ {config_name} configuration failed: {e}")
    
    print(f"✓ {successful_configs}/{len(configs)} configurations successful")
    return successful_configs == len(configs)


async def run_all_tests():
    """Run all tests."""
    print("QdrantVectorStorage Implementation Tests")
    print("=" * 50)
    
    # Check server connection first
    if not await test_qdrant_connection():
        return False
    
    tests = [
        ("Basic Operations", test_basic_operations),
        ("Empty Collection Operations", test_empty_operations), 
        ("Large Batch Operations", test_large_batch),
        ("Configuration Options", test_configuration_options),
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        print(f"\n{'-' * 30}")
        print(f"Running: {test_name}")
        print(f"{'-' * 30}")
        
        try:
            if await test_func():
                passed += 1
                print(f"✓ {test_name} PASSED")
            else:
                print(f"✗ {test_name} FAILED")
        except Exception as e:
            print(f"✗ {test_name} FAILED with exception: {e}")
            traceback.print_exc()
    
    print(f"\n{'=' * 50}")
    print(f"Test Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests passed! QdrantVectorStorage implementation is working correctly.")
        return True
    else:
        print("❌ Some tests failed. Please check the issues above.")
        return False


if __name__ == "__main__":
    success = asyncio.run(run_all_tests())
    sys.exit(0 if success else 1)
