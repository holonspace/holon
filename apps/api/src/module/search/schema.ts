import { ChunkMetadataSchema } from '@/db/types/chunk'
import { z } from 'zod'

export const SearchBodySchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(100).default(10).optional(),
  k: z.number().int().min(1).default(60).optional(),                        // RRF 常數
  minScore: z.number().min(0).max(1).default(0.5).optional(),               // 最低 cosine similarity 門檻
  collectionId: z.uuid().optional(),             // 限縮到此 collection（含子集合）
  documentId: z.uuid().optional(),               // 限縮到單一 document
})

export type SearchBodyDto = z.infer<typeof SearchBodySchema>

export const SearchResultSchema = z.object({
  chunkId: z.uuid(),
  documentId: z.uuid(),    // document UUID（非 int id）
  position: z.number().int(),
  content: z.string(),
  metadata: ChunkMetadataSchema,
  score: z.number(),
})

export type SearchResultDto = z.infer<typeof SearchResultSchema>

export const SearchResponseSchema = z.array(SearchResultSchema)
