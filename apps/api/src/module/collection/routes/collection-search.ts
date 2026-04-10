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
      'Search collections by semantic similarity using vector cosine search on title and description. Returns collections ranked by relevance score (0~1).',
    method: 'post',
    path: '/collections/search',
    request: {
      body: { content: { 'application/json': { schema: CollectionSearchBodySchema } } },
    },
    responses: {
      200: {
        description: 'Ranked list of matching collections with cosine similarity scores',
        content: { 'application/json': { schema: CollectionSearchResultSchema.array() } },
      },
    },
  }),
  async (c) => {
    const { query, limit } = c.req.valid('json')

    const embeddingVector = await generateEmbedding(c.env.OPENAI_API_KEY, query)

    const collectionRepository = c.get('collectionRepository')
    const results = await collectionRepository.searchCollections({
      embeddingVector,
      limit: limit ?? 10,
    })

    return c.json(results.map(toSearchResultDto), 200)
  },
)

export default router
