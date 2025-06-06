-- Insert test profiles with hashed passwords
-- Password for all test users is: password123
-- Hash generated with bcrypt rounds=12

INSERT INTO profiles (id, email, full_name, password) VALUES 
(
  gen_random_uuid(),
  'user1@example.com',
  'Test User 1',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/VcSAg/9qm'
) ON CONFLICT (email) DO NOTHING;

INSERT INTO profiles (id, email, full_name, password) VALUES 
(
  gen_random_uuid(),
  'user2@example.com',
  'Test User 2',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/VcSAg/9qm'
) ON CONFLICT (email) DO NOTHING;

INSERT INTO profiles (id, email, full_name, password) VALUES 
(
  gen_random_uuid(),
  'user3@example.com',
  'Test User 3',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/VcSAg/9qm'
) ON CONFLICT (email) DO NOTHING;
