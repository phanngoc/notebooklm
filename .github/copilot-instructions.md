# NotebookLLM Copilot Instructions

## Project Overview
This is a NotebookLLM clone built with Next.js 15, TypeScript, and Supabase. It's an AI-powered document analysis and chat interface that allows users to upload documents, process them with embeddings, and have conversational interactions about the content.

## Tech Stack
- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Database**: Supabase (PostgreSQL)
- **Vector Database**: Supabase pgvector for embeddings
- **Authentication**: NextAuth.js
- **AI/ML**: 
  - OpenAI API for chat completions
  - OpenAI text-embedding-ada-002 for document embeddings
  - LangChain for document processing
- **UI**: 
  - Tailwind CSS
  - Radix UI components
  - Shadcn/ui component library
  - Lucide React icons
- **State Management**: React hooks and context
- **Styling**: Tailwind CSS with CSS variables for theming

## Project Structure

### Core Directories
- `/app/`: Next.js App Router pages and API routes
- `/components/`: Reusable React components
- `/lib/`: Utility functions and service classes
- `/types/`: TypeScript type definitions
- `/hooks/`: Custom React hooks
- `/scripts/`: Database migration scripts

### Key Components
- `notebook-interface.tsx`: Main dashboard interface
- `sources-panel.tsx`: Document upload and management
- `chat-panel.tsx`: AI chat interface
- `studio-panel.tsx`: Note creation and editing
- `auth-panel.tsx`: Authentication UI

### API Routes
- `/api/auth/`: NextAuth.js authentication endpoints
- `/api/documents/`: Document CRUD operations
- `/api/documents/process/`: Document processing and embedding
- `/api/chat/`: Chat completion endpoints

### Core Services
- `VectorService` (lib/langchain.ts): Document embedding and similarity search
- `DatabaseService` (lib/database.ts): Database operations
- `TextSplitter` (lib/text-splitter.ts): Document chunking

## Coding Guidelines

### File Naming
- Use kebab-case for files and directories
- Components: PascalCase function names with kebab-case files
- Types: PascalCase interfaces
- API routes: lowercase with bracket notation for dynamic routes

### Code Style
- Use TypeScript strict mode
- Prefer const over let
- Use async/await over Promise chains
- Extract reusable logic into custom hooks
- Use proper TypeScript types (avoid `any`)

### Database Operations
- Use the `DatabaseService` class for database operations
- Always handle errors gracefully
- Use transactions for multi-table operations
- Follow the existing patterns for CRUD operations

## Database Schema
Key tables:
- `profiles`: User profiles
- `sources`: Document sources
- `document_embeddings`: Vector embeddings
- `chat_sessions`: Chat conversations
- `notes`: User notes

## UI/UX Guidelines
- Use Shadcn/ui components consistently
- Follow the existing design system
- Implement proper loading states
- Show error messages to users
- Use responsive design patterns
- Maintain accessibility standards

## Error Handling
- Always catch and log errors
- Provide meaningful error messages to users
- Use try-catch blocks in async functions
- Return appropriate HTTP status codes

## Performance Considerations
- Lazy load components when possible
- Batch database operations
- Use React.memo for expensive components
- Implement proper loading states
- Optimize vector search queries

## Security Guidelines
- Validate all user inputs
- Use proper authentication checks
- Sanitize data before database operations
- Follow OWASP security practices
- Use environment variables for secrets



Remember to maintain consistency with the existing codebase and follow these established patterns when making changes or adding new features.
