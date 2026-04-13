import { generateEmbedding, toSearchResultDto } from '@/module/collection/helpers'
import { CollectionSearchBodySchema, CollectionSearchResultSchema } from '@/module/collection/schema'
import { Env } from '@/types'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'

const router = new OpenAPIHono<Env>()

// ── POST /collections/search ──────────────────────────────────────────────────
// 必須定義在 /{collectionId} 參數路由之前，避免 path 衝突

router.openapi(
  createRoute({
    tags: ['Collection'],
    summary: 'Search collections',
    description:
      'Search collections using hybrid RRF (vector cosine + pg_trgm full-text) search on title. Returns collections ranked by RRF fusion score.',
    method: 'post',
    path: '/collections/search',
    request: {
      body: { content: { 'application/json': { schema: CollectionSearchBodySchema } } },
    },
    responses: {
      200: {
        description: 'Ranked list of matching collections with RRF fusion scores',
        content: { 'application/json': { schema: CollectionSearchResultSchema.array() } },
      },
    },
  }),
  async (c) => {
    const { query, limit, k } = c.req.valid('json')

    const embeddingVector = await generateEmbedding(c.env.OPENAI_API_KEY, query)

    const collectionRepository = c.get('collectionRepository')
    const results = await collectionRepository.searchCollections({
      embeddingVector,
      query,
      limit: limit ?? 10,
      k: k ?? 60,
    })
    console.log("🚀 ~ results:", results)

    return c.json(results.map(toSearchResultDto), 200)
  },
)

export default router
