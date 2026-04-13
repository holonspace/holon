import type { CollectionDto, CollectionSearchResultDto, DocumentSummaryDto } from '@/module/collection/schema'
import { OpenAIEmbeddings } from '@langchain/openai'

export function buildEmbeddingText(title: string, description?: string | null): string {
  return `${title}\n${description ?? ''}`
}

export async function generateEmbedding(apiKey: string, text: string): Promise<number[]> {
  const embeddings = new OpenAIEmbeddings({ apiKey, model: 'text-embedding-3-small' })
  return embeddings.embedQuery(text)
}

export function toDto(c: {
  id: string
  title: string
  description: string | null
  metadata: unknown
  createdAt: Date
  updatedAt: Date
}): CollectionDto {
  return {
    id: c.id,
    title: c.title,
    description: c.description ?? null,
    metadata: (c.metadata as Record<string, unknown>) ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
}

export function toDocumentDto(d: {
  id: string
  title: string
  description: string | null
  metadata: unknown
  content: unknown
  createdAt: Date
  updatedAt: Date
}): DocumentSummaryDto {
  return {
    id: d.id,
    title: d.title,
    description: d.description ?? null,
    metadata: (d.metadata as Record<string, unknown>) ?? null,
    content: (d.content as Record<string, unknown>) ?? null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }
}

export function toSearchResultDto(c: {
  id: string
  title: string
  description: string | null
  metadata: unknown
  createdAt: Date
  updatedAt: Date
  score: number
}): CollectionSearchResultDto {
  return { ...toDto(c), score: c.score }
}
