import { Database } from '@/db'
import { collection, collectionClosure, documentToCollection } from '@/db/schema'
import { document } from '@/db/schema/document'
import type { CollectionMetadata } from '@/db/types/collection'
import type { Document } from '@/db/types/document'
import { and, eq, inArray, isNull, not, sql } from 'drizzle-orm'

// candidate pool = max(limit × 10, 100)
const CANDIDATE_MULTIPLIER = 10
const MIN_CANDIDATE_LIMIT = 100

type CollectionRow = typeof collection.$inferSelect

export function createCollectionRepository(db: Database) {
  return {
    /**
     * 建立 collection 並插入 closure table 自身行（depth=0）。
     */
    async createCollection(
      data: { title: string; description?: string | null; metadata?: CollectionMetadata | null; embedding?: number[] | null },
    ): Promise<CollectionRow> {
      return db.transaction(async (tx) => {
        const [newCollection] = await tx
          .insert(collection)
          .values({
            title: data.title,
            description: data.description ?? null,
            metadata: (data.metadata ?? {}) as CollectionMetadata,
            ...(data.embedding ? { embedding: data.embedding } : {}),
          })
          .returning()

        await tx.insert(collectionClosure).values({
          ancestorId: newCollection.id,
          descendantId: newCollection.id,
          depth: 0,
        })

        return newCollection
      })
    },

    /**
     * 透過 UUID 取得單一 collection。
     */
    async findCollectionByCollectionId(collectionId: string): Promise<CollectionRow | null> {
      const [row] = await db
        .select()
        .from(collection)
        .where(eq(collection.id, collectionId))
        .limit(1)

      return row ?? null
    },

    /**
     * 列出 collections。
     * - 不傳 ancestorId：回傳所有 collections。
     * - 傳入 ancestorId：透過 collection_closure 只回傳該節點本身及其所有後代。
     */
    async listCollections(ancestorId?: string): Promise<CollectionRow[]> {
      if (ancestorId === undefined) {
        return db.select().from(collection)
      }
      return db
        .select({
          id: collection.id,
          title: collection.title,
          description: collection.description,
          metadata: collection.metadata,
          embedding: collection.embedding,
          createdAt: collection.createdAt,
          updatedAt: collection.updatedAt,
        })
        .from(collection)
        .innerJoin(collectionClosure, eq(collectionClosure.descendantId, collection.id))
        .where(eq(collectionClosure.ancestorId, ancestorId))
    },

    /**
     * 更新 collection 的 title / description / metadata。
     */
    async updateCollection(
      collectionId: string,
      data: { title?: string; description?: string | null; metadata?: CollectionMetadata | null; embedding?: number[] | null },
    ): Promise<CollectionRow | null> {
      const updateData: Partial<typeof collection.$inferInsert> = {}
      if (data.title !== undefined) updateData.title = data.title
      if (data.description !== undefined) updateData.description = data.description
      if (data.metadata !== undefined) updateData.metadata = data.metadata as CollectionMetadata
      if (data.embedding !== undefined) updateData.embedding = data.embedding as unknown as typeof collection.$inferInsert['embedding']
      updateData.updatedAt = new Date()

      const [updated] = await db
        .update(collection)
        .set(updateData)
        .where(eq(collection.id, collectionId))
        .returning()

      return updated ?? null
    },

    /**
     * 刪除 collection 及其所有後代（子樹刪除）。
     * closure table 與 document_to_collection 透過 ON DELETE CASCADE 自動清除。
     * 回傳 true 表示成功，false 表示找不到該 collection。
     */
    async deleteCollection(collectionId: string): Promise<boolean> {
      return db.transaction(async (tx) => {
        const [root] = await tx
          .select({ id: collection.id })
          .from(collection)
          .where(eq(collection.id, collectionId))
          .limit(1)

        if (!root) return false

        const descendants = await tx
          .select({ id: collectionClosure.descendantId })
          .from(collectionClosure)
          .where(eq(collectionClosure.ancestorId, root.id))

        const idsToDelete = descendants.map((d) => d.id)

        await tx.delete(collection).where(inArray(collection.id, idsToDelete))

        return true
      })
    },

    /**
     * 檢查 ancestorId 是否為 nodeId 的祖先（含自身，depth=0）。
     * 用於循環移動檢測。
     */
    async isDescendant(nodeId: string, ancestorId: string): Promise<boolean> {
      const [row] = await db
        .select({ ancestorId: collectionClosure.ancestorId })
        .from(collectionClosure)
        .where(
          and(
            eq(collectionClosure.ancestorId, ancestorId),
            eq(collectionClosure.descendantId, nodeId),
          ),
        )
        .limit(1)

      return row !== undefined
    },

    /**
     * 將 nodeId 所代表的子樹移入 parentId 下成為其子節點。
     * 演算法：
     *   1. Detach — 刪除所有「descendant 在子樹內、ancestor 在子樹外」的 closure rows
     *   2. Re-attach — JS cross join (parent 祖先鏈 × node 子樹) 批量插入新 closure rows
     */
    async moveToParent(nodeId: string, parentId: string): Promise<void> {
      await db.transaction(async (tx) => {
        // 1. 取得 node 子樹的所有 id（含自身）
        const subtreeRows = await tx
          .select({ id: collectionClosure.descendantId })
          .from(collectionClosure)
          .where(eq(collectionClosure.ancestorId, nodeId))

        const subtreeIds = subtreeRows.map((r) => r.id)

        // 2. Detach：移除舊的外部祖先連接
        await tx
          .delete(collectionClosure)
          .where(
            and(
              inArray(collectionClosure.descendantId, subtreeIds),
              not(inArray(collectionClosure.ancestorId, subtreeIds)),
            ),
          )

        // 3. 取 parent 的所有祖先（含自身）與相對 depth
        const supertreeRows = await tx
          .select({
            ancestorId: collectionClosure.ancestorId,
            depth: collectionClosure.depth,
          })
          .from(collectionClosure)
          .where(eq(collectionClosure.descendantId, parentId))

        // 4. 取 node 子樹的所有後代（含自身）與相對 depth
        const subtreeWithDepthRows = await tx
          .select({
            descendantId: collectionClosure.descendantId,
            depth: collectionClosure.depth,
          })
          .from(collectionClosure)
          .where(eq(collectionClosure.ancestorId, nodeId))

        // 5. JS cross join → 批量插入新的 closure rows
        const newRows = supertreeRows.flatMap((sup) =>
          subtreeWithDepthRows.map((sub) => ({
            ancestorId: sup.ancestorId,
            descendantId: sub.descendantId,
            depth: sup.depth + sub.depth + 1,
          })),
        )

        if (newRows.length > 0) {
          await tx.insert(collectionClosure).values(newRows)
        }
      })
    },

    // ── Document-Collection Operations ─────────────────────────────────────────

    /**
     * 將文件加入集合。若已存在則冪等（no-op）。
     * 回傳 true 表示新增成功，false 表示已存在。
     */
    async addDocumentToCollection(collectionId: string, documentId: string): Promise<boolean> {
      const result = await db
        .insert(documentToCollection)
        .values({ collectionId, documentId })
        .onConflictDoNothing()
        .returning()

      return result.length > 0
    },

    /**
     * 從集合移除文件。
     * 回傳 true 表示成功移除，false 表示關聯不存在。
     */
    async removeDocumentFromCollection(collectionId: string, documentId: string): Promise<boolean> {
      const result = await db
        .delete(documentToCollection)
        .where(
          and(
            eq(documentToCollection.collectionId, collectionId),
            eq(documentToCollection.documentId, documentId),
          ),
        )
        .returning()

      return result.length > 0
    },

    /**
     * 檢查文件是否已在集合中。
     */
    async isDocumentInCollection(collectionId: string, documentId: string): Promise<boolean> {
      const [row] = await db
        .select({ documentId: documentToCollection.documentId })
        .from(documentToCollection)
        .where(
          and(
            eq(documentToCollection.collectionId, collectionId),
            eq(documentToCollection.documentId, documentId),
          ),
        )
        .limit(1)

      return row !== undefined
    },

    /**
     * 列出集合內所有文件（已過濾軟刪除）。
     * @param options.recursive 若為 true，同時包含所有子孫 collection 的文件（去重）。
     */
    async listDocumentsInCollection(
      collectionId: string,
      options: { recursive?: boolean } = {},
    ): Promise<Document[]> {
      const { recursive = false } = options

      let targetIds: string[]

      if (recursive) {
        const rows = await db
          .select({ id: collectionClosure.descendantId })
          .from(collectionClosure)
          .where(eq(collectionClosure.ancestorId, collectionId))
        targetIds = rows.map((r) => r.id)
      } else {
        targetIds = [collectionId]
      }

      return db
        .selectDistinct({
          id: document.id,
          title: document.title,
          description: document.description,
          content: document.content,
          metadata: document.metadata,
          createdAt: document.createdAt,
          updatedAt: document.updatedAt,
          deletedAt: document.deletedAt,
        })
        .from(documentToCollection)
        .innerJoin(document, eq(documentToCollection.documentId, document.id))
        .where(
          and(
            inArray(documentToCollection.collectionId, targetIds),
            isNull(document.deletedAt),
          ),
        )
    },

    /**
     * 向量 + 全文 RRF 混合搜尋 collections。
     *
     * 策略：
     *   vector_search — cosine distance 升序，取 candidateLimit 筆
     *   text_search   — ParadeDB BM25 (|||) 全文搜尋，取 candidateLimit 筆
     *   combined      — FULL OUTER JOIN，以 RRF 公式融合排名
     */
    async searchCollections(opts: {
      embeddingVector: number[]
      query: string
      limit: number
      k: number
    }): Promise<Array<CollectionRow & { score: number }>> {
      const { embeddingVector, query, limit, k } = opts
      const candidateLimit = Math.max(limit * CANDIDATE_MULTIPLIER, MIN_CANDIDATE_LIMIT)
      const embeddingStr = `[${embeddingVector.join(',')}]`

      type Row = {
        id: string
        title: string
        description: string | null
        metadata: CollectionMetadata
        embedding: number[] | null
        created_at: string
        updated_at: string
        rrf_score: string
      }

      const rows = await db.execute<Row>(sql`
        WITH
        vector_search AS (
          SELECT *,
            ROW_NUMBER() OVER (
              ORDER BY embedding <=> ${sql.raw(`'${embeddingStr}'`)}::vector
            ) AS vrank
          FROM collection
          WHERE embedding IS NOT NULL
          ORDER BY embedding <=> ${sql.raw(`'${embeddingStr}'`)}::vector
          LIMIT ${candidateLimit}
        ),

        text_search AS (
          SELECT *,
            ROW_NUMBER() OVER (
              ORDER BY pdb.score(id) DESC
            ) AS trank
          FROM collection
          WHERE title ||| ${query}
          ORDER BY pdb.score(id) DESC
          LIMIT ${candidateLimit}
        ),

        combined AS (
          SELECT
            COALESCE(v.id,          t.id)          AS id,
            COALESCE(v.title,       t.title)       AS title,
            COALESCE(v.description, t.description) AS description,
            COALESCE(v.metadata,    t.metadata)    AS metadata,
            COALESCE(v.embedding,   t.embedding)   AS embedding,
            COALESCE(v.created_at,  t.created_at)  AS created_at,
            COALESCE(v.updated_at,  t.updated_at)  AS updated_at,
            COALESCE(1.0 / (${k} + v.vrank), 0.0) +
            COALESCE(1.0 / (${k} + t.trank), 0.0) AS rrf_score
          FROM vector_search v
          FULL OUTER JOIN text_search t ON v.id = t.id
        )

        SELECT * FROM combined
        ORDER BY rrf_score DESC
        LIMIT ${limit}
      `)

      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        metadata: r.metadata,
        embedding: r.embedding,
        createdAt: new Date(r.created_at),
        updatedAt: new Date(r.updated_at),
        score: parseFloat(r.rrf_score),
      }))
    },

    /**
     * 將 nodeId 從父節點移出，使其成為根節點。
     * 只執行 Detach，保留子樹內部的 closure rows。
     * 對已是根節點的 collection 為冪等操作（no-op）。
     */
    async removeFromParent(nodeId: string): Promise<void> {
      await db.transaction(async (tx) => {
        // 取得 node 子樹的所有 id（含自身）
        const subtreeRows = await tx
          .select({ id: collectionClosure.descendantId })
          .from(collectionClosure)
          .where(eq(collectionClosure.ancestorId, nodeId))

        const subtreeIds = subtreeRows.map((r) => r.id)

        // Detach：移除所有外部祖先連接
        await tx
          .delete(collectionClosure)
          .where(
            and(
              inArray(collectionClosure.descendantId, subtreeIds),
              not(inArray(collectionClosure.ancestorId, subtreeIds)),
            ),
          )
      })
    },
  }
}

export type CollectionRepository = ReturnType<typeof createCollectionRepository>
