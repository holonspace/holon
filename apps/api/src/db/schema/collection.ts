import { sql } from 'drizzle-orm'
import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid, varchar, vector } from 'drizzle-orm/pg-core'
import type { CollectionMetadata } from '../types/collection'
import { document } from './document'

export const collection = pgTable('collection', {
  id: uuid('id').primaryKey().default(sql`uuidv7()`),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  metadata: jsonb('metadata').$type<CollectionMetadata>().default({}),
  embedding: vector('embedding', { dimensions: 1536 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('collection_embedding_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
])

export const collectionClosure = pgTable('collection_closure', {
  ancestorId: uuid('ancestor_id').notNull().references(() => collection.id, { onDelete: 'cascade' }),
  descendantId: uuid('descendant_id').notNull().references(() => collection.id, { onDelete: 'cascade' }),
  depth: integer('depth').notNull(),
}, (t) => [
  primaryKey({ columns: [t.ancestorId, t.descendantId] }),
  index('collection_closure_descendant_idx').on(t.descendantId),
])

export const documentToCollection = pgTable('document_to_collection', {
  documentId: uuid('document_id').notNull().references(() => document.id, { onDelete: 'cascade' }),
  collectionId: uuid('collection_id').notNull().references(() => collection.id, { onDelete: 'cascade' }),
}, (t) => [
  primaryKey({ columns: [t.collectionId, t.documentId] }),
  index('dtc_document_id_idx').on(t.documentId),
])
