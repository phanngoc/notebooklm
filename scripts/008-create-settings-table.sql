-- Create settings table for user configurations
CREATE TABLE IF NOT EXISTS settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    key VARCHAR(100) NOT NULL,
    value TEXT,
    description TEXT,
    is_encrypted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, key)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_settings_user_key ON settings(user_id, key);

-- Insert some default settings examples
INSERT INTO settings (user_id, key, value, description) 
SELECT 
    id as user_id,
    'google_drive_enabled' as key,
    'false' as value,
    'Enable Google Drive integration' as description
FROM profiles 
WHERE email = 'test@example.com'
ON CONFLICT (user_id, key) DO NOTHING;

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS trigger_update_settings_updated_at ON settings;
CREATE TRIGGER trigger_update_settings_updated_at
    BEFORE UPDATE ON settings
    FOR EACH ROW
    EXECUTE FUNCTION update_settings_updated_at();
