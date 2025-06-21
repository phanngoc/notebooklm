# User Settings & Google Drive Integration

## Overview

This feature allows users to manage their personal settings and configure Google Drive integration with per-user credentials stored securely in the database.

## Features

### 🔧 Settings Management
- Store custom key-value settings per user
- Support for encrypted settings (e.g., credentials)
- CRUD operations: Create, Read, Update, Delete
- Web UI for easy management

### 🔑 Google Drive Integration
- Per-user Google Drive service account credentials
- Secure storage in database (encrypted)
- No need for environment variables
- Easy credential management through UI

## Database Schema

### Settings Table
```sql
CREATE TABLE settings (
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
```

## API Endpoints

### Settings Management
- `GET /api/settings` - Get all user settings
- `POST /api/settings` - Create/update a setting
- `DELETE /api/settings?key=<key>` - Delete a setting

### Google Drive Credentials
- `GET /api/settings/google-drive` - Check credentials status
- `POST /api/settings/google-drive` - Save credentials
- `DELETE /api/settings/google-drive` - Delete credentials

### Internal API (for Python service)
~~- `GET /api/internal/google-drive-credentials` - Get credentials for processing~~

**Updated**: Python service now connects directly to database for better performance and security.

## Setup Instructions

### 1. Run Database Migration
```bash
# Run the settings table migration
psql -d your_database -f scripts/008-create-settings-table.sql
```

### 2. Configure Google Drive

#### Option A: Per-User Credentials (Recommended)
1. Go to `/profile` in the web app
2. Navigate to "Integrations" tab
3. Paste your Google Drive service account JSON
4. Save credentials

#### Option B: System-wide Credentials (Fallback)
Set environment variable:
```bash
GOOGLE_CREDENTIALS_PATH=/path/to/service-account.json
```

### 3. Access Profile Page
- Navigate to `/profile` from the header menu
- Or click "Profile" button in the top navigation

## User Guide

### Managing Settings
1. Go to **Profile** → **Settings** tab
2. **Add New Setting**:
   - Enter key name (e.g., `my_api_key`)
   - Enter value
   - Add description (optional)
   - Save setting
3. **Delete Setting**: Click trash icon next to any setting

### Google Drive Setup
1. Go to **Profile** → **Integrations** tab
2. **Configure Google Drive**:
   - Get service account JSON from Google Cloud Console
   - Paste JSON into the text area
   - Click "Save Credentials"
3. **Status**: Shows if credentials are configured
4. **Remove**: Delete credentials if needed

## Google Drive Service Account Setup

### 1. Google Cloud Console
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable Google Drive API
4. Create Service Account:
   - Go to IAM & Admin → Service Accounts
   - Click "Create Service Account"
   - Download JSON key file

### 2. Share Drive Folders
- Share Google Drive folders with the service account email
- Give "Viewer" permission (read-only access)

### 3. Test Integration
```bash
# Test the Python service
npm run gdrive:test

# Or manually test with a folder URL in the UI
```

## Security Features

### 🔒 Encrypted Storage
- Google Drive credentials are stored encrypted in database
- Sensitive settings can be marked as encrypted
- Internal API requires special headers for access

### 🛡️ Authentication
- All settings APIs require user authentication
- Settings are isolated per user
- Internal API has additional security checks

## Development

### Adding New Setting Types
1. Add API routes in `/api/settings/`
2. Update UI in `/app/profile/page.tsx`
3. Add database helper methods if needed

### Custom Settings
Settings can store any key-value data:
```typescript
// Example: API configuration
await dbService.upsertUserSetting(
  userId, 
  'openai_api_key', 
  'sk-...', 
  'OpenAI API Key',
  true // encrypted
)

// Example: UI preferences
await dbService.upsertUserSetting(
  userId, 
  'theme_preference', 
  'dark', 
  'UI Theme Preference'
)
```

## Troubleshooting

### Google Drive Issues
1. **"Credentials not found"**
   - Check if credentials are saved in Profile
   - Verify JSON format is valid
   - Ensure service account has correct permissions

2. **"Folder not accessible"**
   - Share folder with service account email
   - Check folder URL format
   - Verify folder is not private

### Settings Issues
1. **Settings not saving**
   - Check database migration ran successfully
   - Verify user authentication
   - Check browser console for errors

2. **Profile page not loading**
   - Ensure user is logged in
   - Check API endpoints are working
   - Verify database connection

## Migration from Environment Variables

If you were using `GOOGLE_CREDENTIALS_PATH` before:

1. Keep environment variable as fallback
2. Users can now add personal credentials
3. Personal credentials take priority
4. System falls back to environment if no user credentials

This allows gradual migration and multi-user support while maintaining backward compatibility.

## Python Backend Configuration

The AI backend now connects directly to the database instead of making HTTP calls to the Next.js API.

### Required Dependencies
```bash
pip install psycopg2-binary
```

### Database Connection
The Python service uses these environment variables (in order of preference):
1. `DATABASE_URL` - Full PostgreSQL connection string
2. `SUPABASE_DB_URL` - Supabase-specific connection string  
3. Individual components: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`

### Environment Setup
Copy `ai/.env.example` to `ai/.env` and configure your database connection:

```bash
# For Supabase
DATABASE_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres

# Or individual components
DB_HOST=localhost
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=your_password
```

### Benefits of Direct Database Access
- ✅ **Better Performance**: No HTTP overhead
- ✅ **More Reliable**: Direct connection, no API dependency
- ✅ **Simpler Architecture**: Fewer moving parts
- ✅ **Better Security**: No internal API endpoints needed
- ✅ **Real-time Access**: Immediate access to user settings
