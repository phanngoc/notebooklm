import grpc
from concurrent import futures
import os
import logging
import sys

# Add generated directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'generated'))

import chat_memory_pb2
import chat_memory_pb2_grpc
import graphrag_pb2
import graphrag_pb2_grpc

from openai import OpenAI
from mem0 import Memory
from dotenv import load_dotenv
from services.graphrag import GraphRAGService

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

# Initialize OpenAI client
openai_client = OpenAI()

# Initialize Memory with Qdrant config
config = {
    "vector_store": {
        "provider": "qdrant",
        "config": {
            "collection_name": "memories",
            "host": os.getenv("QDRANT_HOST", "localhost"),
            "port": int(os.getenv("QDRANT_PORT", "6333")),
        }
    }
}

m = Memory.from_config(config)

class ChatMemoryServicer(chat_memory_pb2_grpc.ChatMemoryServiceServicer):
    
    def ChatWithMemories(self, request, context):
        """Handle chat request with memory integration"""
        try:
            logger.info(f"Received chat request for user: {request.user_id}")
            
            # Retrieve relevant memories
            relevant_memories = m.search(
                query=request.message, 
                user_id=request.user_id, 
                limit=3
            )
            
            memories_list = []
            memories_str = ""
            
            if relevant_memories and "results" in relevant_memories:
                memories_list = [entry['memory'] for entry in relevant_memories["results"]]
                memories_str = "\n".join(f"- {memory}" for memory in memories_list)
                logger.info(f"Retrieved {len(memories_list)} memories for user {request.user_id}")
            
            # Combine context from the request (document context) with memories
            combined_context = ""
            if request.context:
                combined_context += f"Document Context:\n{request.context}\n\n"
            if memories_str:
                combined_context += f"User Memories:\n{memories_str}"
            
            # Create system prompt
            if combined_context:
                system_prompt = f"""You are a helpful AI assistant that answers questions based on the provided documents and user memories. 
Use the information from both the document context and user memories to provide comprehensive answers.
If the answer cannot be found in the provided context, say so clearly.
Be concise and accurate in your responses.

{combined_context}"""
            else:
                system_prompt = "You are a helpful AI assistant. Please answer the user's question to the best of your ability."
            
            # Generate AI response
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": request.message}
            ]
            
            response = openai_client.chat.completions.create(
                model="gpt-4o-mini", 
                messages=messages,
                temperature=0.7,
                max_tokens=1000
            )
            
            assistant_response = response.choices[0].message.content
            
            # Add new conversation to memories
            conversation = [
                {"role": "user", "content": request.message},
                {"role": "assistant", "content": assistant_response}
            ]
            
            # Add context information to the conversation for memory storage
            if request.context:
                conversation.insert(0, {
                    "role": "system", 
                    "content": f"Context from documents: {request.context[:500]}..."
                })
            
            m.add(conversation, user_id=request.user_id)
            logger.info(f"Added new memories for user {request.user_id}")
            
            return chat_memory_pb2.ChatResponse(
                response=assistant_response,
                relevant_memories=memories_list,
                success=True,
                error=""
            )
            
        except Exception as e:
            logger.error(f"Error in ChatWithMemories: {str(e)}")
            return chat_memory_pb2.ChatResponse(
                response="",
                relevant_memories=[],
                success=False,
                error=str(e)
            )
    
    def AddMemories(self, request, context):
        """Add memories to the system"""
        try:
            logger.info(f"Adding memories for user: {request.user_id}")
            logger.info(f"Received {len(request.messages)} messages to add")
            logger.info(f"Messages: {request.messages}")
            # Convert protobuf messages to dictionary format
            messages = []
            for msg in request.messages:
                messages.append({
                    "role": msg.role,
                    "content": msg.content
                })
            
            m.add(messages, user_id=request.user_id)
            
            return chat_memory_pb2.AddMemoriesResponse(
                success=True,
                error=""
            )
            
        except Exception as e:
            logger.error(f"Error in AddMemories: {str(e)}")
            return chat_memory_pb2.AddMemoriesResponse(
                success=False,
                error=str(e)
            )
    
    def SearchMemories(self, request, context):
        """Search for memories without generating a response"""
        try:
            logger.info(f"Searching memories for user: {request.user_id}")
            
            limit = request.limit if request.limit > 0 else 3
            relevant_memories = m.search(
                query=request.query,
                user_id=request.user_id,
                limit=limit
            )
            
            memories_list = []
            if relevant_memories and "results" in relevant_memories:
                memories_list = [entry['memory'] for entry in relevant_memories["results"]]
            
            return chat_memory_pb2.SearchResponse(
                memories=memories_list,
                success=True,
                error=""
            )
            
        except Exception as e:
            logger.error(f"Error in SearchMemories: {str(e)}")
            return chat_memory_pb2.SearchResponse(
                memories=[],
                success=False,
                error=str(e)
            )

# Initialize GraphRAG service
graphrag_service = GraphRAGService()

class GraphRAGServicer(graphrag_pb2_grpc.GraphRAGServiceServicer):
    
    def InsertContent(self, request, context):
        """Insert content into the knowledge graph"""
        try:
            logger.info(f"Received insert request for user: {request.user_id}")
            logger.info(f"Content length: {len(request.content)}")
            
            content = request.content
            # Insert content using the GraphRAG service
            result = graphrag_service.insert(
                content=content,
                user_id=request.user_id,
                project_id=request.project_id or "default"
            )
            
            return graphrag_pb2.InsertResponse(
                success=result['success'],
                error=result.get('error', '')
            )
            
        except Exception as e:
            logger.error(f"Error in InsertContent: {str(e)}")
            return graphrag_pb2.InsertResponse(
                success=False,
                error=str(e)
            )
    
    def QueryGraph(self, request, context):
        """Query the knowledge graph for relevant information"""
        try:
            logger.info(f"Received query request for user: {request.user_id}")
            logger.info(f"Query: {request.query}")
            
            # Query the graph using the GraphRAG service
            result = graphrag_service.query_graph(
                query=request.query,
                user_id=request.user_id,
                project_id=request.project_id or "default"
            )

            return graphrag_pb2.QueryResponse(
                response=result['response'],
                context=graphrag_pb2.GraphContext(),
                success=result['success'],
                error=result.get('error', '')
            )
            
        except Exception as e:
            logger.error(f"Error in QueryGraph: {str(e)}")
            return graphrag_pb2.QueryResponse(
                response="",
                entities=[],
                relationships=[],
                context=graphrag_pb2.GraphContext(),
                success=False,
                error=str(e)
            )


def serve():
    """Start the GraphRAG gRPC server"""
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    chat_memory_pb2_grpc.add_ChatMemoryServiceServicer_to_server(
        ChatMemoryServicer(), server
    )
    graphrag_pb2_grpc.add_GraphRAGServiceServicer_to_server(
        GraphRAGServicer(), server
    )
    
    listen_addr = '[::]:50052'  # Different port from chat memory service
    server.add_insecure_port(listen_addr)
    
    logger.info(f"Starting GraphRAG gRPC server on {listen_addr}")
    server.start()
    
    try:
        server.wait_for_termination()
    except KeyboardInterrupt:
        logger.info("Shutting down GraphRAG gRPC server...")
        server.stop(0)

if __name__ == '__main__':
    serve()