import { z } from 'zod'
import type { document } from '../schema/document'

// ── JSONB 欄位 Zod Schema（單一來源）─────────────────────
export const DocumentContentSchema = z.object({

}).catchall(z.any())

export const DocumentMetadataSchema = z.object({
  source: z.string().optional(),
  tags: z.array(z.string()).optional(),
}).catchall(z.any()).nullable()

// ── TypeScript 型別（從 schema 派生）─────────────────────
export type DocumentContent = z.infer<typeof DocumentContentSchema>
export type DocumentMetadata = z.infer<typeof DocumentMetadataSchema>

// ── Drizzle 推斷型別 ───────────────────────────────────
export type Document = typeof document.$inferSelect
export type NewDocument = typeof document.$inferInsert
