# Redis Integration for GraphRAG

## Tổng quan

File này mô tả cách tích hợp Redis vào hệ thống GraphRAG để cải thiện hiệu suất lưu trữ và truy xuất chunks của documents.

## Cấu trúc Implementation

### 1. RedisIndexedKeyValueStorage (`_ikv_redis.py`)

Đây là implementation Redis cho `BaseIndexedKeyValueStorage`, thay thế cho `PickleIndexedKeyValueStorage` mặc định.

**Tính năng chính:**
- Lưu trữ key-value pairs trong Redis với indexing
- Connection pooling để tối ưu hiệu suất
- Serialization/Deserialization tự động sử dụng pickle
- Namespace support để tách biệt data giữa các users/projects
- Metadata management cho indices và free slots
- Error handling và logging chi tiết

**Cấu trúc Redis keys:**
```
{prefix}:data:{namespace}:{index}     # Actual data storage
{prefix}:meta:{namespace}             # Metadata (max_index, free_indices)
{prefix}:key_index:{namespace}        # Key-to-index mapping
```

### 2. GraphRAG Service Integration (`graphrag.py`)

Service được cập nhật để hỗ trợ Redis:

**Thay đổi chính:**
- Thêm `use_redis` parameter trong constructor
- Redis configuration qua environment variables hoặc config dict
- Tự động fallback về default storage nếu Redis không available
- Connection management và cleanup

**Environment Variables:**
```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=your_password
```

## Cách sử dụng

### 1. Cài đặt Dependencies

```bash
pip install redis
```

### 2. Khởi tạo với Redis

```python
from services.graphrag import GraphRAGService

# Sử dụng Redis với cấu hình mặc định
service = GraphRAGService(use_redis=True)

# Sử dụng Redis với cấu hình tùy chỉnh
redis_config = {
    'host': 'localhost',
    'port': 6379,
    'db': 0,
    'password': 'your_password',
    'prefix': 'my_app_graphrag'
}

service = GraphRAGService(
    use_redis=True,
    redis_config=redis_config
)
```

### 3. Sử dụng bình thường

```python
# Insert documents
result = service.insert(
    content="Your document content here",
    user_id="user123",
    project_id="project456"
)

# Query graph
response = service.query_graph(
    query="What is this document about?",
    user_id="user123", 
    project_id="project456"
)
```

### 4. Monitoring và Statistics

```python
# Xem thông tin storage
storage_info = service.get_storage_info()
print(storage_info)

# Xem Redis statistics cho specific user/project
stats = service.get_redis_stats("user123", "project456")
print(stats)

# Clear Redis data cho specific user/project
result = service.clear_redis_data("user123", "project456")
```

## So sánh với Default Storage

| Feature | Default (Pickle) | Redis |
|---------|------------------|-------|
| Persistence | File system | In-memory + optional persistence |
| Performance | Slow I/O | Fast in-memory access |
| Scalability | Limited by disk | Highly scalable |
| Concurrent Access | File locking issues | Native concurrent support |
| Memory Usage | Low | Higher |
| Setup Complexity | None | Requires Redis server |

## Redis Configuration Best Practices

### 1. Memory Management
```redis
# redis.conf
maxmemory 2gb
maxmemory-policy allkeys-lru
```

### 2. Persistence
```redis
# RDB snapshots
save 900 1
save 300 10
save 60 10000

# AOF
appendonly yes
appendfsync everysec
```

### 3. Security
```redis
# Authentication
requirepass your_strong_password

# Disable dangerous commands
rename-command FLUSHDB ""
rename-command FLUSHALL ""
```

## Testing

Chạy test script để kiểm tra functionality:

```bash
cd ai/tests
python test_redis_graphrag.py
```

Test script sẽ:
1. Kiểm tra kết nối Redis
2. Test insert/query documents
3. Kiểm tra statistics và monitoring
4. So sánh performance với default storage
5. Test cleanup functionality

## Troubleshooting

### 1. Redis Connection Issues
```python
# Check Redis connection
import redis
r = redis.Redis(host='localhost', port=6379, db=0)
r.ping()  # Should return True
```

### 2. Memory Issues
```bash
# Check Redis memory usage
redis-cli info memory

# Clear specific keys
redis-cli --scan --pattern "graphrag:*" | xargs redis-cli del
```

### 3. Performance Issues
```bash
# Monitor Redis performance
redis-cli monitor

# Check slow queries
redis-cli slowlog get 10
```

## Production Deployment

### 1. Redis Cluster
Cho production scale lớn, sử dụng Redis Cluster:

```python
from rediscluster import RedisCluster

startup_nodes = [
    {"host": "127.0.0.1", "port": "7000"},
    {"host": "127.0.0.1", "port": "7001"},
    {"host": "127.0.0.1", "port": "7002"},
]

# Modify RedisIndexedKeyValueStorage to use RedisCluster
```

### 2. Monitoring
Sử dụng tools như:
- Redis Sentinel cho high availability
- RedisInsight cho monitoring
- Prometheus + Grafana cho metrics

### 3. Backup Strategy
```bash
# Scheduled backups
0 2 * * * redis-cli --rdb /backup/dump-$(date +%Y%m%d).rdb
```

## API Extensions

### New Methods trong GraphRAGService:

```python
# Get Redis statistics
get_redis_stats(user_id, project_id) -> Dict[str, Any]

# Clear Redis data
clear_redis_data(user_id, project_id) -> Dict[str, Any]

# Get storage configuration info
get_storage_info() -> Dict[str, Any]
```

### RedisIndexedKeyValueStorage Methods:

```python
# Get storage statistics
get_stats() -> Dict[str, Any]

# Clear namespace data
clear_namespace() -> None

# Close connections
close() -> None
```

## Future Improvements

1. **Redis Streams**: Sử dụng cho real-time processing
2. **Redis Search**: Tích hợp full-text search capabilities
3. **Redis JSON**: Store complex objects natively
4. **Compression**: Implement compression cho large chunks
5. **Sharding**: Automatic sharding based on user/project
6. **Caching Layers**: Multi-level caching strategy
