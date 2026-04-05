import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { collection } from '@/db/schema'
import type { CreateCollectionDto, UpdateCollectionDto } from './schema'

export async function listCollections(db: Db) {
  return db.select().from(collection).orderBy(collection.createdAt)
}

export async function getCollectionById(db: Db, id: number) {
  const rows = await db.select().from(collection).where(eq(collection.id, id)).limit(1)
  return rows[0] ?? null
}

export async function createCollection(db: Db, data: CreateCollectionDto) {
  const rows = await db.insert(collection).values({
    title:       data.title,
    description: data.description ?? null,
    metadata:    data.metadata,
  }).returning()
  return rows[0]
}

export async function updateCollection(db: Db, id: number, data: UpdateCollectionDto) {
  const rows = await db.update(collection)
    .set({
      ...(data.title       !== undefined && { title:       data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.metadata    !== undefined && { metadata:    data.metadata }),
      updatedAt: new Date(),
    })
    .where(eq(collection.id, id))
    .returning()
  return rows[0] ?? null
}

export async function deleteCollection(db: Db, id: number) {
  const rows = await db.delete(collection).where(eq(collection.id, id)).returning()
  return rows[0] ?? null
}
