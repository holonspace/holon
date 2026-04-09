import { Database } from '@/db'
import { collection, collectionClosure, documentToCollection } from '@/db/schema'
import { document } from '@/db/schema/document'
import type { CollectionMetadata } from '@/db/types/collection'
import type { Document } from '@/db/types/document'
import { and, eq, inArray, isNull, not } from 'drizzle-orm'

type CollectionRow = typeof collection.$inferSelect

export function createCollectionRepository(db: Database) {
  return {
    /**
     * 建立 collection 並插入 closure table 自身行（depth=0）。
     */
    async createCollection(
      data: { title: string; description?: string | null; metadata?: CollectionMetadata | null },
    ): Promise<CollectionRow> {
      return db.transaction(async (tx) => {
        const [newCollection] = await tx
          .insert(collection)
          .values({
            title: data.title,
            description: data.description ?? null,
            metadata: (data.metadata ?? {}) as CollectionMetadata,
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
        .where(eq(collection.collectionId, collectionId))
        .limit(1)

      return row ?? null
    },

    /**
     * 列出 collections。
     * - 不傳 ancestorInternalId：回傳所有 collections。
     * - 傳入 ancestorInternalId：透過 collection_closure 只回傳該節點本身及其所有後代。
     */
    async listCollections(ancestorInternalId?: number): Promise<CollectionRow[]> {
      if (ancestorInternalId === undefined) {
        return db.select().from(collection)
      }
      return db
        .select({
          id: collection.id,
          collectionId: collection.collectionId,
          title: collection.title,
          description: collection.description,
          metadata: collection.metadata,
          createdAt: collection.createdAt,
          updatedAt: collection.updatedAt,
        })
        .from(collection)
        .innerJoin(collectionClosure, eq(collectionClosure.descendantId, collection.id))
        .where(eq(collectionClosure.ancestorId, ancestorInternalId))
    },

    /**
     * 更新 collection 的 title / description / metadata。
     */
    async updateCollection(
      collectionId: string,
      data: { title?: string; description?: string | null; metadata?: CollectionMetadata | null },
    ): Promise<CollectionRow | null> {
      const updateData: Partial<typeof collection.$inferInsert> = {}
      if (data.title !== undefined) updateData.title = data.title
      if (data.description !== undefined) updateData.description = data.description
      if (data.metadata !== undefined) updateData.metadata = data.metadata as CollectionMetadata
      updateData.updatedAt = new Date()

      const [updated] = await db
        .update(collection)
        .set(updateData)
        .where(eq(collection.collectionId, collectionId))
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
          .where(eq(collection.collectionId, collectionId))
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
    async isDescendant(nodeId: number, ancestorId: number): Promise<boolean> {
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
    async moveToParent(nodeId: number, parentId: number): Promise<void> {
      await db.transaction(async (tx) => {
        // 1. 取得 node 子樹的所有 internal id（含自身）
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
    async addDocumentToCollection(collectionInternalId: number, documentInternalId: number): Promise<boolean> {
      const result = await db
        .insert(documentToCollection)
        .values({ collectionId: collectionInternalId, documentId: documentInternalId })
        .onConflictDoNothing()
        .returning()

      return result.length > 0
    },

    /**
     * 從集合移除文件。
     * 回傳 true 表示成功移除，false 表示關聯不存在。
     */
    async removeDocumentFromCollection(collectionInternalId: number, documentInternalId: number): Promise<boolean> {
      const result = await db
        .delete(documentToCollection)
        .where(
          and(
            eq(documentToCollection.collectionId, collectionInternalId),
            eq(documentToCollection.documentId, documentInternalId),
          ),
        )
        .returning()

      return result.length > 0
    },

    /**
     * 檢查文件是否已在集合中。
     */
    async isDocumentInCollection(collectionInternalId: number, documentInternalId: number): Promise<boolean> {
      const [row] = await db
        .select({ documentId: documentToCollection.documentId })
        .from(documentToCollection)
        .where(
          and(
            eq(documentToCollection.collectionId, collectionInternalId),
            eq(documentToCollection.documentId, documentInternalId),
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
      collectionInternalId: number,
      options: { recursive?: boolean } = {},
    ): Promise<Document[]> {
      const { recursive = false } = options

      let targetIds: number[]

      if (recursive) {
        const rows = await db
          .select({ id: collectionClosure.descendantId })
          .from(collectionClosure)
          .where(eq(collectionClosure.ancestorId, collectionInternalId))
        targetIds = rows.map((r) => r.id)
      } else {
        targetIds = [collectionInternalId]
      }

      return db
        .selectDistinct({
          id: document.id,
          documentId: document.documentId,
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
     * 將 nodeId 從父節點移出，使其成為根節點。
     * 只執行 Detach，保留子樹內部的 closure rows。
     * 對已是根節點的 collection 為冪等操作（no-op）。
     */
    async removeFromParent(nodeId: number): Promise<void> {
      await db.transaction(async (tx) => {
        // 取得 node 子樹的所有 internal id（含自身）
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
