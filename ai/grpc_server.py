import grpc
from concurrent import futures
import os
import logging
import sys
import asyncio

# Add generated directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'generated'))

import chat_memory_pb2
import chat_memory_pb2_grpc
import graphrag_pb2
import graphrag_pb2_grpc
import google_drive_pb2
import google_drive_pb2_grpc

from openai import OpenAI
from mem0 import Memory
from dotenv import load_dotenv
from services.graphrag import GraphRAGService
from services.google_drive import GoogleDriveProcessor
from services.file_processor import file_processor

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
    
    def ProcessFile(self, request, context):
        """Process file from URL and insert into knowledge graph"""
        try:
            logger.info(f"Received file processing request for user: {request.user_id}")
            logger.info(f"File: {request.file_name} ({request.mime_type}) from {request.file_url}")
            
            # Process file using file processor with the new flow
            process_result = file_processor.process_file_from_url(
                file_url=request.file_url,
                file_name=request.file_name,
                mime_type=request.mime_type,
                project_id=request.project_id or "default"
            )
            
            if not process_result['success']:
                logger.error(f"File processing failed: {process_result['error']}")
                return graphrag_pb2.ProcessFileResponse(
                    success=False,
                    error=process_result['error'],
                    markdown_content='',
                    content_length=0
                )
            
            markdown_content = process_result['markdown_content']
            logger.info(f"File processed successfully. Content length: {process_result['content_length']} characters")
            
            # Step 4: Insert processed content into GraphRAG
            logger.info("Step 4: Indexing content into GraphRAG...")
            graphrag_result = graphrag_service.insert(
                content=markdown_content,
                user_id=request.user_id,
                project_id=request.project_id or "default"
            )
            
            # Check GraphRAG indexing result
            if not graphrag_result['success']:
                logger.error(f"GraphRAG indexing failed: {graphrag_result['error']}")
                # Still return success for file processing, but note the GraphRAG error
                return graphrag_pb2.ProcessFileResponse(
                    success=True,
                    error=f"File processed successfully, but GraphRAG indexing failed: {graphrag_result['error']}",
                    markdown_content=markdown_content,
                    content_length=process_result['content_length']
                )
            
            logger.info("GraphRAG indexing completed successfully")
            
            # Return complete success
            return graphrag_pb2.ProcessFileResponse(
                success=True,
                error="",
                markdown_content=markdown_content,
                content_length=process_result['content_length']
            )
            
        except Exception as e:
            logger.error(f"Error in ProcessFile: {str(e)}")
            return graphrag_pb2.ProcessFileResponse(
                success=False,
                error=str(e),
                markdown_content='',
                content_length=0
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


# Initialize Google Drive processor
google_drive_processor = GoogleDriveProcessor()

# Start async processing - this should return immediately with task_id
loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)

class GoogleDriveServicer(google_drive_pb2_grpc.GoogleDriveServiceServicer):
    """Google Drive service implementation"""
    
    def ProcessFolder(self, request, context):
        """Process a Google Drive folder"""
        try:
            logger.info(f"Processing Google Drive folder for user: {request.user_id}")
            
            task_id = loop.run_until_complete(
                google_drive_processor.process_folder_async(
                    request.folder_url,
                    request.user_id,
                    request.project_id,
                    list(request.file_types) if request.file_types else None
                )
            )

            logger.info(f"Created processing task with ID: {task_id}")
            
            return google_drive_pb2.ProcessFolderResponse(
                success=True,
                message="Processing started successfully",
                task_id=task_id,
                files_found=0,  # Will be updated in status
                files_processed=0,
                processed_files=[]
            )
            
        except Exception as e:
            logger.error(f"Error processing folder: {str(e)}")
            return google_drive_pb2.ProcessFolderResponse(
                success=False,
                message=f"Error: {str(e)}",
                task_id="",
                files_found=0,
                files_processed=0,
                processed_files=[]
            )
    
    def ProcessFile(self, request, context):
        """Process a single Google Drive file"""
        try:
            logger.info(f"Processing Google Drive file for user: {request.user_id}")
            print(f"ProcessFile: File URL: {request.file_url}")
            # Process file async
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            result = loop.run_until_complete(
                google_drive_processor.process_file_async(
                    request.file_url,
                    request.user_id,
                    request.project_id
                )
            )
            print(f"ProcessFile: Processing result: ", result)
            
            # Convert result to protobuf format
            processed_file = google_drive_pb2.ProcessedFile(
                file_name=result['processed_file']['file_name'],
                file_id=result['processed_file']['file_id'],
                source_id=result['processed_file']['source_id'],
                success=result['processed_file']['success'],
                error_message=result['processed_file']['error_message'],
                markdown_content=result['processed_file']['markdown_content'][:1000],  # Truncate for response
                file_size=result['processed_file']['file_size']
            )
            
            return google_drive_pb2.ProcessFileResponse(
                success=result['success'],
                message=result['message'],
                processed_file=processed_file
            )
            
        except Exception as e:
            logger.error(f"Error processing file: {str(e)}")
            return google_drive_pb2.ProcessFileResponse(
                success=False,
                message=f"Error: {str(e)}",
                processed_file=google_drive_pb2.ProcessedFile(
                    file_name="Unknown",
                    file_id="",
                    source_id="",
                    success=False,
                    error_message=str(e),
                    markdown_content="",
                    file_size=0
                )
            )
    
    def GetProcessingStatus(self, request, context):
        """Get status of folder processing"""
        try:
            status_info = google_drive_processor.get_processing_status(request.task_id)
            
            if not status_info['success']:
                return google_drive_pb2.GetStatusResponse(
                    success=False,
                    status="not_found",
                    message=status_info['message'],
                    total_files=0,
                    processed_files=0,
                    failed_files=0,
                    results=[]
                )
            
            # Convert results to protobuf format
            processed_files = []
            for result in status_info.get('results', []):
                processed_file = google_drive_pb2.ProcessedFile(
                    file_name=result['file_name'],
                    file_id=result['file_id'],
                    source_id=result['source_id'],
                    success=result['success'],
                    error_message=result['error_message'],
                    markdown_content=result['markdown_content'][:1000],  # Truncate for response
                    file_size=result['file_size']
                )
                processed_files.append(processed_file)
            
            return google_drive_pb2.GetStatusResponse(
                success=True,
                status=status_info['status'],
                message=status_info['message'],
                total_files=status_info['total_files'],
                processed_files=status_info['processed_files'],
                failed_files=status_info['failed_files'],
                results=processed_files
            )
            
        except Exception as e:
            logger.error(f"Error getting processing status: {str(e)}")
            return google_drive_pb2.GetStatusResponse(
                success=False,
                status="error",
                message=f"Error: {str(e)}",
                total_files=0,
                processed_files=0,
                failed_files=0,
                results=[]
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
    google_drive_pb2_grpc.add_GoogleDriveServiceServicer_to_server(
        GoogleDriveServicer(), server
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