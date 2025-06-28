-- Add mime_type column to sources table and support for Google Slides
-- This migration adds MIME type tracking and Google Slides support

-- Add mime_type column to sources table
ALTER TABLE sources 
ADD COLUMN IF NOT EXISTS mime_type TEXT;

-- Drop the existing constraint
ALTER TABLE sources 
DROP CONSTRAINT IF EXISTS sources_type_check;

-- Add the new constraint with 'google-slide' included
ALTER TABLE sources 
ADD CONSTRAINT sources_type_check 
CHECK (type IN ('google-doc', 'google-slide', 'google-drive', 'website', 'text', 'pdf', 'document', 'markdown', 'spreadsheet', 'data', 'webpage', 'unknown'));

-- Add a comment to document the change
COMMENT ON COLUMN sources.mime_type IS 'MIME type of the document (e.g., application/vnd.google-apps.document, application/vnd.google-apps.presentation)';
COMMENT ON CONSTRAINT sources_type_check ON sources IS 'Updated to include google-slide and other document types for better document classification';
