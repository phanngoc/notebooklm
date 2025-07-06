import json
import pickle
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Union, Any

import numpy as np
import numpy.typing as npt
import redis
from redis.connection import ConnectionPool

from fast_graphrag._exceptions import InvalidStorageError
from fast_graphrag._types import GTKey, GTValue, TIndex
from fast_graphrag._utils import logger

from ._base import BaseIndexedKeyValueStorage


@dataclass
class RedisIndexedKeyValueStorage(BaseIndexedKeyValueStorage[GTKey, GTValue]):
    """Redis-based implementation of indexed key-value storage for fast-graphrag"""
    
    # Redis connection parameters
    redis_host: str = field(default="localhost")
    redis_port: int = field(default=6379)
    redis_db: int = field(default=0)
    redis_password: Optional[str] = field(default=None)
    redis_prefix: str = field(default="graphrag")
    
    # Internal fields
    _redis_client: Optional[redis.Redis] = field(init=False, default=None)
    _connection_pool: Optional[ConnectionPool] = field(init=False, default=None)
    _key_to_index: Dict[GTKey, TIndex] = field(init=False, default_factory=dict)
    _free_indices: List[TIndex] = field(init=False, default_factory=list)
    _np_keys: Optional[npt.NDArray[np.object_]] = field(init=False, default=None)
    _max_index: int = field(init=False, default=0)

    def __post_init__(self):
        """Initialize Redis connection after dataclass initialization"""
        self._initialize_redis()

    def _initialize_redis(self):
        """Initialize Redis connection pool and client"""
        try:
            # Create connection pool for better performance
            self._connection_pool = ConnectionPool(
                host=self.redis_host,
                port=self.redis_port,
                db=self.redis_db,
                password=self.redis_password,
                decode_responses=False,  # We'll handle encoding ourselves
                max_connections=10
            )
            
            # Create Redis client
            self._redis_client = redis.Redis(connection_pool=self._connection_pool)
            
            # Test connection
            self._redis_client.ping()
            logger.info(f"Connected to Redis at {self.redis_host}:{self.redis_port}")
            
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            raise InvalidStorageError(f"Redis connection failed: {e}")

    def _get_data_key(self, index: TIndex) -> str:
        """Generate Redis key for data storage"""
        namespace_key = self.namespace.namespace if self.namespace else "default"
        return f"{self.redis_prefix}:data:{namespace_key}:{index}"

    def _get_metadata_key(self) -> str:
        """Generate Redis key for metadata storage"""
        namespace_key = self.namespace.namespace if self.namespace else "default"
        return f"{self.redis_prefix}:meta:{namespace_key}"

    def _get_key_index_key(self) -> str:
        """Generate Redis key for key-to-index mapping"""
        namespace_key = self.namespace.namespace if self.namespace else "default"
        return f"{self.redis_prefix}:key_index:{namespace_key}"

    def _serialize_value(self, value: GTValue) -> bytes:
        """Serialize value for Redis storage"""
        try:
            return pickle.dumps(value)
        except Exception as e:
            logger.error(f"Failed to serialize value: {e}")
            raise InvalidStorageError(f"Serialization failed: {e}")

    def _deserialize_value(self, data: bytes) -> GTValue:
        """Deserialize value from Redis storage"""
        try:
            return pickle.loads(data)
        except Exception as e:
            logger.error(f"Failed to deserialize value: {e}")
            raise InvalidStorageError(f"Deserialization failed: {e}")

    def _serialize_key(self, key: GTKey) -> str:
        """Serialize key for Redis hash field"""
        if isinstance(key, str):
            return key
        return json.dumps(key, default=str)

    def _deserialize_key(self, key_str: str) -> GTKey:
        """Deserialize key from Redis hash field"""
        try:
            return json.loads(key_str)
        except (json.JSONDecodeError, TypeError):
            return key_str

    async def size(self) -> int:
        """Get the number of stored items"""
        try:
            key_index_key = self._get_key_index_key()
            return self._redis_client.hlen(key_index_key)
        except Exception as e:
            logger.error(f"Failed to get size: {e}")
            return 0

    async def get(self, keys: Iterable[GTKey]) -> Iterable[Optional[GTValue]]:
        """Get values by keys"""
        results = []
        try:
            # Get indices for keys
            indices = await self.get_index(keys)
            
            # Get values by indices
            for index in indices:
                if index is not None:
                    data_key = self._get_data_key(index)
                    data = self._redis_client.get(data_key)
                    if data:
                        results.append(self._deserialize_value(data))
                    else:
                        results.append(None)
                else:
                    results.append(None)
            
        except Exception as e:
            logger.error(f"Failed to get values: {e}")
            results = [None] * len(list(keys))
        
        return results

    async def get_by_index(self, indices: Iterable[TIndex]) -> Iterable[Optional[GTValue]]:
        """Get values by indices"""
        results = []
        try:
            print(f"get_by_index:indices:", indices)
            for index in indices:
                data_key = self._get_data_key(index)
                data = self._redis_client.get(data_key)
                print(f"get_by_index:data_key:{data_key}, data:", data)
                if data:
                    results.append(self._deserialize_value(data))
                else:
                    results.append(None)
        except Exception as e:
            logger.error(f"Failed to get values by index: {e}")
            results = [None] * len(list(indices))
        
        return results

    async def get_index(self, keys: Iterable[GTKey]) -> Iterable[Optional[TIndex]]:
        """Get indices for keys"""
        results = []
        try:
            key_index_key = self._get_key_index_key()
            
            for key in keys:
                serialized_key = self._serialize_key(key)
                index_data = self._redis_client.hget(key_index_key, serialized_key)
                if index_data:
                    results.append(TIndex(int(index_data)))
                else:
                    results.append(None)
        except Exception as e:
            logger.error(f"Failed to get indices: {e}")
            results = [None] * len(list(keys))
        
        return results

    async def upsert(self, keys: Iterable[GTKey], values: Iterable[GTValue]) -> None:
        """Insert or update key-value pairs"""
        try:
            key_index_key = self._get_key_index_key()
            metadata_key = self._get_metadata_key()
            
            # Load metadata
            await self._load_metadata()
            
            pipe = self._redis_client.pipeline()
            
            for key, value in zip(keys, values):
                serialized_key = self._serialize_key(key)
                
                # Check if key already exists
                existing_index = self._key_to_index.get(key)
                
                if existing_index is None:
                    # Assign new index
                    if self._free_indices:
                        index = self._free_indices.pop()
                    else:
                        index = TIndex(self._max_index)
                        self._max_index += 1
                    
                    self._key_to_index[key] = index
                    
                    # Update key-to-index mapping in Redis
                    pipe.hset(key_index_key, serialized_key, str(index))
                    
                    # Invalidate cache
                    self._np_keys = None
                else:
                    index = existing_index
                
                # Store value
                data_key = self._get_data_key(index)
                serialized_value = self._serialize_value(value)
                pipe.set(data_key, serialized_value)
            
            # Save metadata
            pipe.hset(metadata_key, "max_index", str(self._max_index))
            pipe.hset(metadata_key, "free_indices", pickle.dumps(self._free_indices))
            
            # Execute pipeline
            pipe.execute()
            
        except Exception as e:
            logger.error(f"Failed to upsert: {e}")
            raise InvalidStorageError(f"Upsert failed: {e}")

    async def delete(self, keys: Iterable[GTKey]) -> None:
        """Delete keys and their values"""
        try:
            key_index_key = self._get_key_index_key()
            metadata_key = self._get_metadata_key()
            
            # Load metadata
            await self._load_metadata()
            
            pipe = self._redis_client.pipeline()
            
            for key in keys:
                serialized_key = self._serialize_key(key)
                
                # Get index for key
                index = self._key_to_index.get(key)
                if index is not None:
                    # Remove from key-to-index mapping
                    pipe.hdel(key_index_key, serialized_key)
                    
                    # Delete data
                    data_key = self._get_data_key(index)
                    pipe.delete(data_key)
                    
                    # Add index to free list
                    self._free_indices.append(index)
                    
                    # Remove from local cache
                    del self._key_to_index[key]
                    
                    # Invalidate cache
                    self._np_keys = None
                else:
                    logger.warning(f"Key '{key}' not found in indexed key-value storage.")
            
            # Save updated metadata
            pipe.hset(metadata_key, "free_indices", pickle.dumps(self._free_indices))
            
            # Execute pipeline
            pipe.execute()
            
        except Exception as e:
            logger.error(f"Failed to delete: {e}")
            raise InvalidStorageError(f"Delete failed: {e}")

    async def mask_new(self, keys: Iterable[GTKey]) -> Iterable[bool]:
        """Return mask indicating which keys are new (not in storage)"""
        keys = list(keys)
        
        if len(keys) == 0:
            return np.array([], dtype=bool)

        try:
            # Load current keys if not cached
            if self._np_keys is None:
                await self._load_metadata()
                if self._key_to_index:
                    self._np_keys = np.fromiter(
                        self._key_to_index.keys(),
                        count=len(self._key_to_index),
                        dtype=type(keys[0]) if keys else object,
                    )
                else:
                    self._np_keys = np.array([], dtype=object)
            
            if len(self._np_keys) == 0:
                return np.ones(len(keys), dtype=bool)
            
            keys_array = np.array(keys, dtype=type(keys[0]))
            return ~np.isin(keys_array, self._np_keys)
            
        except Exception as e:
            logger.error(f"Failed to create new mask: {e}")
            return np.ones(len(keys), dtype=bool)

    async def _load_metadata(self):
        """Load metadata from Redis"""
        try:
            key_index_key = self._get_key_index_key()
            metadata_key = self._get_metadata_key()
            
            # Load key-to-index mapping
            key_index_data = self._redis_client.hgetall(key_index_key)
            self._key_to_index = {}
            for key_str, index_str in key_index_data.items():
                key = self._deserialize_key(key_str.decode())
                self._key_to_index[key] = TIndex(int(index_str))
            
            # Load metadata
            max_index_data = self._redis_client.hget(metadata_key, "max_index")
            if max_index_data:
                self._max_index = int(max_index_data)
            else:
                self._max_index = len(self._key_to_index)
            
            free_indices_data = self._redis_client.hget(metadata_key, "free_indices")
            if free_indices_data:
                self._free_indices = pickle.loads(free_indices_data)
            else:
                self._free_indices = []
            
            logger.debug(f"Loaded {len(self._key_to_index)} keys from Redis storage")
            
        except Exception as e:
            logger.error(f"Failed to load metadata: {e}")
            self._key_to_index = {}
            self._free_indices = []
            self._max_index = 0

    async def _save_metadata(self):
        """Save metadata to Redis"""
        try:
            metadata_key = self._get_metadata_key()
            
            pipe = self._redis_client.pipeline()
            pipe.hset(metadata_key, "max_index", str(self._max_index))
            pipe.hset(metadata_key, "free_indices", pickle.dumps(self._free_indices))
            pipe.execute()
            
            logger.debug(f"Saved metadata to Redis storage")
            
        except Exception as e:
            logger.error(f"Failed to save metadata: {e}")
            raise InvalidStorageError(f"Metadata save failed: {e}")

    async def _insert_start(self):
        """Prepare storage for insertion"""
        await self._load_metadata()
        self._np_keys = None

    async def _insert_done(self):
        """Finalize insertion"""
        await self._save_metadata()

    async def _query_start(self):
        """Prepare storage for querying"""
        await self._load_metadata()
        self._np_keys = None

    async def _query_done(self):
        """Finalize querying"""
        pass

    def close(self):
        """Close Redis connection"""
        try:
            if self._redis_client:
                self._redis_client.close()
            if self._connection_pool:
                self._connection_pool.disconnect()
            logger.info("Redis connection closed")
        except Exception as e:
            logger.error(f"Error closing Redis connection: {e}")

    def clear_namespace(self):
        """Clear all data for the current namespace"""
        try:
            namespace_key = self.namespace.namespace if self.namespace else "default"
            pattern = f"{self.redis_prefix}:*:{namespace_key}*"
            
            # Find all keys matching the pattern
            keys = self._redis_client.keys(pattern)
            
            if keys:
                # Delete all keys
                self._redis_client.delete(*keys)
                logger.info(f"Cleared {len(keys)} keys from namespace {namespace_key}")
            
            # Clear local cache
            self._key_to_index = {}
            self._free_indices = []
            self._max_index = 0
            self._np_keys = None
            
        except Exception as e:
            logger.error(f"Failed to clear namespace: {e}")
            raise InvalidStorageError(f"Namespace clear failed: {e}")

    def get_stats(self) -> Dict[str, Any]:
        """Get storage statistics"""
        try:
            namespace_key = self.namespace.namespace if self.namespace else "default"
            pattern = f"{self.redis_prefix}:*:{namespace_key}*"
            
            keys = self._redis_client.keys(pattern)
            memory_usage = sum(self._redis_client.memory_usage(key) or 0 for key in keys)
            
            return {
                "total_keys": len(keys),
                "data_keys": len([k for k in keys if b":data:" in k]),
                "metadata_keys": len([k for k in keys if b":meta:" in k or b":key_index:" in k]),
                "memory_usage_bytes": memory_usage,
                "namespace": namespace_key,
                "redis_info": {
                    "host": self.redis_host,
                    "port": self.redis_port,
                    "db": self.redis_db
                }
            }
        except Exception as e:
            logger.error(f"Failed to get stats: {e}")
            return {"error": str(e)}
