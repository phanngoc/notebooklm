-- Add GraphRAG-specific fields to projects table
ALTER TABLE projects 
ADD COLUMN domain TEXT,
ADD COLUMN example_queries JSONB DEFAULT '[]',
ADD COLUMN entity_types JSONB DEFAULT '[]';

-- Update existing projects with default values
UPDATE projects 
SET 
  domain = 'Analyze documents to identify key information that affects business value, growth potential, and strategic insights. Focus on entities like companies, people, financial metrics, market trends, technologies, strategies, and their relationships.',
  example_queries = '["What are the key factors driving business value?", "How do market trends affect competitive position?", "What strategic initiatives are mentioned in the documents?", "What are the main risk factors discussed?", "What financial metrics or performance indicators are highlighted?", "Who are the key people or organizations mentioned?", "What technologies or innovations are discussed?"]',
  entity_types = '["Company", "Person", "Financial_Metric", "Market_Trend", "Technology", "Strategy", "Risk_Factor", "Product", "Location", "Industry", "Partnership", "Investment"]'
WHERE domain IS NULL;
