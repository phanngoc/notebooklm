## Mô tả chung:
tính năng add link google drive folder (qua [  const handleAddUrl = () => {
    if (urlInput.trim()) {
      onAddDocument({
        title: titleInput || `Website: ${urlInput}`,
        type: "website",
        content: `Content from: ${urlInput}`,
        url: urlInput,
      })
      setUrlInput("")
      setTitleInput("")
      setIsAddingSource(false)
    }
  }])
-> quét hết file trong folder -> chọn các file docx -> 
convert sang markdown -> lưu vào db (table: sources) -> index dùng services/graphrag.py

## Luồng xử lí:
- Người dùng nhập vào [Website: ${urlInput}] => gửi lên server nextjs 
qua [POST api/documents] => server sẽ lấy url của folder google drive
gửi qua server python (dùng grpc) để quét folder của google drive(dùng https://github.com/googleapis/google-api-python-client) => lấy các file docx : convert sang markdown (dùng https://github.com/docling-project/docling) => lưu vào db (table: sources) , đồng thời index dùng services/graphrag.py