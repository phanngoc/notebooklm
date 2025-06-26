-- Update sources table type constraint to include 'google-drive'
-- This migration adds support for Google Drive documents

-- Drop the existing constraint
ALTER TABLE sources 
DROP CONSTRAINT IF EXISTS sources_type_check;

-- Add the new constraint with 'google-drive' included
-- ALTER TABLE sources 
-- ADD CONSTRAINT sources_type_check 
-- CHECK (type IN ('google-doc', 'google-drive', 'website', 'text', 'pdf', 'document', 'markdown', 'spreadsheet', 'data', 'webpage', 'unknown'));

-- Add a comment to document the change
-- COMMENT ON CONSTRAINT sources_type_check ON sources IS 'Updated to include google-drive and other document types for better document classification';
