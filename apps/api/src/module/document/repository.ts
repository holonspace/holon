import { Database } from '@/db'
import { document } from '@/db/schema'
import { and, eq, isNull } from 'drizzle-orm'

type NewDocument = typeof document.$inferInsert
type Document = typeof document.$inferSelect

export function createDocumentRepository(db: Database) {
  return {
    async isDocumentExist(documentId: string): Promise<boolean> {
      const result = await db
        .select({ id: document.id })
        .from(document)
        .where(
          and(
            eq(document.id, documentId),
            isNull(document.deletedAt),
          )
        )
        .limit(1)

      return result.length > 0
    },

    async findDocumentByDocumentId(documentId: string): Promise<Document | null> {
      const [row] = await db
        .select()
        .from(document)
        .where(
          and(
            eq(document.id, documentId),
            isNull(document.deletedAt),
          )
        )
        .limit(1)

      return row ?? null
    },

    async createDocument(data: NewDocument): Promise<Document> {
      const result = await db
        .insert(document)
        .values(data)
        .returning()

      return result[0]
    },
  }
}

export type DocumentRepository = ReturnType<typeof createDocumentRepository>
