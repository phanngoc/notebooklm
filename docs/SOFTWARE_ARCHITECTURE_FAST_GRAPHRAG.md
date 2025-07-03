# Tài Liệu Kiến Trúc Phần Mềm - Fast GraphRAG

## 1. Tổng Quan Hệ Thống

Fast GraphRAG là một hệ thống Graph-based Retrieval-Augmented Generation được thiết kế để xử lý và truy vấn thông tin từ tài liệu thông qua việc xây dựng knowledge graph. Hệ thống tích hợp thuật toán trích xuất thực thể, vector embedding và graph reasoning để cung cấp khả năng trả lời câu hỏi chính xác và có ngữ cảnh.

### 1.1 Mục Tiêu Thiết Kế

- **Khả năng mở rộng**: Hỗ trợ multiple storage backends (Qdrant, Redis, Neo4j)
- **Hiệu suất cao**: Xử lý bất đồng bộ với throttling và batching
- **Linh hoạt**: Generic type system cho tùy chỉnh entity/relation types
- **Tích hợp AI**: Seamless integration với LLM services (OpenAI, custom)

## 2. Kiến Trúc Tổng Thể

```mermaid
graph TB
    subgraph "Application Layer"
        A[GraphRAG API] --> B[BaseGraphRAG]
        B --> C[Query Processing]
        B --> D[Document Insertion]
    end

    subgraph "Service Layer"
        E[ChunkingService] --> F[InformationExtractionService]
        F --> G[StateManagerService]
        G --> H[Storage Orchestration]
    end

    subgraph "Storage Layer"
        I[VectorStorage<br/>Qdrant/HNSW] 
        J[GraphStorage<br/>Neo4j/iGraph]
        K[KeyValueStorage<br/>Redis/Pickle]
        L[BlobStorage<br/>Pickle]
    end

    subgraph "AI/ML Layer"
        M[LLM Service<br/>OpenAI/Custom]
        N[Embedding Service<br/>text-embedding-ada-002]
        O[Entity Extraction]
        P[Relationship Extraction]
    end

    C --> G
    D --> E
    E --> F
    F --> G
    G --> I
    G --> J
    G --> K
    G --> L
    F --> M
    F --> N
    O --> M
    P --> M
    N --> I
```

## 3. Kiến Trúc Chi Tiết Các Thành Phần

### 3.1 Type System Architecture

```mermaid
classDiagram
    class GTNode {
        <<TypeVar>>
        +name: Any
        +to_dict() Dict[str, Any]
    }
    
    class GTEdge {
        <<TypeVar>>
        +source: Any
        +target: Any
        +to_attrs() Dict[str, Any]
    }
    
    class TEntity {
        +name: str
        +type: str
        +description: str
        +to_str() str
    }
    
    class TRelation {
        +source: str
        +target: str
        +description: str
        +chunks: List[THash]
        +to_attrs() Dict[str, Any]
    }
    
    class TChunk {
        +id: THash
        +content: str
        +metadata: Dict[str, Any]
    }
    
    GTNode <|-- TEntity
    GTEdge <|-- TRelation
    BTChunk <|-- TChunk
```

### 3.2 Service Layer Architecture

#### 3.2.1 Chunking Service

**Thuật toán Text Splitting:**

Sử dụng hierarchical text splitting với overlap:

```
Text → Split by separators → Merge with overlap → Extract chunks
```

**Công thức toán học:**

Cho một văn bản T có độ dài n, chunk size s, overlap o:
- Số chunk ≈ ⌈(n-o)/(s-o)⌉
- Chunk i: [i×(s-o), i×(s-o)+s]
- Overlap region: [i×(s-o), i×(s-o)+o]

```mermaid
graph LR
    A[Input Text] --> B[Regex Split by Separators]
    B --> C[Calculate Chunk Boundaries]
    C --> D[Apply Overlap Logic]
    D --> E[Generate TChunk Objects]
    E --> F[Hash-based Deduplication]
```

#### 3.2.2 Information Extraction Service

**Thuật toán Entity-Relationship Extraction:**

```mermaid
sequenceDiagram
    participant IE as InfoExtraction
    participant LLM as LLM Service
    participant G as Graph Storage
    
    IE->>LLM: Extract entities,relations from chunk
    LLM-->>IE: Initial graph
    
    loop Gleaning Process (max_steps)
        IE->>LLM: Refine extraction
        LLM-->>IE: Updated graph
        alt Status done
            break
        end
    end
    
    IE->>G: Merge graphs
    G-->>IE: Final knowledge graph
```

**Công thức Gleaning:**

Gleaning score = Σ(entity_confidence × relation_confidence) / total_entities

Dừng khi: gleaning_score > threshold hoặc steps > max_gleaning_steps

#### 3.2.3 State Manager Service

**Thuật toán Vector Similarity Search:**

