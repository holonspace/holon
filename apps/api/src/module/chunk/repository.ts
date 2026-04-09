import { Database } from '@/db'
import { chunk, document } from '@/db/schema'
import { and, count, eq, isNull } from 'drizzle-orm'

type NewChunk = typeof chunk.$inferInsert
type Chunk = typeof chunk.$inferSelect

export function createChunkRepository(db: Database) {
  return {
    /**
     * 透過 document UUID 取得 document int id 與下一個 chunk position。
     * 若 document 不存在或已軟刪除，回傳 null。
     */
    async getDocumentContext(documentId: string): Promise<{ documentIntId: number; nextPosition: number } | null> {
      const docResult = await db
        .select({ id: document.id })
        .from(document)
        .where(and(eq(document.documentId, documentId), isNull(document.deletedAt)))
        .limit(1)

      if (!docResult[0]) return null

      const documentIntId = docResult[0].id
      const countResult = await db
        .select({ cnt: count(chunk.id) })
        .from(chunk)
        .where(and(eq(chunk.documentId, documentIntId), isNull(chunk.deletedAt)))

      return { documentIntId, nextPosition: Number(countResult[0]?.cnt ?? 0) }
    },

    async createChunk(data: NewChunk): Promise<Chunk> {
      const result = await db.insert(chunk).values(data).returning()
      return result[0]
    },
  }
}

export type ChunkRepository = ReturnType<typeof createChunkRepository>
