-- Add password field to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password TEXT;

-- Create index for email lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
