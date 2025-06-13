# GraphRAG gRPC Service

A gRPC service for knowledge graph construction and querying using fast-graphrag library. This service enables document analysis, entity extraction, relationship discovery, and intelligent querying through graph-based retrieval augmented generation.

## Features

- **Document Insertion**: Process and insert documents into knowledge graphs
- **Intelligent Querying**: Query documents using natural language with graph-enhanced context
- **Entity Management**: Extract and manage entities from documents
- **Relationship Discovery**: Identify and track relationships between entities
- **Multi-user Support**: Isolated knowledge graphs per user/collection
- **gRPC Interface**: High-performance, language-agnostic API

## Architecture

```
┌─────────────────┐    gRPC     ┌─────────────────┐    ┌─────────────────┐
│   Client App    │ ◄────────► │ GraphRAG Server │ ◄──► │  fast-graphrag  │
└─────────────────┘             └─────────────────┘    └─────────────────┘
                                         │
                                         ▼
                                ┌─────────────────┐
                                │   File System   │
                                │   (Graph Data)  │
                                └─────────────────┘
```

## Installation

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Generate gRPC code (if needed):
```bash
python -m grpc_tools.protoc -I./proto --python_out=./generated --grpc_python_out=./generated ./proto/graphrag.proto
```

3. Create data directory:
```bash
mkdir -p ./data
```

## Usage

### Starting the Server

```bash
# Using the startup script
./start_graphrag_server.sh

# Or directly
python graphrag_grpc_server.py
```

The server will start on port `50052` by default.

### Client Examples

#### Python Client

```python
import grpc
import graphrag_pb2
import graphrag_pb2_grpc

# Connect to server
channel = grpc.insecure_channel('localhost:50052')
stub = graphrag_pb2_grpc.GraphRAGServiceStub(channel)

# Insert a document
document = graphrag_pb2.Document(
    id="doc_1",
    title="Company Report",
    content="TechCorp reported $100M revenue with 20% growth...",
    user_id="user_123"
)

insert_request = graphrag_pb2.InsertRequest(
    documents=[document],
    user_id="user_123",
    collection_name="business_docs"
)

response = stub.InsertDocuments(insert_request)

# Query the graph
query_request = graphrag_pb2.QueryRequest(
    query="What was TechCorp's revenue?",
    user_id="user_123",
    collection_name="business_docs"
)

query_response = stub.QueryGraph(query_request)
print(query_response.response)
```

#### Running Examples

```bash
# Test the service with sample data
python test_graphrag.py

# Run interactive client example
python graphrag_client_example.py
```

## API Reference

### Services

#### InsertDocuments
Insert documents into the knowledge graph.

**Request**: `InsertRequest`
- `documents`: List of documents to insert
- `user_id`: User identifier
- `collection_name`: Collection name (optional, defaults to "default")

**Response**: `InsertResponse`
- `success`: Boolean indicating success
- `error`: Error message if failed
- `document_ids`: List of successfully inserted document IDs

#### QueryGraph
Query the knowledge graph with natural language.

**Request**: `QueryRequest`
- `query`: Natural language query
- `user_id`: User identifier  
- `collection_name`: Collection name
- `max_results`: Maximum number of results (optional)
- `similarity_threshold`: Similarity threshold for filtering (optional)

**Response**: `QueryResponse`
- `response`: Generated response text
- `entities`: Relevant entities found
- `relationships`: Relevant relationships found
- `context`: Additional context information
- `success`: Boolean indicating success
- `error`: Error message if failed

#### GetEntities
Retrieve entities from the knowledge graph.

**Request**: `GetEntitiesRequest`
- `user_id`: User identifier
- `collection_name`: Collection name
- `entity_types`: Filter by entity types (optional)
- `limit`: Maximum number of entities to return

**Response**: `GetEntitiesResponse`
- `entities`: List of entities
- `success`: Boolean indicating success
- `error`: Error message if failed

#### GetRelationships
Retrieve relationships from the knowledge graph.

