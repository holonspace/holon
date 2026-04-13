import { Database } from '@/db'
import type { ChunkMetadata } from '@/db/types/chunk'
import { sql } from 'drizzle-orm'
import type { SearchResultDto } from './schema'

// candidate pool = max(limit × 10, 100)
// 確保 RRF 有足夠的候選集合可融合
const CANDIDATE_MULTIPLIER = 10
const MIN_CANDIDATE_LIMIT = 100

type SearchResultRow = {
  chunk_id: string
  doc_uuid: string
  prev_chunk_id: string | null
  next_chunk_id: string | null
  content: string
  metadata: ChunkMetadata
  rrf_score: string
}

export function createSearchRepository(db: Database) {
  return {
    /**
     * 向量 + 全文 Search Weighted RRF 混合搜尋。
     *
     * 分數範圍：~0.016 ~ ~0.033（兩路皆第 1 時最高，k=60）
     *
     * 策略：兩段式（解決 HNSW pre-filter 問題）
     *   Step 1 (scoped CTE)：精確取出屬於 scope 的 chunk 集合
     *   Step 2a vector_scored：計算轉換分數 vscore = 1/(1+cosine_distance)，範圍 [0.333,1.0]
     *   Step 2b vector_search：套用 vectorWeight 加權後重新排序，得 vrank
     *   Step 2c text_search：取 BM25 分數排序，得 trank
     *   Step 3 combined：rrf_score = 1/(k+vrank) + 1/(k+trank)
     *
     * - vectorWeight > 1.0 → 提升向量路排序（影響 vrank）
     * - k=60（預設）：排名差異平滑
     * - BM25 (||| operator) 使用 pg_search 擴展
     */
    async hybridSearch(opts: {
      embeddingVector: number[]
      query: string
      limit: number
      k: number
      vectorWeight: number
      minScore: number
      collectionId?: string
      documentId?: string
    }): Promise<SearchResultDto[]> {
      const { embeddingVector, query, limit, k, vectorWeight, minScore, collectionId, documentId } =
        opts
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
        ? sql`AND d.id = ${documentId}::uuid`
        : collectionId
          ? sql`AND col.id = ${collectionId}::uuid`
          : sql``

      const rows = await db.execute<SearchResultRow>(sql`
        WITH scoped AS (
          SELECT
            c.id            AS chunk_id,
            c.document_id,
            c.prev_chunk_id,
            c.next_chunk_id,
            c.content,
            c.metadata,
            c.embedding,
            d.id            AS doc_uuid
          FROM chunk c
          JOIN document d ON d.id = c.document_id
          ${scopeJoin}
          WHERE c.deleted_at IS NULL
            AND c.embedding IS NOT NULL
            AND d.deleted_at IS NULL
            ${scopeWhere}
        ),

        vector_scored AS (
          -- 轉換：vscore = 1/(1+cosine_distance)，範圍 [0.333, 1.0]
          SELECT *,
            1.0 / (1.0 + (embedding <=> ${embeddingStr}::vector)) AS vscore
          FROM scoped
          ORDER BY embedding <=> ${embeddingStr}::vector
          LIMIT ${candidateLimit}
        ),

        vector_search AS (
          -- 套用 vectorWeight 加權後重新排序，得加權後的 vrank
          SELECT *,
            vscore * ${vectorWeight} AS weighted_vscore,
            ROW_NUMBER() OVER (
              ORDER BY vscore * ${vectorWeight} DESC
            ) AS vrank
          FROM vector_scored
        ),

        text_search AS (
          SELECT
            s.chunk_id,
            s.document_id,
            s.prev_chunk_id,
            s.next_chunk_id,
            s.content,
            s.metadata,
            s.doc_uuid,
            ROW_NUMBER() OVER (ORDER BY pdb.score(c.id) DESC) AS trank
          FROM chunk c
          JOIN scoped s ON s.chunk_id = c.id
          WHERE c.content ||| ${query}
          ORDER BY pdb.score(c.id) DESC
          LIMIT ${candidateLimit}
        ),

        combined AS (
          SELECT
            COALESCE(v.chunk_id, t.chunk_id)  AS chunk_id,
            COALESCE(v.doc_uuid, t.doc_uuid)  AS doc_uuid,
            COALESCE(v.prev_chunk_id, t.prev_chunk_id) AS prev_chunk_id,
            COALESCE(v.next_chunk_id, t.next_chunk_id) AS next_chunk_id,
            COALESCE(v.content,  t.content)   AS content,
            COALESCE(v.metadata, t.metadata)  AS metadata,
            COALESCE(1.0 / (${k} + v.vrank), 0.0) +
            COALESCE(1.0 / (${k} + t.trank), 0.0) AS rrf_score
          FROM vector_search v
          FULL OUTER JOIN text_search t USING (chunk_id)
        )

        SELECT * FROM combined
        WHERE rrf_score >= ${minScore}
        ORDER BY rrf_score DESC
        LIMIT ${limit}
      `)
      
      return rows.map((row) => ({
        chunkId: row.chunk_id,
        documentId: row.doc_uuid,
        prevChunkId: row.prev_chunk_id,
        nextChunkId: row.next_chunk_id,
        content: row.content,
        metadata: row.metadata,
        score: parseFloat(row.rrf_score),
      }))
    },
  }
}

export type SearchRepository = ReturnType<typeof createSearchRepository>
