import type { collection, collectionClosure, documentToCollection } from '../schema/collection'

// ── JSONB 欄位結構型別 ─────────────────────────────────
export type CollectionMetadata = {
  icon?: string
  color?: string
  [key: string]: unknown
}

// ── Drizzle 推斷型別 ───────────────────────────────────
export type Collection              = typeof collection.$inferSelect
export type NewCollection           = typeof collection.$inferInsert
export type CollectionClosure       = typeof collectionClosure.$inferSelect
export type NewCollectionClosure    = typeof collectionClosure.$inferInsert
export type DocumentToCollection    = typeof documentToCollection.$inferSelect
export type NewDocumentToCollection = typeof documentToCollection.$inferInsert
