import { Env } from '@/types'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { OpenAIEmbeddings } from '@langchain/openai'
import { SearchBodySchema, SearchResponseSchema } from './schema'

const router = new OpenAPIHono<Env>()

// POST /search — 向量 + 全文 RRF 混合搜尋
router.openapi(
  createRoute({
    tags: ['Search'],
    summary: 'Hybrid search',
    description: 'Perform a hybrid search combining vector similarity (cosine via HNSW index) and full-text trigram search (pg_trgm) using Reciprocal Rank Fusion (RRF). Optionally scope results to a specific collection or document. Returns ranked chunks with relevance scores.',
    method: 'post',
    path: '/search',
    request: {
      body: { content: { 'application/json': { schema: SearchBodySchema } } },
    },
    responses: {
      200: {
        description: 'Ranked list of matching chunks with RRF scores',
        content: { 'application/json': { schema: SearchResponseSchema } },
      },
    },
  }),
  async (c) => {
    const { query, limit, k, minScore, collectionId, documentId } = c.req.valid('json')

    // 1. 生成 query embedding（與 chunk 建立時使用相同模型）
    const embeddings = new OpenAIEmbeddings({
      apiKey: c.env.OPENAI_API_KEY,
      model: 'text-embedding-3-small',
    })
    const embeddingVector = await embeddings.embedQuery(query)

    // 2. RRF 混合搜尋
    const searchRepository = c.get('searchRepository')
    const results = await searchRepository.hybridSearch({
      embeddingVector,
      query,
      limit: limit ?? 10,
      k: k ?? 60,
      collectionId,
      documentId,
    })

    return c.json(results, 200)
  }
)

export default router
