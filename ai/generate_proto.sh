#!/bin/bash

# Generate Python protobuf files
python -m grpc_tools.protoc -I=proto --python_out=generated --grpc_python_out=generated chat_memory.proto
python -m grpc_tools.protoc -I=proto --python_out=generated --grpc_python_out=generated graphrag.proto
python -m grpc_tools.protoc -I=proto --python_out=generated --grpc_python_out=generated google_drive.proto

echo "Generated protobuf files:"
echo "- generated/chat_memory_pb2.py"
echo "- generated/chat_memory_pb2_grpc.py"
echo "- generated/graphrag_pb2.py"
echo "- generated/graphrag_pb2_grpc.py"
echo "- generated/google_drive_pb2.py"
echo "- generated/google_drive_pb2_grpc.py"
