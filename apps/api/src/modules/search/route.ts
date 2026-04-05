import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import type { Db } from '@/db/client'
import { globalSearch, collectionSearch } from '@/lib/search'

type Env = { Variables: { db: Db } }

const router = new OpenAPIHono<Env>()

const SearchRequestSchema = z.object({
  q:            z.string().min(1).openapi({ description: 'Keyword query for trigram search' }),
  embedding:    z.array(z.number()).optional()
                  .openapi({ description: 'Query embedding vector (1536 dims)' }),
  collectionId: z.number().int().positive().optional()
                  .openapi({ description: 'Scope search to this collection' }),
  limit:        z.number().int().min(1).max(100).default(10),
})

const SearchResultSchema = z.object({
  id:          z.number(),
  title:       z.string(),
  description: z.string().nullable(),
  contentText: z.string().nullable(),
  metadata:    z.record(z.unknown()),
  score:       z.number(),
})

router.openapi(
  createRoute({
    method: 'post', path: '/search',
    request: { body: { content: { 'application/json': { schema: SearchRequestSchema } } } },
    responses: {
      200: {
        description: 'Search results ranked by RRF score',
        content: { 'application/json': { schema: z.array(SearchResultSchema) } },
      },
    },
  }),
  async (c) => {
    const { q, embedding, collectionId, limit } = c.req.valid('json')
    const db = c.var.db

    const results = collectionId
      ? await collectionSearch(db, { collectionId, queryText: q, queryEmbedding: embedding ?? null, limit })
      : await globalSearch(db,     {               queryText: q, queryEmbedding: embedding ?? null, limit })

    return c.json(results)
  }
)

export default router
