import { index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import type { CollectionMetadata } from '../types/collection'
import { document } from './document'

export const collection = pgTable('collection', {
  id: serial('id').primaryKey(),
  collectionId: uuid('collection_id').defaultRandom().notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  metadata: jsonb('metadata').$type<CollectionMetadata>().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('collection_id_idx').on(t.collectionId),
])

export const collectionClosure = pgTable('collection_closure', {
  ancestorId: integer('ancestor_id').notNull().references(() => collection.id, { onDelete: 'cascade' }),
  descendantId: integer('descendant_id').notNull().references(() => collection.id, { onDelete: 'cascade' }),
  depth: integer('depth').notNull(),
  
}, (t) => [
  primaryKey({ columns: [t.ancestorId, t.descendantId] }),
  index('collection_closure_descendant_idx').on(t.descendantId),
])

export const documentToCollection = pgTable('document_to_collection', {
  documentId: integer('document_id').notNull().references(() => document.id, { onDelete: 'cascade' }),
  collectionId: integer('collection_id').notNull().references(() => collection.id, { onDelete: 'cascade' }),
}, (t) => [
  primaryKey({ columns: [t.collectionId, t.documentId] }),
  index('dtc_document_id_idx').on(t.documentId),
])
