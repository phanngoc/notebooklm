export class SimpleTextSplitter {
  private chunkSize: number
  private chunkOverlap: number

  constructor(options: { chunkSize?: number; chunkOverlap?: number } = {}) {
    this.chunkSize = options.chunkSize || 1000
    this.chunkOverlap = options.chunkOverlap || 200
  }

  splitText(text: string): string[] {
    if (text.length <= this.chunkSize) {
      return [text]
    }

    const chunks: string[] = []
    let start = 0

    while (start < text.length) {
      let end = start + this.chunkSize

      // If we're not at the end of the text, try to break at a sentence or word boundary
      if (end < text.length) {
        // Look for sentence boundaries first
        const sentenceEnd = text.lastIndexOf(".", end)
        const questionEnd = text.lastIndexOf("?", end)
        const exclamationEnd = text.lastIndexOf("!", end)

        const sentenceBoundary = Math.max(sentenceEnd, questionEnd, exclamationEnd)

        if (sentenceBoundary > start + this.chunkSize * 0.5) {
          end = sentenceBoundary + 1
        } else {
          // Look for word boundaries
          const wordBoundary = text.lastIndexOf(" ", end)
          if (wordBoundary > start + this.chunkSize * 0.5) {
            end = wordBoundary
          }
        }
      }

      chunks.push(text.slice(start, end).trim())

      // Move start position with overlap
      start = end - this.chunkOverlap
      if (start < 0) start = 0
      if (start >= text.length) break
    }

    return chunks.filter((chunk) => chunk.length > 0)
  }
}
