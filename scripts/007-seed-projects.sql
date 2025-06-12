-- Seed projects for NotebookLLM
-- This script creates sample projects for the test users

-- First, let's get the user IDs from the existing test profiles
-- We'll use the emails to reference them

-- Insert sample projects for user1@example.com
INSERT INTO projects (id, user_id, name, description, created_at, updated_at) 
SELECT 
  gen_random_uuid(),
  p.id,
  'Research Paper Analysis',
  'Analyzing academic papers on machine learning and AI for my thesis research. Contains multiple PDF papers and web sources.',
  NOW() - INTERVAL '7 days',
  NOW() - INTERVAL '7 days'
FROM profiles p 
WHERE p.email = 'user1@example.com'
ON CONFLICT DO NOTHING;

INSERT INTO projects (id, user_id, name, description, created_at, updated_at) 
SELECT 
  gen_random_uuid(),
  p.id,
  'Company Policy Documentation',
  'Collection of company policies, employee handbook, and HR documents for easy reference and Q&A.',
  NOW() - INTERVAL '5 days',
  NOW() - INTERVAL '2 days'
FROM profiles p 
WHERE p.email = 'user1@example.com'
ON CONFLICT DO NOTHING;

INSERT INTO projects (id, user_id, name, description, created_at, updated_at) 
SELECT 
  gen_random_uuid(),
  p.id,
  'Product Requirements Gathering',
  'Market research, user interviews, and competitive analysis for the new mobile app project.',
  NOW() - INTERVAL '3 days',
  NOW() - INTERVAL '1 day'
FROM profiles p 
WHERE p.email = 'user1@example.com'
ON CONFLICT DO NOTHING;

-- Insert sample projects for user2@example.com
INSERT INTO projects (id, user_id, name, description, created_at, updated_at) 
SELECT 
  gen_random_uuid(),
  p.id,
  'Legal Document Review',
  'Contract analysis and legal document review for upcoming business partnerships.',
  NOW() - INTERVAL '10 days',
  NOW() - INTERVAL '4 days'
FROM profiles p 
WHERE p.email = 'user2@example.com'
ON CONFLICT DO NOTHING;

INSERT INTO projects (id, user_id, name, description, created_at, updated_at) 
SELECT 
  gen_random_uuid(),
  p.id,
  'Technical Documentation',
  'API documentation, system architecture docs, and technical specifications for the development team.',
  NOW() - INTERVAL '6 days',
  NOW() - INTERVAL '1 hour'
FROM profiles p 
WHERE p.email = 'user2@example.com'
ON CONFLICT DO NOTHING;

INSERT INTO projects (id, user_id, name, description, created_at, updated_at) 
SELECT 
  gen_random_uuid(),
  p.id,
  'Customer Feedback Analysis',
  'Customer surveys, support tickets, and feedback forms to understand user pain points.',
  NOW() - INTERVAL '4 days',
  NOW() - INTERVAL '3 hours'
FROM profiles p 
WHERE p.email = 'user2@example.com'
ON CONFLICT DO NOTHING;

-- Insert sample projects for user3@example.com
INSERT INTO projects (id, user_id, name, description, created_at, updated_at) 
SELECT 
  gen_random_uuid(),
  p.id,
  'Market Research Study',
  'Industry reports, competitor analysis, and market trends for Q4 planning.',
  NOW() - INTERVAL '8 days',
  NOW() - INTERVAL '2 days'
FROM profiles p 
WHERE p.email = 'user3@example.com'
ON CONFLICT DO NOTHING;

INSERT INTO projects (id, user_id, name, description, created_at, updated_at) 
SELECT 
  gen_random_uuid(),
  p.id,
  'Training Materials Development',
  'Creating comprehensive training materials for new employee onboarding program.',
  NOW() - INTERVAL '12 days',
  NOW() - INTERVAL '5 days'
FROM profiles p 
WHERE p.email = 'user3@example.com'
ON CONFLICT DO NOTHING;

INSERT INTO projects (id, user_id, name, description, created_at, updated_at) 
SELECT 
  gen_random_uuid(),
  p.id,
  'Personal Learning Journal',
  'Collection of articles, tutorials, and notes for learning web development and cloud technologies.',
  NOW() - INTERVAL '2 days',
  NOW() - INTERVAL '30 minutes'
FROM profiles p 
WHERE p.email = 'user3@example.com'
ON CONFLICT DO NOTHING;

-- Insert some additional varied projects to demonstrate different use cases
INSERT INTO projects (id, user_id, name, description, created_at, updated_at) 
SELECT 
  gen_random_uuid(),
  p.id,
  'Investment Research',
  'Financial reports, analyst recommendations, and market data for portfolio management decisions.',
  NOW() - INTERVAL '9 days',
  NOW() - INTERVAL '6 hours'
FROM profiles p 
WHERE p.email = 'user1@example.com'
ON CONFLICT DO NOTHING;

INSERT INTO projects (id, user_id, name, description, created_at, updated_at) 
SELECT 
  gen_random_uuid(),
  p.id,
  'Health & Wellness Research',
  'Medical journals, nutrition studies, and fitness articles for personal health optimization.',
  NOW() - INTERVAL '15 days',
  NOW() - INTERVAL '8 hours'
FROM profiles p 
WHERE p.email = 'user2@example.com'
ON CONFLICT DO NOTHING;

INSERT INTO projects (id, user_id, name, description, created_at, updated_at) 
SELECT 
  gen_random_uuid(),
  p.id,
  'Travel Planning Documentation',
  'Travel guides, visa requirements, and destination research for upcoming European trip.',
  NOW() - INTERVAL '1 day',
  NOW() - INTERVAL '2 hours'
FROM profiles p 
WHERE p.email = 'user3@example.com'
ON CONFLICT DO NOTHING;

-- Create a project with a longer, more detailed description
INSERT INTO projects (id, user_id, name, description, created_at, updated_at) 
SELECT 
  gen_random_uuid(),
  p.id,
  'Artificial Intelligence Ethics Study',
  'Comprehensive research project examining the ethical implications of AI deployment in healthcare, finance, and social media. Includes academic papers from leading researchers, policy documents from government agencies, industry white papers, and case studies of AI implementation successes and failures. This project aims to develop a framework for ethical AI governance in enterprise environments.',
  NOW() - INTERVAL '20 days',
  NOW() - INTERVAL '12 hours'
FROM profiles p 
WHERE p.email = 'user1@example.com'
ON CONFLICT DO NOTHING;

-- Create a project that simulates recent activity
INSERT INTO projects (id, user_id, name, description, created_at, updated_at) 
SELECT 
  gen_random_uuid(),
  p.id,
  'Quick Reference Notes',
  'Temporary project for quickly saving interesting articles and notes.',
  NOW() - INTERVAL '2 hours',
  NOW() - INTERVAL '5 minutes'
FROM profiles p 
WHERE p.email = 'user2@example.com'
ON CONFLICT DO NOTHING;

-- Verify the projects were created
-- Uncomment these lines if you want to see the results after running the script
-- SELECT 
--   p.name as project_name,
--   p.description,
--   pr.email as user_email,
--   p.created_at,
--   p.updated_at
-- FROM projects p
-- JOIN profiles pr ON p.user_id = pr.id
-- ORDER BY p.created_at DESC;