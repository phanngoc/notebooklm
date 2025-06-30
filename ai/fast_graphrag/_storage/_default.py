__all__ = [
    "DefaultVectorStorage",
    "DefaultVectorStorageConfig",
    "DefaultBlobStorage",
    "DefaultIndexedKeyValueStorage",
    "DefaultGraphStorage",
    "DefaultGraphStorageConfig",
    "Neo4jGraphStorage",
    "Neo4jGraphStorageConfig",
]

from fast_graphrag._storage._blob_pickle import PickleBlobStorage
from fast_graphrag._storage._gdb_igraph import IGraphStorage, IGraphStorageConfig
from fast_graphrag._storage._gdb_neo4j import Neo4jStorage, Neo4jStorageConfig
from fast_graphrag._storage._ikv_pickle import PickleIndexedKeyValueStorage
from fast_graphrag._storage._vdb_hnswlib import HNSWVectorStorage, HNSWVectorStorageConfig
from fast_graphrag._types import GTBlob, GTEdge, GTEmbedding, GTId, GTKey, GTNode, GTValue


# Storage
class DefaultVectorStorage(HNSWVectorStorage[GTId, GTEmbedding]):
    pass
class DefaultVectorStorageConfig(HNSWVectorStorageConfig):
    pass
class DefaultBlobStorage(PickleBlobStorage[GTBlob]):
    pass
class DefaultIndexedKeyValueStorage(PickleIndexedKeyValueStorage[GTKey, GTValue]):
    pass
class DefaultGraphStorage(IGraphStorage[GTNode, GTEdge, GTId]):
    pass
class DefaultGraphStorageConfig(IGraphStorageConfig[GTNode, GTEdge]):
    pass
class Neo4jGraphStorage(Neo4jStorage[GTNode, GTEdge, GTId]):
    pass
class Neo4jGraphStorageConfig(Neo4jStorageConfig[GTNode, GTEdge]):
    pass
