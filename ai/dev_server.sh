#!/bin/bash

# Development server with auto-reload
# Usage: ./dev_server.sh

# Navigate to the ai directory
cd "$(dirname "$0")"

echo "🔧 NotebookLLM gRPC Development Server"
echo "====================================="

# Create data directory
mkdir -p ./data

# Generate protobuf files initially
echo "🔧 Generating protobuf files..."
chmod +x generate_proto.sh
if ! ./generate_proto.sh; then
    echo "❌ Failed to generate protobuf files"
    exit 1
fi
echo "✅ Protobuf files generated"

# Install entr if not available (for file watching)
if ! command -v entr &> /dev/null; then
    echo "📦 Installing entr for file watching..."
    if command -v apt &> /dev/null; then
        sudo apt install -y entr
    elif command -v brew &> /dev/null; then
        brew install entr
    elif command -v pacman &> /dev/null; then
        sudo pacman -S entr
    else
        echo "❌ Please install 'entr' manually for file watching"
        echo "   Ubuntu/Debian: sudo apt install entr"
        echo "   macOS: brew install entr"
        echo "   Arch: sudo pacman -S entr"
        exit 1
    fi
fi

# Function to start server with file watching
start_dev_server() {
    echo ""
    echo "👀 Watching for changes..."
    echo "   📁 Watching: *.py, *.proto files"
    echo "   🔄 Auto-restart on file changes"
    echo "   ⛔ Press Ctrl+C to stop"
    echo ""
    
    # Use find and entr to watch for file changes
    find . -name "*.py" -o -name "*.proto" | entr -r sh -c '
        echo "📝 File change detected, restarting server..."
        
        # Regenerate proto files if needed
        if find . -name "*.proto" -newer generated/chat_memory_pb2.py 2>/dev/null | grep -q .; then
            echo "🔧 Regenerating protobuf files..."
            ./generate_proto.sh
        fi
        
        echo "🚀 Starting gRPC server on port 50051..."
        python grpc_server.py
    '
}

# Trap Ctrl+C for graceful shutdown
trap 'echo -e "\n🛑 Shutting down development server..."; echo "👋 Development server stopped"; exit 0' INT

# Start the development server
start_dev_server
