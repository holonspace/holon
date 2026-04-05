import { eq, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { document, documentCollection } from '@/db/schema'
import type { CreateDocumentDto, UpdateDocumentDto, AddToCollectionDto } from './schema'

export async function getDocumentById(db: Db, id: number) {
  const rows = await db.select().from(document).where(eq(document.id, id)).limit(1)
  return rows[0] ?? null
}

export async function createDocument(db: Db, data: CreateDocumentDto) {
  const rows = await db.insert(document).values({
    title:            data.title,
    description:      data.description ?? null,
    content:          data.content,
    contentText:      data.contentText ?? null,
    embedding:        data.embedding ?? null,
    parentDocumentId: data.parentDocumentId ?? null,
    chunkIndex:       data.chunkIndex ?? null,
    chunkTotal:       data.chunkTotal ?? null,
    metadata:         data.metadata,
  }).returning()
  return rows[0]
}

export async function updateDocument(db: Db, id: number, data: UpdateDocumentDto) {
  // Build patch with only defined fields — use typed object so Drizzle
  // can apply customType toDriver() transformations (e.g. embedding vector)
  const patch: Partial<typeof document.$inferInsert> & { updatedAt: Date } = {
    updatedAt: new Date(),
  }
  if (data.title            !== undefined) patch.title            = data.title
  if (data.description      !== undefined) patch.description      = data.description ?? null
  if (data.content          !== undefined) patch.content          = data.content
  if (data.contentText      !== undefined) patch.contentText      = data.contentText ?? null
  if (data.embedding        !== undefined) patch.embedding        = data.embedding ?? null
  if (data.parentDocumentId !== undefined) patch.parentDocumentId = data.parentDocumentId ?? null
  if (data.chunkIndex       !== undefined) patch.chunkIndex       = data.chunkIndex ?? null
  if (data.chunkTotal       !== undefined) patch.chunkTotal       = data.chunkTotal ?? null
  if (data.metadata         !== undefined) patch.metadata         = data.metadata

  const rows = await db.update(document).set(patch).where(eq(document.id, id)).returning()
  return rows[0] ?? null
}

export async function deleteDocument(db: Db, id: number) {
  const rows = await db.delete(document).where(eq(document.id, id)).returning()
  return rows[0] ?? null
}

export async function addDocumentToCollection(db: Db, documentId: number, data: AddToCollectionDto) {
  const rows = await db.insert(documentCollection).values({
    documentId,
    collectionId: data.collectionId,
    position:     data.position ?? null,
  }).onConflictDoNothing().returning()
  return rows[0] ?? null
}

export async function removeDocumentFromCollection(db: Db, documentId: number, collectionId: number) {
  const rows = await db.delete(documentCollection)
    .where(
      sql`${documentCollection.documentId} = ${documentId}
       AND ${documentCollection.collectionId} = ${collectionId}`
    )
    .returning()
  return rows[0] ?? null
}

export async function getDocumentChunks(db: Db, parentDocumentId: number) {
  return db.select().from(document)
    .where(eq(document.parentDocumentId, parentDocumentId))
    .orderBy(document.chunkIndex)
}
