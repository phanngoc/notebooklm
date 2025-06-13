#!/usr/bin/env python3
"""
Test script for GraphRAG gRPC server using fast-graphrag
"""

import grpc
import sys
import os

# Add the generated directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), 'generated'))

import graphrag_pb2
import graphrag_pb2_grpc

def test_graphrag_server():
    """Test the GraphRAG gRPC server"""
    
    # Connect to the server
    with grpc.insecure_channel('localhost:50052') as channel:
        stub = graphrag_pb2_grpc.GraphRAGServiceStub(channel)
        
        print("🧪 Testing GraphRAG gRPC Server...")
        
        # Test 1: Insert content
        print("\n📄 Testing content insertion...")
        
        # Test with first document content
        content1 = """
        TechCorp Inc. reported strong financial performance in Q4 2024. 
        Revenue reached $500 million, representing a 25% increase year-over-year. 
        The company's AI division showed exceptional growth with $150 million in revenue.
        CEO John Smith highlighted the success of their new cloud platform.
        The company plans to expand into Asian markets in 2025.
        Key partnerships with Microsoft and Google have strengthened their position.
        Operating margin improved to 18% from 15% in the previous quarter.
        """
        
        insert_request1 = graphrag_pb2.InsertContentRequest(
            content=content1,
            user_id="test_user_123",
            project_id="test_project"
        )
        
        try:
            insert_response1 = stub.InsertContent(insert_request1)
            if insert_response1.success:
                print(f"✅ Successfully inserted first document")
            else:
                print(f"❌ Failed to insert first document: {insert_response1.error}")
                return
        except Exception as e:
            print(f"❌ Error inserting first document: {e}")
            return
        
        # Test with second document content
        content2 = """
        The artificial intelligence market is experiencing unprecedented growth.
        Market size is projected to reach $1.8 trillion by 2030.
        Key players include TechCorp, DataSystems, and AI Innovations.
        Cloud computing integration is driving adoption rates.
        Regulatory challenges remain in the healthcare and finance sectors.
        Investment in AI startups reached $50 billion in 2024.
        Machine learning and natural language processing are the fastest-growing segments.
        """
        
        insert_request2 = graphrag_pb2.InsertContentRequest(
            content=content2,
            user_id="test_user_123",
            project_id="test_project"
        )
        
        try:
            insert_response2 = stub.InsertContent(insert_request2)
            if insert_response2.success:
                print(f"✅ Successfully inserted second document")
            else:
                print(f"❌ Failed to insert second document: {insert_response2.error}")
        except Exception as e:
            print(f"❌ Error inserting second document: {e}")
        
        # Test 2: Query the graph
        print("\n🔍 Testing graph queries...")
        
        test_queries = [
            "What are TechCorp's financial performance metrics?",
            "How is the AI market performing?",
            "What partnerships does TechCorp have?",
            "What are the growth projections for the AI industry?",
            "Who is the CEO of TechCorp?"
        ]
        
        for query in test_queries:
            print(f"\n💬 Query: {query}")
            
            query_request = graphrag_pb2.QueryRequest(
                query=query,
                user_id="test_user_123",
                project_id="test_project",
                max_results=5,
                similarity_threshold=0.3
            )
            
            try:
                query_response = stub.QueryGraph(query_request)
                if query_response.success:
                    print(f"📝 Response: {query_response.response[:300]}...")
                    if query_response.context and query_response.context.relevant_documents:
                        print(f"� Found {len(query_response.context.relevant_documents)} relevant documents")
                else:
                    print(f"❌ Query failed: {query_response.error}")
            except Exception as e:
                print(f"❌ Error querying graph: {e}")
        
        print("\n🎉 GraphRAG testing completed!")

if __name__ == "__main__":
    test_graphrag_server()
