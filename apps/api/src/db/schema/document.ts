import { sql } from 'drizzle-orm'
import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import type { DocumentContent, DocumentMetadata } from '../types/document'

export const document = pgTable('document', {
  id: uuid('id').primaryKey().default(sql`uuidv7()`),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  content: jsonb('content').$type<DocumentContent>().default({} as DocumentContent),
  metadata: jsonb('metadata').$type<DocumentMetadata>().default({} as DocumentMetadata),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => [
  index('document_deleted_at_idx').on(t.deletedAt),
])
