import { ConflictException, NotFoundException } from '@/lib/errors'
import { toDocumentDto } from '@/module/collection/helpers'
import {
  AddDocumentToCollectionSchema,
  CollectionParamsSchema,
  DocumentCollectionParamsSchema,
  DocumentSummarySchema,
  ListDocumentsQuerySchema,
} from '@/module/collection/schema'
import { Env } from '@/types'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'

const router = new OpenAPIHono<Env>()

// ── POST /collections/:collectionId/documents ─────────────────────────────────

router.openapi(
  createRoute({
    tags: ['Collection'],
    summary: 'Add document to collection',
    description:
      'Associate an existing document with a collection. A document can belong to multiple collections. Returns 409 if the document is already a member of this collection.',
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
    description:
      'Disassociate a document from a collection. The document itself is not deleted. Returns 404 if the document is not a member of this collection.',
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
    description:
      'Retrieve all documents that are members of the specified collection. Returns document summaries (without content blocks).',
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
