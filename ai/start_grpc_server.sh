#!/bin/bash

# Navigate to the ai directory
cd "$(dirname "$0")"

echo "Setting up Python gRPC server..."

mkdir -p ./data

# Generate protobuf files
echo "Generating protobuf files..."
chmod +x generate_proto.sh
./generate_proto.sh

# Start the gRPC server
echo "Starting gRPC server on port 50051..."
python grpc_server.py
