import { Database } from '@/db'
import type { ChunkMetadata } from '@/db/types/chunk'
import { sql } from 'drizzle-orm'
import type { SearchResultDto } from './schema'

// candidate pool = max(limit × 10, 100)
// 確保 RRF 有足夠的候選集合可融合
const CANDIDATE_MULTIPLIER = 10
const MIN_CANDIDATE_LIMIT = 100

// pg_trgm 相似度閾值：限制進入 similarity() 計算的候選數量，降低 O(n) 全掃成本
const TRGM_THRESHOLD = 0.3

type SearchResultRow = {
  chunk_id: string
  doc_uuid: string
  position: number
  content: string
  metadata: ChunkMetadata
  rrf_score: string
}

export function createSearchRepository(db: Database) {
  return {
    /**
     * 向量 + 全文 RRF 混合搜尋。
     *
     * 策略：兩段式（解決 HNSW pre-filter 問題）
     *   Step 1 (scoped CTE)：精確取出屬於 scope 的 chunk 集合
     *   Step 2：在此子集上分別做向量排序與 trigram 過濾，再以 RRF 融合
     *
     * - 有 scope → sequential scan on subset，精確
     * - 無 scope → planner 可選 HNSW
     * - SET LOCAL pg_trgm.similarity_threshold 在 transaction 中生效
     */
    async hybridSearch(opts: {
      embeddingVector: number[]
      query: string
      limit: number
      k: number
      collectionId?: string
      documentId?: string
    }): Promise<SearchResultDto[]> {
      const { embeddingVector, query, limit, k, collectionId, documentId } = opts
      const candidateLimit = Math.max(limit * CANDIDATE_MULTIPLIER, MIN_CANDIDATE_LIMIT)

      // 向量字串格式：pgvector 接受 '[x1,x2,...]'
      const embeddingStr = `[${embeddingVector.join(',')}]`

      // ── 動態 JOIN / WHERE（scope 限縮）─────────────────────────────
      const scopeJoin = collectionId
        ? sql`
            JOIN document_to_collection dtc ON dtc.document_id = d.id
            JOIN collection_closure cc ON cc.descendant_id = dtc.collection_id
            JOIN collection col ON col.id = cc.ancestor_id`
        : sql``

      const scopeWhere = documentId
        ? sql`AND d.document_id = ${documentId}::uuid`
        : collectionId
          ? sql`AND col.collection_id = ${collectionId}::uuid`
          : sql``

      const rows = await db.transaction(async (tx) => {
        // SET LOCAL 只在 transaction 內有效
        await tx.execute(
          sql.raw(`SET LOCAL pg_trgm.similarity_threshold = ${TRGM_THRESHOLD}`)
        )

        return tx.execute<SearchResultRow>(sql`
          WITH scoped AS (
            SELECT
              c.chunk_id,
              c.document_id   AS doc_int_id,
              c.position,
              c.content,
              c.metadata,
              c.embedding,
              d.document_id   AS doc_uuid
            FROM chunk c
            JOIN document d ON d.id = c.document_id
            ${scopeJoin}
            WHERE c.deleted_at IS NULL
              AND c.embedding IS NOT NULL
              AND d.deleted_at IS NULL
              ${scopeWhere}
          ),

          vector_search AS (
            SELECT *,
              ROW_NUMBER() OVER (
                ORDER BY embedding <=> ${embeddingStr}::vector
              ) AS vrank
            FROM scoped
            ORDER BY embedding <=> ${embeddingStr}::vector
            LIMIT ${candidateLimit}
          ),

          text_search AS (
            SELECT *,
              ROW_NUMBER() OVER (
                ORDER BY similarity(content, ${query}) DESC
              ) AS trank
            FROM scoped
            WHERE content % ${query}
            ORDER BY similarity(content, ${query}) DESC
            LIMIT ${candidateLimit}
          ),

          combined AS (
            SELECT
              COALESCE(v.chunk_id,    t.chunk_id)    AS chunk_id,
              COALESCE(v.doc_uuid,    t.doc_uuid)    AS doc_uuid,
              COALESCE(v.position,    t.position)    AS position,
              COALESCE(v.content,     t.content)     AS content,
              COALESCE(v.metadata,    t.metadata)    AS metadata,
              COALESCE(1.0 / (${k} + v.vrank), 0.0) +
              COALESCE(1.0 / (${k} + t.trank), 0.0) AS rrf_score
            FROM vector_search v
            FULL OUTER JOIN text_search t USING (chunk_id)
          )

          SELECT * FROM combined
          ORDER BY rrf_score DESC
          LIMIT ${limit}
        `)
      })

      return rows.map((row) => ({
        chunkId: row.chunk_id,
        documentId: row.doc_uuid,
        position: Number(row.position),
        content: row.content,
        metadata: row.metadata,
        score: parseFloat(row.rrf_score),
      }))
    },
  }
}

export type SearchRepository = ReturnType<typeof createSearchRepository>
