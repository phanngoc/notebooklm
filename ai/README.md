# AI Chat Memory Service

Dịch vụ xử lý bộ nhớ chat và tìm kiếm vector sử dụng gRPC và Qdrant.

## Yêu cầu hệ thống

- Python 3.8+
- Docker (tùy chọn)
- Qdrant server

## Cài đặt

1. Cài đặt các dependencies:

```bash
pip install -r requirements.txt
```

2. Tạo proto files:

```bash
./generate_proto.sh
```

## Cấu trúc dự án

- `chat_memory.proto`: Định nghĩa gRPC service
- `grpc_server.py`: Server gRPC chính
- `vector-qdrant.py`: Xử lý vector search với Qdrant
- `main.py`: Entry point của ứng dụng
- `test-vector.py`: File test cho vector search

## Chạy server

### Chạy cho development.

Cài đặt entr:

```bash
# Ubuntu/Debian
sudo apt install entr

# macOS
brew install entr

# Arch Linux
sudo pacman -S entr
```

```bash
./dev_server.sh
```

### Sử dụng Docker

```bash
docker build -t ai-chat-memory .
docker run -p 50051:50051 ai-chat-memory
```

## API Endpoints

### Chat Memory Service

- `SaveChat`: Lưu trữ chat history
- `GetChat`: Lấy chat history
- `SearchChat`: Tìm kiếm trong chat history

### Vector Search

- `SearchVector`: Tìm kiếm vector tương tự
- `AddVector`: Thêm vector mới

## Testing

Chạy test vector search:

```bash
python test-vector.py
```

## Lưu ý

- Đảm bảo Qdrant server đang chạy trước khi khởi động service
- Port mặc định: 50051
- Vector dimension mặc định: 1536
