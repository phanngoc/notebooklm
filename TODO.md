
## Hỗ trợ upload file subapass blob

## Research: có cách nào lưu trữ các file pickle trên subapass blob không?
Hoặc chuyển qua lưu graph vào neo4j, lưu vector vào qrant

## Trích xuất nguồn của đoạn trả lời:

## Khi tạo project => upload 1 note đầu tiên => phân tích content 
để đưa ra nội dung DOMAIN + ENTITY phù hợp.

```
self.domain = """Analyze documents to identify key information that affects business value, growth potential, and strategic insights. 
Focus on entities like companies, people, financial metrics, market trends, technologies, strategies, and their relationships."""

self.example_queries = [
    "What are the key factors driving business value?",
    "How do market trends affect competitive position?",
    "What strategic initiatives are mentioned in the documents?",
    "What are the main risk factors discussed?",
    "What financial metrics or performance indicators are highlighted?",
    "Who are the key people or organizations mentioned?",
    "What technologies or innovations are discussed?"
]

self.entity_types = [
    "Company", "Person", "Financial_Metric", "Market_Trend", 
    "Technology", "Strategy", "Risk_Factor", "Product", 
    "Location", "Industry", "Partnership", "Investment"
]
```

- Generate ra sơ đồ mermaid
- Break task + Estimate thời gian hoàn thành.
- Tạo ra grant chart để theo dõi tiến độ

## Tạo flow 
https://reactflow.dev/
Vẽ flow các action sẽ làm trong project.

## Tích hợp search để khám phá idea mới.


## Tích hợp paste link
https://github.com/mendableai/firecrawl?tab=readme-ov-file

## Tích hợp break task cho estimation.





trong table source : thiết kế đa hình để lưu nguồn của sources => 
để sync về sau 

table column có 2 (url, type)


type:
application/vnd.google-apps.document
url:
https://drive.google.com/file/d/1JB4hR-by0ILrXpc4JQMtRpiMM9nizWV3U8U5YOIsh4Y/view

type:
application/vnd.google-apps.spreadsheet
url:
https://drive.google.com/file/d/1JB4hR-by0ILrXpc4JQMtRpiMM9nizWV3U8U5YOIsh4Y/view

type:
text
url:
note_id

đánh index type + url 
