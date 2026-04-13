import { NotFoundException } from '@/lib/errors'
import { buildEmbeddingText, generateEmbedding, toDto } from '@/module/collection/helpers'
import {
  CollectionParamsSchema,
  CollectionQuerySchema,
  CollectionSchema,
  CreateCollectionSchema,
  UpdateCollectionSchema,
} from '@/module/collection/schema'
import { Env } from '@/types'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'

const router = new OpenAPIHono<Env>()

// ── POST /collections ─────────────────────────────────────────────────────────

router.openapi(
  createRoute({
    tags: ['Collection'],
    summary: 'Create a collection',
    description:
      'Create a new collection with optional description and metadata. Collections can be nested into hierarchies via the parent management endpoints.',
    method: 'post',
    path: '/collections',
    request: {
      body: { content: { 'application/json': { schema: CreateCollectionSchema } } },
    },
    responses: {
      201: {
        description: 'Collection created',
        content: { 'application/json': { schema: CollectionSchema } },
      },
    },
  }),
  async (c) => {
    const { title, description, metadata } = c.req.valid('json')
    const collectionRepository = c.get('collectionRepository')

    const embedding = await generateEmbedding(
      c.env.OPENAI_API_KEY,
      buildEmbeddingText(title, description),
    )

    const created = await collectionRepository.createCollection({
      title,
      description,
      metadata,
      embedding,
    })

    return c.json(toDto(created), 201)
  },
)

// ── GET /collections ──────────────────────────────────────────────────────────

router.openapi(
  createRoute({
    tags: ['Collection'],
    summary: 'List collections',
    description:
      'Retrieve all collections. Results are flat (no tree structure); use the parent management endpoints to traverse the hierarchy.',
    method: 'get',
    path: '/collections',
    request: {
      query: CollectionQuerySchema,
    },
    responses: {
      200: {
        description: 'List of collections',
        content: { 'application/json': { schema: CollectionSchema.array() } },
      },
    },
  }),
  async (c) => {
    const { collectionId } = c.req.valid('query')
    const collectionRepository = c.get('collectionRepository')

    let ancestorId: string | undefined
    if (collectionId !== undefined) {
      const col = await collectionRepository.findCollectionByCollectionId(collectionId)
      if (!col) throw new NotFoundException('Collection not found')
      ancestorId = col.id
    }

    const collections = await collectionRepository.listCollections(ancestorId)

    return c.json(collections.map(toDto), 200)
  },
)

// ── GET /collections/:collectionId ────────────────────────────────────────────

router.openapi(
  createRoute({
    tags: ['Collection'],
    summary: 'Get a collection',
    description:
      'Retrieve a single collection by its UUID. Returns 404 if the collection does not exist.',
    method: 'get',
    path: '/collections/{collectionId}',
    request: {
      params: CollectionParamsSchema,
    },
    responses: {
      200: {
        description: 'Collection found',
        content: { 'application/json': { schema: CollectionSchema } },
      },
    },
  }),
  async (c) => {
    const { collectionId } = c.req.valid('param')
    const collectionRepository = c.get('collectionRepository')

    const found = await collectionRepository.findCollectionByCollectionId(collectionId)
    if (!found) throw new NotFoundException('Collection not found')

    return c.json(toDto(found), 200)
  },
)

// ── PATCH /collections/:collectionId ─────────────────────────────────────────

router.openapi(
  createRoute({
    tags: ['Collection'],
    summary: 'Update a collection',
    description:
      "Partially update a collection's title, description, or metadata. Only provided fields are changed; omitted fields remain unchanged.",
    method: 'patch',
    path: '/collections/{collectionId}',
    request: {
      params: CollectionParamsSchema,
      body: { content: { 'application/json': { schema: UpdateCollectionSchema } } },
    },
    responses: {
      200: {
        description: 'Collection updated',
        content: { 'application/json': { schema: CollectionSchema } },
      },
    },
  }),
  async (c) => {
    const { collectionId } = c.req.valid('param')
    const body = c.req.valid('json')
    const collectionRepository = c.get('collectionRepository')

    // 若 title 或 description 有變動，重新生成 embedding
    let embedding: number[] | undefined
    if (body.title !== undefined || body.description !== undefined) {
      const existing = await collectionRepository.findCollectionByCollectionId(collectionId)
      if (!existing) throw new NotFoundException('Collection not found')

      const mergedTitle = body.title ?? existing.title
      const mergedDescription =
        body.description !== undefined ? body.description : existing.description
      embedding = await generateEmbedding(
        c.env.OPENAI_API_KEY,
        buildEmbeddingText(mergedTitle, mergedDescription),
      )
    }

    const updated = await collectionRepository.updateCollection(collectionId, {
      ...body,
      embedding,
    })
    if (!updated) throw new NotFoundException('Collection not found')

    return c.json(toDto(updated), 200)
  },
)

// ── DELETE /collections/:collectionId ─────────────────────────────────────────

router.openapi(
  createRoute({
    tags: ['Collection'],
    summary: 'Delete a collection',
    description:
      'Permanently delete a collection and all of its descendants (cascade). Document records themselves are not deleted; only the collection memberships are removed.',
    method: 'delete',
    path: '/collections/{collectionId}',
    request: {
      params: CollectionParamsSchema,
    },
    responses: {
      204: { description: 'Collection and all descendants deleted' },
    },
  }),
  async (c) => {
    const { collectionId } = c.req.valid('param')
    const collectionRepository = c.get('collectionRepository')

    const deleted = await collectionRepository.deleteCollection(collectionId)
    if (!deleted) throw new NotFoundException('Collection not found')

    return c.body(null, 204)
  },
)

export default router
