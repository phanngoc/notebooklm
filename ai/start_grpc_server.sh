#!/bin/bash

# Navigate to the ai directory
cd "$(dirname "$0")"

echo "Setting up Python gRPC server..."

# Install Python dependencies
echo "Installing Python dependencies..."
pip install -r requirements.txt

mkdir -p ./data

# Generate protobuf files
echo "Generating protobuf files..."
chmod +x generate_proto.sh
./generate_proto.sh

# Start the gRPC server
echo "Starting gRPC server on port 50051..."
python grpc_server.py
