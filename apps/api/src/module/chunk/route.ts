import { NotFoundException } from '@/lib/errors'
import { ChunkItemParamsSchema, ChunkParamsSchema, ChunkSchema, CreateChunkSchema } from '@/module/chunk/schema'
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

    const documentRepository = c.get('documentRepository')
    const chunkRepository = c.get('chunkRepository')

    // 1. 驗證 document 存在
    const exists = await documentRepository.isDocumentExist(documentId)
    if (!exists) throw new NotFoundException('Document not found')

    // 2. 生成 embedding（1536 維，符合 DB schema vector(1536)）
    const embeddings = new OpenAIEmbeddings({
      apiKey: c.env.OPENAI_API_KEY,
      model: 'text-embedding-3-small',
    })
    const embeddingVector = await embeddings.embedQuery(content)

    // 3. 建立 chunk
    const newChunk = await chunkRepository.createChunk({
      documentId,
      content,
      embedding: embeddingVector,
      metadata: metadata ?? {},
    })

    return c.json(
      {
        id: newChunk.id,
        documentId,
        prevChunkId: newChunk.prevChunkId,
        nextChunkId: newChunk.nextChunkId,
        content: newChunk.content,
        metadata: newChunk.metadata,
        createdAt: newChunk.createdAt.toISOString(),
        updatedAt: newChunk.updatedAt.toISOString(),
      },
      201
    )
  }
)

// DELETE /documents/:documentId/chunks/:chunkId
router.openapi(
  createRoute({
    tags: ['Chunk'],
    summary: 'Delete a chunk',
    description: 'Soft deletes a chunk and maintains linked list integrity by rewiring adjacent chunk pointers.',
    method: 'delete',
    path: '/documents/:documentId/chunks/:chunkId',
    request: {
      params: ChunkItemParamsSchema,
    },
    responses: {
      204: { description: 'Chunk deleted' },
      404: { description: 'Chunk not found' },
    },
  }),
  async (c) => {
    const { documentId, chunkId } = c.req.valid('param')
    const deleted = await c.get('chunkRepository').deleteChunk(chunkId, documentId)
    if (!deleted) throw new NotFoundException('Chunk not found')
    return c.body(null, 204)
  }
)

export default router
