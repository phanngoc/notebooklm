#!/usr/bin/env node
const { graphragClient } = require('../lib/grpc-client.ts')

async function testGraphRAG() {
  console.log('Testing GraphRAG integration...')
  
  const testUserId = 'test-user-123'
  const testProjectId = 'test-project'
  const testContent = `
  Tesla is a leading electric vehicle company founded by Elon Musk.
  The company has seen significant growth in recent years and is valued at over $800 billion.
  Tesla's main products include the Model S, Model 3, Model X, and Model Y vehicles.
  The company also produces energy storage systems and solar panels.
  Tesla's Gigafactories are key to their manufacturing strategy.
  `
  
  try {
    // Test inserting content
    console.log('1. Testing content insertion...')
    const insertResult = await graphragClient.insertContent({
      content: testContent,
      user_id: testUserId,
      project_id: testProjectId
    })
    
    console.log('Insert result:', insertResult)
    
    if (!insertResult.success) {
      console.error('Content insertion failed:', insertResult.error)
      return
    }
    
    // Wait a moment for processing
    console.log('Waiting for processing...')
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Test querying
    console.log('2. Testing graph query...')
    const queryResult = await graphragClient.queryGraph({
      query: 'What products does Tesla make?',
      user_id: testUserId,
      project_id: testProjectId,
      max_results: 5,
      similarity_threshold: 0.7
    })
    
    console.log('Query result:', queryResult)
    
    if (queryResult.success) {
      console.log('✅ GraphRAG integration is working!')
      console.log('Response:', queryResult.response)
    } else {
      console.error('❌ Query failed:', queryResult.error)
    }
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message)
    console.log('Make sure the GraphRAG gRPC server is running on port 50052')
  }
  
  // Close the client
  graphragClient.close()
}

testGraphRAG()
