# GraphRAG Integration

This document explains how the GraphRAG integration works in the NotebookLLM application.

## Overview

The GraphRAG (Graph-based Retrieval Augmented Generation) integration provides context-aware AI responses by building and querying a knowledge graph from uploaded documents. This approach offers more sophisticated context understanding compared to traditional vector search.

## Architecture

### Components

1. **GraphRAG gRPC Server** (`ai/grpc_server.py`): Python server that handles graph operations
2. **GraphRAG Client** (`lib/grpc-client.ts`): TypeScript client for communicating with the gRPC server
3. **API Endpoints**: Integration points in the Next.js application
4. **Fast-GraphRAG Service** (`ai/services/graphrag.py`): Core GraphRAG implementation

### Data Flow

1. **Document Upload**: When documents are uploaded via `/api/documents/process`
   - Document is saved to the database
   - Document content is processed for vector search (traditional approach)
   - Document content is also inserted into GraphRAG for knowledge graph building

2. **Chat Interaction**: When users ask questions via `/api/chat`
   - First attempts to get response from GraphRAG using `queryGraph`
   - Falls back to traditional vector search + OpenAI if GraphRAG fails
   - Stores conversation in chat memory for future context

## API Endpoints

### Chat with GraphRAG
```typescript
POST /api/chat
{
  "message": "What are the key factors driving business value?",
  "sourceIds": ["source-id-1", "source-id-2"],
  "sessionId": "session-id",
  "projectId": "project-id"
}
```

### Insert Content into GraphRAG
```typescript
POST /api/graphrag/insert
{
  "content": "Document content to insert into knowledge graph",
  "projectId": "project-id"
}
```

### Test GraphRAG Query
```typescript
POST /api/graphrag/test
{
  "query": "Test question about your documents",
  "projectId": "project-id"
}
```

## Environment Variables

Add these optional environment variables to configure gRPC servers:

```bash
# GraphRAG gRPC server address (default: localhost:50052)
GRAPHRAG_GRPC_ADDRESS=localhost:50052

# Chat Memory gRPC server address (default: localhost:50051)
CHAT_MEMORY_GRPC_ADDRESS=localhost:50051
```

## Starting the GraphRAG Server

### Method 1: Using the start script
```bash
cd ai
./start_graphrag_server.sh
```

### Method 2: Manual start
```bash
cd ai
python grpc_server.py
```

### Method 3: Using Docker
```bash
cd ai
docker build -t graphrag-server .
docker run -p 50052:50052 graphrag-server
```

## Features

### Knowledge Graph Building
- Automatically extracts entities and relationships from documents
- Focuses on business-relevant information (companies, people, financial metrics, strategies)
- Maintains separate graphs per user/project for isolation

### Context-Aware Responses
- Uses graph structure to understand relationships between concepts
- Provides more nuanced responses than simple similarity search
- Combines information from multiple related documents

### Fallback Mechanisms
- Falls back to vector search if GraphRAG is unavailable
- Continues to work even if gRPC server is down
- Graceful degradation of functionality

## Development

### Adding New Entity Types
Edit the `entity_types` list in `ai/services/graphrag.py`:

```python
self.entity_types = [
    "Company", "Person", "Financial_Metric", "Market_Trend", 
    "Technology", "Strategy", "Risk_Factor", "Product", 
    "Location", "Industry", "Partnership", "Investment",
    "YourNewEntityType"  # Add new types here
]
```

### Customizing the Domain
Edit the `domain` variable in `ai/services/graphrag.py` to focus on different types of analysis.

### Adding New gRPC Methods
1. Update the protobuf definition in `ai/proto/graphrag.proto`
2. Regenerate Python bindings: `cd ai && ./generate_proto.sh`
3. Implement the method in `ai/grpc_server.py`
4. Update the TypeScript client in `lib/grpc-client.ts`

## Monitoring and Debugging

### Logs
- gRPC server logs appear in the terminal where the server is running
- API endpoint logs appear in the Next.js development console
- Check browser network tab for gRPC client errors

### Testing
Use the test endpoint to verify GraphRAG is working:
```bash
curl -X POST http://localhost:3000/api/graphrag/test \
  -H "Content-Type: application/json" \
  -d '{"query": "test question", "projectId": "test-project"}'
```

### Common Issues
1. **gRPC Connection Failed**: Ensure the GraphRAG server is running on port 50052
2. **No Response from GraphRAG**: Check that documents have been inserted into the graph
3. **Memory Issues**: GraphRAG requires sufficient RAM for large document collections

## Performance Considerations

- GraphRAG performs better with larger document collections
- Initial graph building may take time for large documents
- Query performance improves as the graph grows
- Consider using background processing for large document uploads

## Security

- gRPC connections use insecure channels (suitable for local development)
- For production, implement TLS encryption
- User data is isolated by user_id and project_id
- No authentication is performed at the gRPC level (handled by the API layer)
