from fast_graphrag import GraphRAG

DOMAIN = "Analyze stock market and financial documents to identify key information that affects business value and growth potential. Focus on market trends, financial performance, competitive advantages, and strategic opportunities."

EXAMPLE_QUERIES = [
    "What are the key financial metrics that indicate company growth potential?",
    "How do market trends affect the company's competitive position?",
    "What strategic initiatives are driving business value creation?",
    "What are the main risk factors that could impact the company's valuation?",
    "How does the company's performance compare to industry benchmarks?"
]

ENTITY_TYPES = ["Company", "Financial_Metric", "Market_Trend", "Industry", "Strategy", "Risk_Factor"]

grag = GraphRAG(
    working_dir="./data",
    domain=DOMAIN,
    example_queries="\n".join(EXAMPLE_QUERIES),
    entity_types=ENTITY_TYPES
)

with open("./data/book.txt") as f:
    grag.insert(f.read())

print(grag.query("What factors are driving the company's valuation?").response)