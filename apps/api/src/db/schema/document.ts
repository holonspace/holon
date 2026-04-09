import { index, jsonb, pgTable, serial, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import type { DocumentContent, DocumentMetadata } from '../types/document'

export const document = pgTable('document', {
  id: serial('id').primaryKey(),
  documentId: uuid('document_id').defaultRandom().notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  content: jsonb('content').$type<DocumentContent>().default({} as DocumentContent),
  metadata: jsonb('metadata').$type<DocumentMetadata>().default({} as DocumentMetadata),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => [
  index('document_id_idx').on(t.documentId),
  index('document_deleted_at_idx').on(t.deletedAt),
])
