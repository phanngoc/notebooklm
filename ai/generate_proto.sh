#!/bin/bash

# Generate Python protobuf files
python -m grpc_tools.protoc -I. --python_out=. --grpc_python_out=. chat_memory.proto

echo "Generated protobuf files:"
echo "- chat_memory_pb2.py"
echo "- chat_memory_pb2_grpc.py"
