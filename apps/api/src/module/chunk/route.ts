import { NotFoundException } from '@/lib/errors'
import type { ChunkDto } from '@/module/chunk/schema'
import { ChunkParamsSchema, ChunkSchema, CreateChunkSchema } from '@/module/chunk/schema'
import { Env } from '@/types'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { OpenAIEmbeddings } from '@langchain/openai'


const router = new OpenAPIHono<Env>()

// POST /documents/:documentId/chunks  — create chunk with embedding
router.openapi(
  createRoute({
    tags: ['Chunk'],
    summary: 'Add a chunk to a document',
    description: 'Create a text chunk for the specified document. Automatically generates a 1536-dimensional embedding using OpenAI text-embedding-3-small and stores it alongside the chunk for hybrid (vector + full-text) search.',
    method: 'post',
    path: '/documents/:documentId/chunks',
    request: {
      params: ChunkParamsSchema,
      body: { content: { 'application/json': { schema: CreateChunkSchema } } },
    },
    responses: {
      201: {
        description: 'Chunk created with embedding',
        content: { 'application/json': { schema: ChunkSchema } },
      },
    },
  }),
  async (c) => {
    const { content, metadata } = c.req.valid('json')
    const { documentId } = c.req.valid('param')

    const chunkRepository = c.get('chunkRepository')

    // 1. 取得 document int id + 計算下一個 position（同時驗證 document 存在）
    const ctx = await chunkRepository.getDocumentContext(documentId)
    if (!ctx) throw new NotFoundException('Document not found')

    // 2. 生成 embedding（1536 維，符合 DB schema vector(1536)）
    const embeddings = new OpenAIEmbeddings({
      apiKey: c.env.OPENAI_API_KEY,
      model: 'text-embedding-3-small',
    })
    const embeddingVector = await embeddings.embedQuery(content)

    // 3. 建立 chunk
    const newChunk = await chunkRepository.createChunk({
      documentId: ctx.documentIntId,
      position: ctx.nextPosition,
      content,
      embedding: embeddingVector,
      metadata: metadata,
    })

    // 4. 組裝 DTO（對外暴露 UUID，不暴露內部 serial id）
    const chunkDto: ChunkDto = {
      id: newChunk.chunkId,
      documentId,
      position: newChunk.position,
      content: newChunk.content,
      metadata: newChunk.metadata,
      createdAt: newChunk.createdAt.toISOString(),
      updatedAt: newChunk.updatedAt.toISOString(),
    }

    return c.json(chunkDto, 201)
  }
)


export default router
