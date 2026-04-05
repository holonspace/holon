import {
  pgTable, serial, varchar, text, jsonb, integer,
  timestamp, index, primaryKey,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { customType } from 'drizzle-orm/pg-core'

// pgvector custom type (drizzle-orm built-in vector may vary by version)
const vector = customType<{ data: number[]; driverData: string }>({
  dataType(config?: { dimensions?: number }) {
    return config?.dimensions ? `vector(${config.dimensions})` : 'vector'
  },
  fromDriver(value: string): number[] {
    // Postgres returns vector as "[1,2,3]" string
    return value.slice(1, -1).split(',').map(Number)
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`
  },
})

export const collection = pgTable('collection', {
  id:          serial('id').primaryKey(),
  title:       varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  metadata:    jsonb('metadata').notNull().default({}),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_collection_created_at').on(t.createdAt.desc()),
  index('idx_collection_metadata').using('gin', t.metadata),
])

export const document = pgTable('document', {
  id:               serial('id').primaryKey(),
  title:            varchar('title', { length: 255 }).notNull(),
  description:      text('description'),
  content:          jsonb('content').notNull().default({}),
  contentText:      text('content_text'),
  embedding:        vector('embedding', { dimensions: 1536 }),
  parentDocumentId: integer('parent_document_id'),
  chunkIndex:       integer('chunk_index'),
  chunkTotal:       integer('chunk_total'),
  metadata:         jsonb('metadata').notNull().default({}),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // HNSW and trigram indexes are added manually in the migration SQL
  // (drizzle-kit cannot express these operators natively)
  index('idx_document_parent').on(t.parentDocumentId)
    .where(sql`${t.parentDocumentId} IS NOT NULL`),
  index('idx_document_created_at').on(t.createdAt.desc()),
  index('idx_document_metadata').using('gin', t.metadata),
])

export const documentCollection = pgTable('document_collection', {
  documentId:   integer('document_id').notNull().references(() => document.id, { onDelete: 'cascade' }),
  collectionId: integer('collection_id').notNull().references(() => collection.id, { onDelete: 'cascade' }),
  position:     integer('position'),
  addedAt:      timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.documentId, t.collectionId] }),
  index('idx_document_collection_collection_id').on(t.collectionId, t.documentId),
])

export type Collection           = typeof collection.$inferSelect
export type NewCollection        = typeof collection.$inferInsert
export type Document             = typeof document.$inferSelect
export type NewDocument          = typeof document.$inferInsert
export type DocumentCollection   = typeof documentCollection.$inferSelect