**Request**: `GetRelationshipsRequest`
- `user_id`: User identifier
- `collection_name`: Collection name
- `entity_id`: Filter by specific entity (optional)
- `relationship_types`: Filter by relationship types (optional)
- `limit`: Maximum number of relationships to return

**Response**: `GetRelationshipsResponse`
- `relationships`: List of relationships
- `success`: Boolean indicating success
- `error`: Error message if failed

#### BuildGraph
Build or rebuild the knowledge graph.

**Request**: `BuildGraphRequest`
- `user_id`: User identifier
- `collection_name`: Collection name
- `force_rebuild`: Whether to force a complete rebuild

**Response**: `BuildGraphResponse`
- `success`: Boolean indicating success
- `error`: Error message if failed
- `documents_processed`: Number of documents processed
- `entities_extracted`: Number of entities extracted
- `relationships_extracted`: Number of relationships extracted
- `build_time`: Time taken to build the graph

## Configuration

### Environment Variables

- `OPENAI_API_KEY`: Required for fast-graphrag LLM operations
- `GRAPHRAG_WORKING_DIR`: Base directory for graph data (default: `./data`)

### Domain Configuration

The service is pre-configured for business and financial document analysis with the following domain:

```
"Analyze documents to identify key information that affects business value, growth potential, and strategic insights. 
Focus on entities like companies, people, financial metrics, market trends, technologies, strategies, and their relationships."
```

### Entity Types

Pre-configured entity types:
- Company
- Person  
- Financial_Metric
- Market_Trend
- Technology
- Strategy
- Risk_Factor
- Product
- Location
- Industry
- Partnership
- Investment

## Data Storage

Each user/collection combination gets its own directory under the working directory:
```
./data/
├── user_123_default/
│   ├── graph_data/
│   └── embeddings/
└── user_456_business_docs/
    ├── graph_data/
    └── embeddings/
```

## Limitations

- **Entity/Relationship Access**: fast-graphrag doesn't directly expose entities and relationships, so `GetEntities` and `GetRelationships` methods have limited functionality
- **Metrics**: Exact counts of entities and relationships are not available from fast-graphrag
- **Persistence**: Graph data is stored on the file system; for production use, consider database backends

## Error Handling

All API methods return success/error indicators. Common error scenarios:
- Missing OpenAI API key
- Invalid user_id or collection_name
- File system permissions issues
- Network connectivity problems

## Performance Considerations

- Documents are processed sequentially during insertion
- Large documents may take time to process
- Consider batching document insertions for better performance
- Graph data is loaded on-demand per user/collection

## Development

### Project Structure

```
ai/
├── proto/
│   └── graphrag.proto          # Protocol buffer definitions
├── generated/
│   ├── graphrag_pb2.py         # Generated protobuf code
│   └── graphrag_pb2_grpc.py    # Generated gRPC code
├── services/
│   └── graphrag.py             # GraphRAG service implementation
├── graphrag_grpc_server.py     # gRPC server
├── test_graphrag.py            # Test script
├── graphrag_client_example.py  # Client example
└── start_graphrag_server.sh    # Startup script
```

### Adding New Features

1. Update `proto/graphrag.proto` with new service methods
2. Regenerate gRPC code
3. Implement new methods in `services/graphrag.py` 
4. Update the gRPC server in `graphrag_grpc_server.py`
5. Add tests and examples

## Troubleshooting

### Common Issues

**Server won't start**
- Check if port 50052 is available
- Verify OpenAI API key is set
- Check file permissions for data directory

**Documents not inserting**
- Verify document content is not empty
- Check available disk space
- Review server logs for detailed errors

**Queries returning empty results**
- Ensure documents have been inserted first
- Try different query phrasings
- Check if the collection name matches

**Performance issues**
- Monitor file system I/O
- Consider reducing document size
- Use appropriate similarity thresholds

For more detailed debugging, check the server logs which include detailed information about processing steps and any errors encountered.