```math
similarity(q, e_i) = \frac{q \cdot e_i}{||q|| \cdot ||e_i||}
```

Trong đó:
- q: query embedding vector
- e_i: entity embedding vector i
- Cosine similarity được sử dụng

**Graph-based Entity Scoring:**

```math
score_{final}(e_i) = \alpha \cdot score_{vector}(e_i) + \beta \cdot score_{graph}(e_i)
```

Với:
- α, β: weight parameters
- score_vector: cosine similarity score
- score_graph: PageRank-based score

```mermaid
graph TD
    A[Query Processing] --> B[Vector Similarity Search]
    B --> C[Entity Scoring]
    C --> D[Graph-based Propagation]
    D --> E[Relationship Scoring]
    E --> F[Chunk Retrieval]
    F --> G[Context Assembly]
```

## 4. Storage Layer Architecture

### 4.1 Multi-Backend Storage Strategy

```mermaid
graph TB
    subgraph "Storage Abstraction Layer"
        A[BaseVectorStorage]
        B[BaseGraphStorage] 
        C[BaseIndexedKeyValueStorage]
        D[BaseBlobStorage]
    end
    
    subgraph "Production Backends"
        E[QdrantVectorStorage]
        F[Neo4jGraphStorage]
        G[RedisIndexedKVStorage]
    end
    
    subgraph "Development Backends"
        H[HNSWVectorStorage]
        I[iGraphStorage]
        J[PickleIndexedKVStorage]
        K[PickleBlobStorage]
    end
    
    A --> E
    A --> H
    B --> F
    B --> I
    C --> G
    C --> J
    D --> K
```

### 4.2 Vector Storage Implementation (Qdrant)

**Thuật toán Upsert với Batch Processing:**

```python
def batch_upsert(vectors, batch_size=100):
    for i in range(0, len(vectors), batch_size):
        batch = vectors[i:i+batch_size]
        qdrant_client.upsert(batch)
```

**Vector Search Algorithm:**

```math
\text{Search}(q, k, \tau) = \{v_i \mid similarity(q, v_i) \geq \tau\}_{top-k}
```

```mermaid
sequenceDiagram
    participant C as Client
    participant Q as QdrantStorage
    participant QC as QdrantClient
    
    C->>Q: upsert(ids, embeddings, metadata)
    Q->>Q: Validate input lengths
    Q->>Q: Convert GTId to Qdrant ID
    Q->>Q: Prepare PointStruct objects
    
    loop Batch Processing
        Q->>QC: upsert_batch(points)
        QC-->>Q: Success/Error
    end
    
    Q-->>C: Upsert complete
```

### 4.3 Graph Storage Implementation (Neo4j)

**PageRank Algorithm cho Node Scoring:**

```math
PR(n) = \frac{1-d}{N} + d \sum_{m \in M(n)} \frac{PR(m)}{L(m)}
```

Trong đó:
- d: damping factor (0.85)
- N: total number of nodes
- M(n): set of nodes linking to n
- L(m): number of outbound links from m

```mermaid
graph LR
    A[Node Insertion] --> B[Create Cypher Query]
    B --> C[Execute in Neo4j]
    C --> D[Update Node Mapping]
    
    E[Edge Insertion] --> F[Validate Source/Target]
    F --> G[Create Relationship]
    G --> H[Update Edge Mapping]
    
    I[PageRank Calculation] --> J[CALL gds.pageRank.stream]
    J --> K[Return Sparse Matrix]
```

## 5. Query Processing Pipeline

### 5.1 Multi-stage Query Processing

```mermaid
graph TD
    A[User Query] --> B[Entity Extraction from Query]
    B --> C[Vector Similarity Search]
    C --> D[Entity Scoring & Ranking]
    D --> E[Graph-based Score Propagation]
    E --> F[Relationship Scoring]
    F --> G[Chunk Retrieval & Scoring]
    G --> H[Context Assembly]
    H --> I[LLM Response Generation]
```

### 5.2 Context Assembly Algorithm

**Token Budget Management:**

```math
\begin{align}
Budget_{total} &= entities_{max} + relations_{max} + chunks_{max} \\
entities_{selected} &= \{e_i \mid score(e_i) \geq \tau_e\}_{top-k_e} \\
relations_{selected} &= \{r_j \mid score(r_j) \geq \tau_r\}_{top-k_r} \\
chunks_{selected} &= \{c_k \mid score(c_k) \geq \tau_c\}_{top-k_c}
\end{align}
```

**Context Ranking Formula:**

```math
score_{context}(item) = w_1 \cdot score_{relevance} + w_2 \cdot score_{diversity} + w_3 \cdot score_{freshness}
```

## 6. Concurrency & Performance Architecture

### 6.1 Async Processing với Throttling

```python
@throttle_async_func_call(max_concurrent=2048, stagger_time=0.001)
async def process_chunk(chunk):
    # Processing logic
    pass
```

