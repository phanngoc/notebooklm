# Image Upload Functionality

## Overview
The NotebookLLM clone now supports image uploads within the note editor. Images are uploaded to the server and stored locally, then referenced via markdown in the notes.

## How it works

### Client Side
1. **Editor Component**: Uses MDXEditor with image plugin support
2. **Upload Handler**: Validates file type and size before upload
3. **Store Integration**: Uses Zustand store for centralized upload logic
4. **Toast Notifications**: Provides user feedback during upload process

### Server Side
1. **API Endpoint**: `/api/projects/[projectId]/upload-image`
2. **File Storage**: Images stored in `public/uploads/[projectId]/`
3. **File Validation**: Checks file type, size, and generates unique filenames
4. **Response**: Returns public URL for markdown rendering

## File Structure
```
app/api/projects/[projectId]/upload-image/
├── route.ts          # Main upload endpoint
└── test/route.ts     # Test endpoint

public/uploads/        # Upload directory
├── .gitkeep          # Keeps directory in git
└── [projectId]/      # Project-specific uploads
    └── [uuid].[ext]  # Uploaded images
```

## Usage in Code

### In Notes Store
```typescript
const { uploadImage } = useNotesStore()
const imageUrl = await uploadImage(file, projectId)
```

### In Components
```typescript
const imageUploadHandler = async (image: File): Promise<string> => {
  return await uploadImage(image, projectId)
}

<EditorComp 
  markdown={content} 
  onChange={setContent}
  imageUploadHandler={imageUploadHandler} 
/>
```

## File Constraints
- **Max size**: 10MB
- **Allowed types**: JPEG, JPG, PNG, GIF, WebP
- **Storage**: Local filesystem in `public/uploads/`
- **Naming**: UUID-based filenames to prevent conflicts

## Security Features
- File type validation
- File size limits
- Unique filename generation
- Project-specific directories
- Error handling and user feedback

## Future Enhancements
- Cloud storage integration (AWS S3, Cloudinary, etc.)
- Image compression/optimization
- Bulk upload support
- Image metadata extraction
- CDN integration for better performance
