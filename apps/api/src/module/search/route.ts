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
    description: 'Perform a hybrid search combining vector similarity and BM25 full-text search using Weighted RRF (Reciprocal Rank Fusion). Scores range ~0.016–0.033 (k=60). Control vector emphasis via vectorWeight (default 1.0, > 1.0 boosts vector ranking). Adjust RRF constant k (default 60). Optionally filter by minScore, collectionId, or documentId. Use contextWindow (0–10) to automatically include adjacent chunks before and after each hit for richer RAG context.',
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
    const { query, limit, k, vectorWeight, minScore, collectionId, documentId, contextWindow } = c.req.valid('json')

    // 1. 生成 query embedding（與 chunk 建立時使用相同模型）
    const embeddings = new OpenAIEmbeddings({
      apiKey: c.env.OPENAI_API_KEY,
      model: 'text-embedding-3-small',
    })
    const embeddingVector = await embeddings.embedQuery(query)

    // 2. Weighted RRF 混合搜尋（分數範圍 ~0.016~0.033，k=60）
    const searchRepository = c.get('searchRepository')
    const results = await searchRepository.hybridSearch({
      embeddingVector,
      query,
      limit: limit ?? 10,
      k: k ?? 60,
      vectorWeight: vectorWeight ?? 1.0,
      minScore: minScore ?? 0,
      collectionId,
      documentId,
    })

    // 3. Context window 擴展（若 contextWindow > 0）
    const effectiveWindow = contextWindow ?? 0
    if (effectiveWindow > 0 && results.length > 0) {
      const chunkRepository = c.get('chunkRepository')
      const adjacentMap = await chunkRepository.getAdjacentChunks(
        results.map((r) => r.chunkId),
        effectiveWindow
      )
      const enrichedResults = results.map((r) => ({
        ...r,
        contextChunks: adjacentMap.get(r.chunkId) ?? { prev: [], next: [] },
      }))
      return c.json(enrichedResults, 200)
    }

    return c.json(results, 200)
  }
)

export default router
