import { Database } from '@/db'
import { chunk } from '@/db/schema'
import type { ChunkMetadata } from '@/db/types/chunk'
import { and, eq, isNull, sql } from 'drizzle-orm'

type Chunk = typeof chunk.$inferSelect

export type AdjacentChunk = {
  chunkId: string
  prevChunkId: string | null
  nextChunkId: string | null
  content: string
  metadata: ChunkMetadata
}

export function createChunkRepository(db: Database) {
  return {
    /**
     * Insert a new chunk at the tail of the linked list for the given document.
     * Uses FOR UPDATE to prevent race conditions when finding the current tail.
     */
    async createChunk(data: {
      documentId: string
      content: string
      embedding: number[] | null
      metadata: Record<string, unknown>
    }): Promise<Chunk> {
      return db.transaction(async (tx) => {
        // Lock the current tail chunk to prevent concurrent inserts
        const tailResult = await tx.execute<{ id: string }>(sql`
          SELECT id FROM chunk
          WHERE document_id = ${data.documentId}
            AND next_chunk_id IS NULL
            AND deleted_at IS NULL
          FOR UPDATE
        `)

        const tail = tailResult[0]

        const inserted = await tx
          .insert(chunk)
          .values({
            documentId: data.documentId,
            content: data.content,
            embedding: data.embedding,
            metadata: data.metadata as ChunkMetadata,
            prevChunkId: tail?.id ?? null,
            nextChunkId: null,
          })
          .returning()

        const newChunk = inserted[0]

        if (tail?.id) {
          await tx
            .update(chunk)
            .set({ nextChunkId: newChunk.id })
            .where(eq(chunk.id, tail.id))
        }

        return newChunk
      })
    },

    /**
     * Soft-delete a chunk while maintaining linked list integrity.
     * Bypasses the deleted chunk by relinking prev ↔ next neighbours.
     * Returns false if the chunk does not exist or is already deleted.
     */
    async deleteChunk(chunkId: string, documentId: string): Promise<boolean> {
      return db.transaction(async (tx) => {
        // Lock the target chunk
        const targetResult = await tx.execute<{
          id: string
          prev_chunk_id: string | null
          next_chunk_id: string | null
        }>(sql`
          SELECT id, prev_chunk_id, next_chunk_id FROM chunk
          WHERE id = ${chunkId}
            AND document_id = ${documentId}
            AND deleted_at IS NULL
          FOR UPDATE
        `)

        const target = targetResult[0]

        if (!target) return false

        const prevId = target.prev_chunk_id
        const nextId = target.next_chunk_id

        // Relink prev → next
        if (prevId) {
          await tx
            .update(chunk)
            .set({ nextChunkId: nextId })
            .where(eq(chunk.id, prevId))
        }

        // Relink next → prev
        if (nextId) {
          await tx
            .update(chunk)
            .set({ prevChunkId: prevId })
            .where(eq(chunk.id, nextId))
        }

        // Soft delete and clear links on the target
        await tx
          .update(chunk)
          .set({
            deletedAt: new Date(),
            prevChunkId: null,
            nextChunkId: null,
          })
          .where(
            and(eq(chunk.id, chunkId), isNull(chunk.deletedAt)),
          )

        return true
      })
    },

    /**
     * Fetch up to windowSize adjacent chunks (prev/next) for each chunk ID
     * using a recursive CTE.
     *
     * prev array: ordered farthest-first (highest depth first) so that
     *   index 0 is the chunk closest to the document start.
     * next array: ordered nearest-first (lowest depth first) so that
     *   index 0 is the immediate next chunk.
     */
    async getAdjacentChunks(
      chunkIds: string[],
      windowSize: number,
    ): Promise<Map<string, { prev: AdjacentChunk[]; next: AdjacentChunk[] }>> {
      if (chunkIds.length === 0) return new Map()

      type Row = {
        origin_id: string
        direction: 'prev' | 'next'
        id: string
        prev_chunk_id: string | null
        next_chunk_id: string | null
        content: string
        metadata: ChunkMetadata
        depth: number
      }

      // Build a parameterised ARRAY constructor: ARRAY[$1::uuid, $2::uuid, ...]
      const uuidArray = sql`ARRAY[${sql.join(chunkIds.map((id) => sql`${id}::uuid`), sql`, `)}]`

      const result = await db.execute<Row>(sql`
        WITH RECURSIVE
        origins AS (
          SELECT id AS origin_id, prev_chunk_id, next_chunk_id
          FROM chunk
          WHERE id = ANY(${uuidArray}) AND deleted_at IS NULL
        ),
        walk_prev(origin_id, id, prev_chunk_id, next_chunk_id, content, metadata, depth) AS (
          SELECT o.origin_id, c.id, c.prev_chunk_id, c.next_chunk_id, c.content, c.metadata, 1
          FROM origins o
          JOIN chunk c ON c.id = o.prev_chunk_id AND c.deleted_at IS NULL
          UNION ALL
          SELECT wp.origin_id, c.id, c.prev_chunk_id, c.next_chunk_id, c.content, c.metadata, wp.depth + 1
          FROM walk_prev wp
          JOIN chunk c ON c.id = wp.prev_chunk_id AND c.deleted_at IS NULL
          WHERE wp.depth < ${windowSize}
        ),
        walk_next(origin_id, id, prev_chunk_id, next_chunk_id, content, metadata, depth) AS (
          SELECT o.origin_id, c.id, c.prev_chunk_id, c.next_chunk_id, c.content, c.metadata, 1
          FROM origins o
          JOIN chunk c ON c.id = o.next_chunk_id AND c.deleted_at IS NULL
          UNION ALL
          SELECT wn.origin_id, c.id, c.prev_chunk_id, c.next_chunk_id, c.content, c.metadata, wn.depth + 1
          FROM walk_next wn
          JOIN chunk c ON c.id = wn.next_chunk_id AND c.deleted_at IS NULL
          WHERE wn.depth < ${windowSize}
        )
        SELECT origin_id, 'prev' AS direction, id, prev_chunk_id, next_chunk_id, content, metadata, depth FROM walk_prev
        UNION ALL
        SELECT origin_id, 'next' AS direction, id, prev_chunk_id, next_chunk_id, content, metadata, depth FROM walk_next
        ORDER BY origin_id, direction, depth
      `)

      const rows = result as Row[]

      type WithDepth = { chunk: AdjacentChunk; depth: number }

      // Initialise map with empty arrays for every requested origin
      const rawMap = new Map<string, { prev: WithDepth[]; next: WithDepth[] }>(
        chunkIds.map((id) => [id, { prev: [], next: [] }]),
      )

      for (const row of rows) {
        const entry = rawMap.get(row.origin_id)
        if (!entry) continue

        const adjacent: AdjacentChunk = {
          chunkId: row.id,
          prevChunkId: row.prev_chunk_id,
          nextChunkId: row.next_chunk_id,
          content: row.content,
          metadata: row.metadata,
        }

        entry[row.direction].push({ chunk: adjacent, depth: row.depth })
      }

      // Sort: prev descending by depth (farthest first), next ascending (nearest first)
      const map = new Map<string, { prev: AdjacentChunk[]; next: AdjacentChunk[] }>()
      for (const [originId, entry] of rawMap) {
        map.set(originId, {
          prev: entry.prev
            .sort((a, b) => b.depth - a.depth)
            .map((w) => w.chunk),
          next: entry.next
            .sort((a, b) => a.depth - b.depth)
            .map((w) => w.chunk),
        })
      }

      return map
    },
  }
}

export type ChunkRepository = ReturnType<typeof createChunkRepository>