**Semaphore-based Concurrency Control:**

```math
Throughput = \min\left(\frac{N_{workers}}{T_{avg}}, Rate_{limit}\right)
```

### 6.2 Memory Management Strategy

```mermaid
graph LR
    A[Sparse Matrix Operations] --> B[CSR Matrix Format]
    B --> C[Memory-efficient Indexing]
    C --> D[Batch Processing]
    D --> E[Garbage Collection Optimization]
```

## 7. Error Handling & Resilience

### 7.1 Storage Error Recovery

```mermaid
stateDiagram-v2
    [*] --> Normal
    Normal --> Error: Exception
    Error --> Retry: Retryable Error
    Error --> Fallback: Non-retryable Error
    Retry --> Normal: Success
    Retry --> Fallback: Max Retries
    Fallback --> [*]: Graceful Degradation
```

### 7.2 Data Consistency Strategy

**ACID Properties cho Graph Operations:**

- **Atomicity**: Batch operations với transaction support
- **Consistency**: Schema validation cho entities/relations
- **Isolation**: Read-after-write consistency
- **Durability**: Persistent storage với backup mechanisms

## 8. Metrics & Monitoring

### 8.1 Performance Metrics

```math
\begin{align}
Precision &= \frac{TP}{TP + FP} \\
Recall &= \frac{TP}{TP + FN} \\
F1 &= \frac{2 \cdot Precision \cdot Recall}{Precision + Recall} \\
Latency_{p95} &= \text{95th percentile of response times}
\end{align}
```

### 8.2 System Health Monitoring

```mermaid
graph TB
    A[Storage Metrics] --> D[Dashboard]
    B[Query Performance] --> D
    C[LLM API Metrics] --> D
    
    A1[Vector DB Size] --> A
    A2[Graph Nodes/Edges] --> A
    A3[Cache Hit Rate] --> A
    
    B1[Query Latency] --> B
    B2[Similarity Scores] --> B
    B3[Context Quality] --> B
    
    C1[Token Usage] --> C
    C2[API Rate Limits] --> C
    C3[Error Rates] --> C
```

## 9. Deployment Architecture

### 9.1 Production Deployment

```mermaid
graph TB
    subgraph "Load Balancer"
        LB[NGINX/HAProxy]
    end
    
    subgraph "Application Tier"
        A1[GraphRAG Instance 1]
        A2[GraphRAG Instance 2]
        A3[GraphRAG Instance N]
    end
    
    subgraph "Storage Tier"
        V[Qdrant Cluster]
        G[Neo4j Cluster]
        R[Redis Cluster]
    end
    
    subgraph "AI Services"
        LLM[OpenAI API]
        EMB[Embedding Service]
    end
    
    LB --> A1
    LB --> A2
    LB --> A3
    
    A1 --> V
    A1 --> G
    A1 --> R
    A1 --> LLM
    A1 --> EMB
    
    A2 --> V
    A2 --> G
    A2 --> R
    
    A3 --> V
    A3 --> G
    A3 --> R
```

## 10. Tối Ưu Hóa & Tuning

### 10.1 Vector Search Optimization

**HNSW Parameters Tuning:**

```math
\begin{align}
M &= \text{max connections per node} \\
ef_{construction} &= \text{size of dynamic candidate list} \\
ef_{search} &= \text{size of search candidate list} \\
\text{Recall} &\propto ef_{search} \\
\text{Build Time} &\propto ef_{construction}
\end{align}
```

### 10.2 Graph Traversal Optimization

**Personalized PageRank với Restart Probability:**

```math
PR_{\text{personalized}}(n) = \alpha \cdot \text{restart\_prob} + (1-\alpha) \sum_{m \in M(n)} \frac{PR_{\text{personalized}}(m)}{L(m)}
```

## 11. Security Considerations

### 11.1 Data Privacy & Security

```mermaid
graph LR
    A[Input Data] --> B[Sanitization]
    B --> C[Encryption at Rest]
    C --> D[Access Control]
    D --> E[Audit Logging]
    
    F[API Keys] --> G[Secure Storage]
    G --> H[Rotation Policy]
    H --> I[Environment Isolation]
```

### 11.2 LLM Security

- **Prompt Injection Prevention**
- **Output Sanitization**
- **Rate Limiting per User**
- **Content Filtering**

## 12. Kết Luận

Fast GraphRAG cung cấp một kiến trúc scalable và flexible cho việc xây dựng knowledge graph từ documents và thực hiện intelligent querying. Hệ thống được thiết kế với:

- **Modularity**: Component-based architecture
- **Extensibility**: Plugin-based storage backends
- **Performance**: Async processing với intelligent caching
- **Reliability**: Comprehensive error handling và monitoring

Kiến trúc này cho phép hệ thống xử lý large-scale document collections while maintaining query performance và accuracy cao thông qua việc kết hợp vector similarity search với graph-based reasoning.
