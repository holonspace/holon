import { index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, uuid, vector } from 'drizzle-orm/pg-core'
import type { ChunkMetadata } from '../types/chunk'
import { document } from './document'

export const chunk = pgTable('chunk', {
  id: serial('id').primaryKey(),
  chunkId: uuid('chunk_id').defaultRandom().notNull(),
  documentId: integer('document_id').notNull().references(() => document.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }),
  metadata: jsonb('metadata').$type<ChunkMetadata>().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => [
  index('chunk_id_idx').on(t.chunkId),
  index('chunk_document_id_idx').on(t.documentId),
  index('chunk_deleted_at_idx').on(t.deletedAt),
  uniqueIndex('chunk_doc_position_idx').on(t.documentId, t.position),
  index('chunk_embedding_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
  index('chunk_trgm_idx').using('gin', t.content.op('gin_trgm_ops')),
])
