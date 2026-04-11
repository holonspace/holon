import { ChunkMetadataSchema } from '@/db/types/chunk'
import { z } from 'zod'

export const SearchBodySchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(100).default(10).optional(),
  k: z.number().int().min(1).default(60).optional(),                        // RRF 常數，預設 60
  vectorWeight: z.number().min(0).default(1.0).optional(),                  // 向量加權乘數，預設 1.0（無加權）；> 1.0 提升向量路
  minScore: z.number().min(0).default(0).optional(),                        // 最低 RRF 分數門檻
  collectionId: z.uuid().optional(),             // 限縮到此 collection（含子集合）
  documentId: z.uuid().optional(),               // 限縮到單一 document
  contextWindow: z.number().int().min(0).max(10).default(0).optional(),
})

export type SearchBodyDto = z.infer<typeof SearchBodySchema>

const ContextChunkSchema = z.object({
  chunkId: z.uuid(),
  prevChunkId: z.uuid().nullable(),
  nextChunkId: z.uuid().nullable(),
  content: z.string(),
  metadata: ChunkMetadataSchema,
})

export const SearchResultSchema = z.object({
  chunkId: z.uuid(),
  documentId: z.uuid(),    // document UUID（非 int id）
  prevChunkId: z.uuid().nullable(),
  nextChunkId: z.uuid().nullable(),
  content: z.string(),
  metadata: ChunkMetadataSchema,
  score: z.number(),
  contextChunks: z.object({
    prev: z.array(ContextChunkSchema),
    next: z.array(ContextChunkSchema),
  }).optional(),
})

export type SearchResultDto = z.infer<typeof SearchResultSchema>

export const SearchResponseSchema = z.array(SearchResultSchema)
