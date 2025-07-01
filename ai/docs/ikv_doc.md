# Pickle Indexed Key-Value Storage Algorithm

## Tổng quan

File `_ikv_pickle.py` triển khai một cấu trúc dữ liệu **Indexed Key-Value Storage** với khả năng quản lý bộ nhớ thông minh. Đây là một hệ thống lưu trữ phân tán sử dụng **free indices pool** để tối ưu hóa việc sử dụng bộ nhớ và tăng hiệu suất truy cập.

## Kiến trúc thuật toán

### 1. Cấu trúc dữ liệu chính

```mermaid
classDiagram
    class PickleIndexedKeyValueStorage {
        -Dict~TIndex,GTValue~ _data
        -Dict~GTKey,TIndex~ _key_to_index
        -List~TIndex~ _free_indices
        -NDArray _np_keys
        
        +upsert(keys, values)
        +delete(keys)
        +get(keys)
        +get_by_index(indices)
        +mask_new(keys)
    }
    
    class BaseIndexedKeyValueStorage {
        <<abstract>>
        +size()
        +get()
        +upsert()
        +delete()
    }
    
    PickleIndexedKeyValueStorage --|> BaseIndexedKeyValueStorage
```

### 2. Các thành phần chính

#### a) Mapping Structure
- **`_data`**: Ánh xạ từ chỉ số (index) đến giá trị
- **`_key_to_index`**: Ánh xạ từ key đến chỉ số
- **`_free_indices`**: Pool các chỉ số đã bị xóa, có thể tái sử dụng
- **`_np_keys`**: Cache numpy array để tối ưu operations

```mermaid
graph TD
    A[Key] --> B[_key_to_index]
    B --> C[Index]
    C --> D[_data]
    D --> E[Value]
    
    F[Deleted Indices] --> G[_free_indices]
    G --> H[Index Pool]
    H --> I[Reuse for new keys]
```

## Thuật toán chính

### 1. Upsert Operation

Thuật toán chèn/cập nhật với độ phức tạp **O(1)** trung bình:

```mermaid
flowchart TD
    A["upsert(keys, values)"] --> B["For each (key, value)"]
    B --> C{"key exists in _key_to_index?"}
    C -->|Yes| D["Get existing index"]
    C -->|No| E{"_free_indices not empty?"}
    E -->|Yes| F["index = _free_indices.pop()"]
    E -->|No| G["index = len(_data)"]
    F --> H["_key_to_index[key] = index"]
    G --> H
    D --> I["_data[index] = value"]
    H --> J["Invalidate _np_keys cache"]
    J --> I
```

**Công thức toán học:**

Độ phức tạp thời gian trung bình:
$$T_{upsert}(n) = O(1) \text{ per operation}$$

Độ phức tạp không gian:
$$S(n) = O(n) + O(f) + O(k)$$

Trong đó:
- $n$: số lượng elements trong `_data`
- $f$: số lượng free indices trong pool
- $k$: số lượng unique keys

### 2. Delete Operation

```mermaid
flowchart TD
    A["delete(keys)"] --> B["For each key"]
    B --> C{"key exists?"}
    C -->|Yes| D["index = _key_to_index.pop(key)"]
    C -->|No| E["Log warning"]
    D --> F["_free_indices.append(index)"]
    F --> G["_data.pop(index)"]
    G --> H["Invalidate _np_keys cache"]
    E --> I["Continue to next key"]
    H --> I
```

**Tính chất quan trọng:**
- Indices bị xóa được thêm vào `_free_indices` để tái sử dụng
- Không có memory fragmentation
- Cache invalidation đảm bảo consistency

### 3. Memory Management với Free Indices Pool

```mermaid
graph LR
    subgraph "Memory Layout"
        A[Index 0] --> A1[Value A]
        B[Index 1] --> B1[✗ Deleted]
        C[Index 2] --> C1[Value C]
        D[Index 3] --> D1[✗ Deleted]
        E[Index 4] --> E1[Value E]
    end
    
    subgraph "Free Indices Pool"
        F["_free_indices = [1, 3]"]
    end
    
    subgraph "New Insert"
        G[New Key] --> H[Reuse Index 1]
        H --> I[Value F]
    end
    
    F --> G
```

**Lợi ích của Free Indices Pool:**

1. **Memory Efficiency**: Tái sử dụng không gian đã giải phóng
2. **Cache Locality**: Indices không tăng vô tận
3. **Fragmentation Prevention**: Không có lỗ hổng trong memory layout

### 4. Mask New Algorithm

Thuật toán kiểm tra keys mới với **vectorized operations**:

