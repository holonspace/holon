import { z } from 'zod'
import type { chunk } from '../schema/chunk'

// ── JSONB 欄位 Zod Schema（單一來源）─────────────────────
export const ChunkMetadataSchema = z.object({
  page: z.number().optional(),
  section: z.string().optional(),
}).catchall(z.any()).nullable()

// ── TypeScript 型別（從 schema 派生）─────────────────────
export type ChunkMetadata = z.infer<typeof ChunkMetadataSchema>

// ── Drizzle 推斷型別 ───────────────────────────────────
export type Chunk    = typeof chunk.$inferSelect
export type NewChunk = typeof chunk.$inferInsert
