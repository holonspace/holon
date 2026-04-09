import { BadRequestException, ConflictException, NotFoundException } from '@/lib/errors'
import type { CollectionDto, DocumentSummaryDto } from '@/module/collection/schema'
import {
  AddDocumentToCollectionSchema,
  CollectionParamsSchema,
  CollectionQuerySchema,
  CollectionSchema,
  CreateCollectionSchema,
  DocumentCollectionParamsSchema,
  DocumentSummarySchema,
  ListDocumentsQuerySchema,
  MoveToParentSchema,
  UpdateCollectionSchema,
} from '@/module/collection/schema'
import { Env } from '@/types'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'

const router = new OpenAPIHono<Env>()

// ── 共用工具 ───────────────────────────────────────────────────────────────────

function toDocumentDto(d: { documentId: string; title: string; description: string | null; metadata: unknown; content: unknown; createdAt: Date; updatedAt: Date }): DocumentSummaryDto {
  return {
    id: d.documentId,
    title: d.title,
    description: d.description ?? null,
    metadata: (d.metadata as Record<string, unknown>) ?? null,
    content: (d.content as Record<string, unknown>) ?? null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }
}

function toDto(c: { collectionId: string; title: string; description: string | null; metadata: unknown; createdAt: Date; updatedAt: Date }): CollectionDto {
  return {
    id: c.collectionId,
    title: c.title,
    description: c.description ?? null,
    metadata: (c.metadata as Record<string, unknown>) ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
}

// ── POST /collections ─────────────────────────────────────────────────────────

router.openapi(
  createRoute({
    tags: ['Collection'],
    summary: 'Create a collection',
    description: 'Create a new collection with optional description and metadata. Collections can be nested into hierarchies via the parent management endpoints.',
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

    const created = await collectionRepository.createCollection(
      { title, description, metadata: metadata as Record<string, unknown> | null },
    )

    return c.json(toDto(created), 201)
  },
)

// ── GET /collections ──────────────────────────────────────────────────────────

router.openapi(
  createRoute({
    tags: ['Collection'],
    summary: 'List collections',
    description: 'Retrieve all collections. Results are flat (no tree structure); use the parent management endpoints to traverse the hierarchy.',
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

    let ancestorInternalId: number | undefined
    if (collectionId !== undefined) {
      const col = await collectionRepository.findCollectionByCollectionId(collectionId)
      if (!col) throw new NotFoundException('Collection not found')
      ancestorInternalId = col.id
    }

    const collections = await collectionRepository.listCollections(ancestorInternalId)

    return c.json(collections.map(toDto), 200)
  },
)

// ── GET /collections/:collectionId ────────────────────────────────────────────

router.openapi(
  createRoute({
    tags: ['Collection'],
    summary: 'Get a collection',
    description: 'Retrieve a single collection by its UUID. Returns 404 if the collection does not exist.',
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
    description: 'Partially update a collection\'s title, description, or metadata. Only provided fields are changed; omitted fields remain unchanged.',
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

    const updated = await collectionRepository.updateCollection(collectionId, body)
    if (!updated) throw new NotFoundException('Collection not found')

    return c.json(toDto(updated), 200)
  },
)

// ── DELETE /collections/:collectionId ─────────────────────────────────────────

router.openapi(
  createRoute({
    tags: ['Collection'],
    summary: 'Delete a collection',
    description: 'Permanently delete a collection and all of its descendants (cascade). Document records themselves are not deleted; only the collection memberships are removed.',
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

// ── PUT /collections/:collectionId/parent ─────────────────────────────────────

router.openapi(
  createRoute({
    tags: ['Collection'],
    summary: 'Move collection to a new parent',
    description: 'Reparent a collection under a new parent collection using the closure table pattern. Cycle detection is enforced — a collection cannot be moved into itself or any of its descendants.',
    method: 'put',
    path: '/collections/{collectionId}/parent',
    request: {
      params: CollectionParamsSchema,
      body: { content: { 'application/json': { schema: MoveToParentSchema } } },
    },
    responses: {
      200: {
        description: 'Collection moved to new parent',
        content: { 'application/json': { schema: CollectionSchema } },
      },
    },
  }),
  async (c) => {
    const { collectionId } = c.req.valid('param')
    const { parentId } = c.req.valid('json')
    const repo = c.get('collectionRepository')

    // 不能移入自身
    if (collectionId === parentId) {
      throw new BadRequestException('Cannot move a collection into itself')
    }

    // source 必須存在
    const node = await repo.findCollectionByCollectionId(collectionId)
    if (!node) throw new NotFoundException('Collection not found')

    // target parent 必須存在
    const parent = await repo.findCollectionByCollectionId(parentId)
    if (!parent) throw new NotFoundException('Parent collection not found')

    // 循環檢測：parent 不能是 node 的後代（含自身）
    const wouldCycle = await repo.isDescendant(parent.id, node.id)
    if (wouldCycle) {
      throw new BadRequestException('Cannot move a collection into its own descendant')
    }

    await repo.moveToParent(node.id, parent.id)

    return c.json(toDto(node), 200)
  },
)

// ── DELETE /collections/:collectionId/parent ──────────────────────────────────

router.openapi(
  createRoute({
    tags: ['Collection'],
    summary: 'Detach collection from parent',
    description: 'Remove the parent relationship of a collection, promoting it to a root-level node. Descendant relationships within the subtree are preserved.',
    method: 'delete',
    path: '/collections/{collectionId}/parent',
    request: {
      params: CollectionParamsSchema,
    },
    responses: {
      204: { description: 'Collection detached from parent (now a root node)' },
    },
  }),
  async (c) => {
    const { collectionId } = c.req.valid('param')
    const repo = c.get('collectionRepository')

    const node = await repo.findCollectionByCollectionId(collectionId)
    if (!node) throw new NotFoundException('Collection not found')

    await repo.removeFromParent(node.id)

    return c.body(null, 204)
  },
)

// ── POST /collections/:collectionId/documents ─────────────────────────────────

router.openapi(
  createRoute({
    tags: ['Collection'],
    summary: 'Add document to collection',
    description: 'Associate an existing document with a collection. A document can belong to multiple collections. Returns 409 if the document is already a member of this collection.',
    method: 'post',
    path: '/collections/{collectionId}/documents',
    request: {
      params: CollectionParamsSchema,
      body: { content: { 'application/json': { schema: AddDocumentToCollectionSchema } } },
    },
    responses: {
      204: { description: 'Document added to collection' },
    },
  }),
  async (c) => {
    const { collectionId } = c.req.valid('param')
    const { documentId } = c.req.valid('json')
    const collectionRepo = c.get('collectionRepository')
    const documentRepo = c.get('documentRepository')

    const col = await collectionRepo.findCollectionByCollectionId(collectionId)
    if (!col) throw new NotFoundException('Collection not found')

    const doc = await documentRepo.findDocumentByDocumentId(documentId)
    if (!doc) throw new NotFoundException('Document not found')

    const alreadyIn = await collectionRepo.isDocumentInCollection(col.id, doc.id)
    if (alreadyIn) throw new ConflictException('Document already in collection')

    await collectionRepo.addDocumentToCollection(col.id, doc.id)

    return c.body(null, 204)
  },
)

// ── DELETE /collections/:collectionId/documents/:documentId ───────────────────

router.openapi(
  createRoute({
    tags: ['Collection'],
    summary: 'Remove document from collection',
    description: 'Disassociate a document from a collection. The document itself is not deleted. Returns 404 if the document is not a member of this collection.',
    method: 'delete',
    path: '/collections/{collectionId}/documents/{documentId}',
    request: {
      params: DocumentCollectionParamsSchema,
    },
    responses: {
      204: { description: 'Document removed from collection' },
    },
  }),
  async (c) => {
    const { collectionId, documentId } = c.req.valid('param')
    const collectionRepo = c.get('collectionRepository')
    const documentRepo = c.get('documentRepository')

    const col = await collectionRepo.findCollectionByCollectionId(collectionId)
    if (!col) throw new NotFoundException('Collection not found')

    const doc = await documentRepo.findDocumentByDocumentId(documentId)
    if (!doc) throw new NotFoundException('Document not found')

    const removed = await collectionRepo.removeDocumentFromCollection(col.id, doc.id)
    if (!removed) throw new NotFoundException('Document is not in this collection')

    return c.body(null, 204)
  },
)

// ── GET /collections/:collectionId/documents ──────────────────────────────────

router.openapi(
  createRoute({
    tags: ['Collection'],
    summary: 'List documents in a collection',
    description: 'Retrieve all documents that are members of the specified collection. Returns document summaries (without content blocks).',
    method: 'get',
    path: '/collections/{collectionId}/documents',
    request: {
      params: CollectionParamsSchema,
      query: ListDocumentsQuerySchema,
    },
    responses: {
      200: {
        description: 'Documents in collection',
        content: { 'application/json': { schema: DocumentSummarySchema.array() } },
      },
    },
  }),
  async (c) => {
    const { collectionId } = c.req.valid('param')
    const { recursive } = c.req.valid('query')
    const collectionRepo = c.get('collectionRepository')

    const col = await collectionRepo.findCollectionByCollectionId(collectionId)
    if (!col) throw new NotFoundException('Collection not found')

    const docs = await collectionRepo.listDocumentsInCollection(col.id, { recursive })

    return c.json(docs.map(toDocumentDto), 200)
  },
)

export default router
