FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Generate protobuf files
RUN python -m grpc_tools.protoc -I. --python_out=. --grpc_python_out=. chat_memory.proto

# Expose gRPC port
EXPOSE 50051

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import grpc; grpc.insecure_channel('localhost:50051').get_state()" || exit 1

# Start the gRPC server
CMD ["python", "grpc_server.py"]
