import { sql } from 'drizzle-orm'
import { index, jsonb, pgTable, text, timestamp, uuid, vector } from 'drizzle-orm/pg-core'
import type { ChunkMetadata } from '../types/chunk'
import { document } from './document'

export const chunk = pgTable('chunk', {
  id: uuid('id').primaryKey().default(sql`uuidv7()`),
  documentId: uuid('document_id').notNull().references(() => document.id, { onDelete: 'cascade' }),
  prevChunkId: uuid('prev_chunk_id').references((): any => chunk.id, { onDelete: 'set null' }),
  nextChunkId: uuid('next_chunk_id').references((): any => chunk.id, { onDelete: 'set null' }),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }),
  metadata: jsonb('metadata').$type<ChunkMetadata>().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => [
  index('chunk_document_id_idx').on(t.documentId),
  index('chunk_deleted_at_idx').on(t.deletedAt),
  index('chunk_prev_chunk_id_idx').on(t.prevChunkId),
  index('chunk_next_chunk_id_idx').on(t.nextChunkId),
  index('chunk_embedding_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
  index('chunk_bm25_idx').using('bm25', t.id, sql`(${t.content}::pdb.icu)`).with({ key_field: 'id' }),
])