```mermaid
flowchart TD
    A["mask_new(keys)"] --> B["Convert keys to list"]
    B --> C{"keys empty?"}
    C -->|Yes| D["Return empty boolean array"]
    C -->|No| E{"_np_keys cache exists?"}
    E -->|No| F["Build _np_keys from _key_to_index"]
    E -->|Yes| G["Use cached _np_keys"]
    F --> H["np.array(keys)"]
    G --> H
    H --> I["np.isin(keys_array, _np_keys)"]
    I --> J["Return ~result (invert mask)"]
```

**Công thức toán học:**

Cho tập keys đầu vào $K = \{k_1, k_2, ..., k_m\}$ và tập existing keys $E = \{e_1, e_2, ..., e_n\}$:

$$\text{mask}[i] = \begin{cases} 
\text{True} & \text{if } k_i \notin E \\
\text{False} & \text{if } k_i \in E 
\end{cases}$$

Độ phức tạp: $O(m + n)$ với numpy vectorization

## Persistence & Serialization

### 1. Pickle Serialization Strategy

```mermaid
sequenceDiagram
    participant App
    participant Storage
    participant FileSystem
    
    Note over App,FileSystem: Insert Mode
    App->>Storage: _insert_start()
    Storage->>FileSystem: Load existing pickle file
    FileSystem-->>Storage: (_data, _free_indices, _key_to_index)
    
    App->>Storage: upsert operations
    
    App->>Storage: _insert_done()
    Storage->>FileSystem: Save pickle file
    Note over Storage,FileSystem: pickle.dump((_data, _free_indices, _key_to_index))
    
    Note over App,FileSystem: Query Mode
    App->>Storage: _query_start()
    Storage->>FileSystem: Load pickle file
    FileSystem-->>Storage: Read-only access
```

### 2. State Transitions

```mermaid
stateDiagram-v2
    [*] --> Uninitialized
    Uninitialized --> InsertMode : _insert_start()
    Uninitialized --> QueryMode : _query_start()
    
    InsertMode --> InsertMode : upsert/delete operations
    InsertMode --> QueryMode : _query_start()
    InsertMode --> Persisted : _insert_done()
    
    QueryMode --> QueryMode : get operations
    QueryMode --> InsertMode : _insert_start()
    QueryMode --> [*] : _query_done()
    
    Persisted --> [*]
```

## Tối ưu hóa hiệu suất

### 1. Cache Strategy

**Numpy Keys Cache (`_np_keys`)**:
- Lazy loading: chỉ build khi cần thiết
- Invalidation: xóa cache khi có thay đổi structure
- Vectorized operations: tăng speed cho batch operations

**Công thức hiệu suất:**

Without cache: $O(m \times n)$ comparisons  
With cache: $O(m + n)$ với numpy vectorization

$$\text{Speedup} = \frac{m \times n}{m + n} \approx \frac{mn}{n} = m \text{ (when } m \ll n\text{)}$$

### 2. Space Complexity Analysis

**Memory Usage:**
- `_data`: $O(n)$ where $n$ = số elements hiện tại
- `_key_to_index`: $O(k)$ where $k$ = số unique keys
- `_free_indices`: $O(f)$ where $f$ = số deleted indices
- `_np_keys`: $O(k)$ cache

**Total Space**: $S = O(n + k + f) = O(n)$ (since $k \leq n$ và $f \leq n$)

### 3. Time Complexity Summary

| Operation | Average Case | Worst Case | Space |
|-----------|-------------|------------|-------|
| `upsert` | $O(1)$ | $O(1)$ | $O(1)$ |
| `delete` | $O(1)$ | $O(1)$ | $O(1)$ |
| `get` | $O(1)$ | $O(1)$ | $O(1)$ |
| `mask_new` | $O(m + n)$ | $O(m + n)$ | $O(m)$ |
| `size` | $O(1)$ | $O(1)$ | $O(1)$ |

## Ứng dụng trong GraphRAG

Trong hệ thống GraphRAG, storage này được sử dụng để:

1. **Entity Storage**: Lưu trữ các entities được extract từ documents
2. **Relationship Mapping**: Ánh xạ relationships giữa các entities  
3. **Embedding Cache**: Cache các vector embeddings đã compute
4. **Query Results**: Lưu trữ kết quả queries để tái sử dụng

```mermaid
graph TD
    A[Documents] --> B[Entity Extraction]
    B --> C[PickleIndexedKVStorage]
    C --> D[Graph Construction]
    D --> E[Query Engine]
    
    F[Embeddings] --> C
    G[Relationships] --> C
    H[Cached Results] --> C
```

## Best Practices

1. **Batch Operations**: Sử dụng batch upsert thay vì single operations
2. **Cache Management**: Để cache invalidation tự động xử lý
3. **Memory Monitoring**: Monitor size của `_free_indices` pool
4. **Persistence Strategy**: Thường xuyên persist data trong insert mode

---

*Thuật toán này đặc biệt hiệu quả cho workloads có pattern insert/delete/query frequency cao với yêu cầu persistence và memory efficiency.*
