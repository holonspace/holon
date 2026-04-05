import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import type { Db } from '@/db/client'
import {
  DocumentSchema, CreateDocumentSchema, UpdateDocumentSchema, AddToCollectionSchema,
} from './schema'
import * as repo from './repository'

type Env = { Variables: { db: Db } }

const router = new OpenAPIHono<Env>()

const IdParam = z.object({ id: z.coerce.number().int().positive() })
const NotFound = { description: 'Not found', content: { 'application/json': { schema: z.object({ error: z.string() }) } } }

// POST /documents
router.openapi(
  createRoute({
    method: 'post', path: '/documents',
    request: { body: { content: { 'application/json': { schema: CreateDocumentSchema } } } },
    responses: { 201: { description: 'Created', content: { 'application/json': { schema: DocumentSchema } } } },
  }),
  async (c) => {
    const body = c.req.valid('json')
    const row  = await repo.createDocument(c.var.db, body)
    return c.json(row, 201)
  }
)

// GET /documents/:id
router.openapi(
  createRoute({
    method: 'get', path: '/documents/{id}',
    request: { params: IdParam },
    responses: {
      200: { description: 'Found', content: { 'application/json': { schema: DocumentSchema } } },
      404: NotFound,
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const row    = await repo.getDocumentById(c.var.db, id)
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json(row)
  }
)

// PATCH /documents/:id
router.openapi(
  createRoute({
    method: 'patch', path: '/documents/{id}',
    request: {
      params: IdParam,
      body: { content: { 'application/json': { schema: UpdateDocumentSchema } } },
    },
    responses: {
      200: { description: 'Updated', content: { 'application/json': { schema: DocumentSchema } } },
      404: NotFound,
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const body   = c.req.valid('json')
    const row    = await repo.updateDocument(c.var.db, id, body)
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json(row)
  }
)

// DELETE /documents/:id
router.openapi(
  createRoute({
    method: 'delete', path: '/documents/{id}',
    request: { params: IdParam },
    responses: {
      200: { description: 'Deleted', content: { 'application/json': { schema: DocumentSchema } } },
      404: NotFound,
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const row    = await repo.deleteDocument(c.var.db, id)
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json(row)
  }
)

// POST /documents/:id/collections  — add to collection
router.openapi(
  createRoute({
    method: 'post', path: '/documents/{id}/collections',
    request: {
      params: IdParam,
      body: { content: { 'application/json': { schema: AddToCollectionSchema } } },
    },
    responses: {
      200: { description: 'Added', content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } } },
      404: NotFound,
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const body   = c.req.valid('json')
    const doc    = await repo.getDocumentById(c.var.db, id)
    if (!doc) return c.json({ error: 'Not found' }, 404)
    await repo.addDocumentToCollection(c.var.db, id, body)
    return c.json({ ok: true })
  }
)

// DELETE /documents/:id/collections/:collectionId
router.openapi(
  createRoute({
    method: 'delete', path: '/documents/{id}/collections/{collectionId}',
    request: {
      params: z.object({
        id:           z.coerce.number().int().positive(),
        collectionId: z.coerce.number().int().positive(),
      }),
    },
    responses: {
      200: { description: 'Removed', content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } } },
      404: NotFound,
    },
  }),
  async (c) => {
    const { id, collectionId } = c.req.valid('param')
    const row = await repo.removeDocumentFromCollection(c.var.db, id, collectionId)
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json({ ok: true })
  }
)

// GET /documents/:id/chunks
router.openapi(
  createRoute({
    method: 'get', path: '/documents/{id}/chunks',
    request: { params: IdParam },
    responses: {
      200: { description: 'Chunks', content: { 'application/json': { schema: z.array(DocumentSchema) } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const rows   = await repo.getDocumentChunks(c.var.db, id)
    return c.json(rows)
  }
)

export default router
