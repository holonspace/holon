import { sql } from 'drizzle-orm'
import type { Db } from '@/db/client'

export interface SearchResult {
  id:          number
  title:       string
  description: string | null
  contentText: string | null
  metadata:    unknown
  score:       number
}

/**
 * Global RRF search — vector + trigram across all documents.
 * Pass null for queryEmbedding to do text-only search.
 * Pass null for queryText to do vector-only search.
 */
export async function globalSearch(
  db: Db,
  opts: {
    queryText:      string | null
    queryEmbedding: number[] | null
    limit:          number
  }
): Promise<SearchResult[]> {
  const { queryText, queryEmbedding, limit } = opts
  const k = 60

  const embeddingLiteral = queryEmbedding
    ? `'[${queryEmbedding.join(',')}]'::vector`
    : null

  // NOTE: DEMO only — raw SQL with manual escaping.
  // Production should use fully parameterised queries.
  const safeText = queryText?.replace(/'/g, "''") ?? ''

  const rows = await db.execute(sql.raw(`
    WITH vector_ranked AS (
      ${embeddingLiteral ? `
        SELECT id, RANK() OVER (ORDER BY embedding <=> ${embeddingLiteral}) AS rnk
        FROM document
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> ${embeddingLiteral}
        LIMIT 60
      ` : `SELECT NULL::int AS id, NULL::bigint AS rnk WHERE false`}
    ),
    text_ranked AS (
      ${queryText ? `
        SELECT id, RANK() OVER (ORDER BY similarity(content_text, '${safeText}') DESC) AS rnk
        FROM document
        WHERE content_text % '${safeText}'
        LIMIT 60
      ` : `SELECT NULL::int AS id, NULL::bigint AS rnk WHERE false`}
    ),
    rrf AS (
      SELECT
        COALESCE(v.id, t.id)                                          AS id,
        COALESCE(1.0 / (${k} + v.rnk), 0.0)
        + COALESCE(1.0 / (${k} + t.rnk), 0.0)                        AS score
      FROM vector_ranked v
      FULL OUTER JOIN text_ranked t USING (id)
    )
    SELECT d.id, d.title, d.description, d.content_text, d.metadata, r.score
    FROM rrf r
    JOIN document d ON d.id = r.id
    ORDER BY r.score DESC
    LIMIT ${limit}
  `))

  return rows.rows as SearchResult[]
}

/**
 * Collection-scoped RRF search — no JOIN between document and document_collection.
 * Filtering is done via = ANY(subquery).
 */
export async function collectionSearch(
  db: Db,
  opts: {
    collectionId:   number
    queryText:      string | null
    queryEmbedding: number[] | null
    limit:          number
  }
): Promise<SearchResult[]> {
  const { collectionId, queryText, queryEmbedding, limit } = opts
  const k = 60

  const embeddingLiteral = queryEmbedding
    ? `'[${queryEmbedding.join(',')}]'::vector`
    : null

  // NOTE: DEMO only — raw SQL with manual escaping.
  const safeText = queryText?.replace(/'/g, "''") ?? ''

  const rows = await db.execute(sql.raw(`
    WITH collection_ids AS (
      SELECT document_id FROM document_collection WHERE collection_id = ${collectionId}
    ),
    vector_ranked AS (
      ${embeddingLiteral ? `
        SELECT id, RANK() OVER (ORDER BY embedding <=> ${embeddingLiteral}) AS rnk
        FROM document
        WHERE id = ANY(SELECT document_id FROM collection_ids)
          AND embedding IS NOT NULL
        ORDER BY embedding <=> ${embeddingLiteral}
        LIMIT 60
      ` : `SELECT NULL::int AS id, NULL::bigint AS rnk WHERE false`}
    ),
    text_ranked AS (
      ${queryText ? `
        SELECT id, RANK() OVER (ORDER BY similarity(content_text, '${safeText}') DESC) AS rnk
        FROM document
        WHERE id = ANY(SELECT document_id FROM collection_ids)
          AND content_text % '${safeText}'
        LIMIT 60
      ` : `SELECT NULL::int AS id, NULL::bigint AS rnk WHERE false`}
    ),
    rrf AS (
      SELECT
        COALESCE(v.id, t.id)                                          AS id,
        COALESCE(1.0 / (${k} + v.rnk), 0.0)
        + COALESCE(1.0 / (${k} + t.rnk), 0.0)                        AS score
      FROM vector_ranked v
      FULL OUTER JOIN text_ranked t USING (id)
    )
    SELECT d.id, d.title, d.description, d.content_text, d.metadata, r.score
    FROM rrf r
    JOIN document d ON d.id = r.id
    ORDER BY r.score DESC
    LIMIT ${limit}
  `))

  return rows.rows as SearchResult[]
}
