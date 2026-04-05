import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import type { Db } from '@/db/client'
import {
  CollectionSchema, CreateCollectionSchema, UpdateCollectionSchema,
} from './schema'
import * as repo from './repository'

type Env = { Variables: { db: Db } }

const router = new OpenAPIHono<Env>()

// POST /collections
router.openapi(
  createRoute({
    method: 'post', path: '/collections',
    request: { body: { content: { 'application/json': { schema: CreateCollectionSchema } } } },
    responses: {
      201: { description: 'Created', content: { 'application/json': { schema: CollectionSchema } } },
    },
  }),
  async (c) => {
    const body = c.req.valid('json')
    const row = await repo.createCollection(c.var.db, body)
    return c.json(row, 201)
  }
)

// GET /collections
router.openapi(
  createRoute({
    method: 'get', path: '/collections',
    responses: {
      200: { description: 'List', content: { 'application/json': { schema: z.array(CollectionSchema) } } },
    },
  }),
  async (c) => {
    const rows = await repo.listCollections(c.var.db)
    return c.json(rows)
  }
)

// GET /collections/:id
router.openapi(
  createRoute({
    method: 'get', path: '/collections/{id}',
    request: { params: z.object({ id: z.coerce.number().int().positive() }) },
    responses: {
      200: { description: 'Found',     content: { 'application/json': { schema: CollectionSchema } } },
      404: { description: 'Not found', content: { 'application/json': { schema: z.object({ error: z.string() }) } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const row = await repo.getCollectionById(c.var.db, id)
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json(row)
  }
)

// PATCH /collections/:id
router.openapi(
  createRoute({
    method: 'patch', path: '/collections/{id}',
    request: {
      params: z.object({ id: z.coerce.number().int().positive() }),
      body: { content: { 'application/json': { schema: UpdateCollectionSchema } } },
    },
    responses: {
      200: { description: 'Updated',   content: { 'application/json': { schema: CollectionSchema } } },
      404: { description: 'Not found', content: { 'application/json': { schema: z.object({ error: z.string() }) } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const body   = c.req.valid('json')
    const row    = await repo.updateCollection(c.var.db, id, body)
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json(row)
  }
)

// DELETE /collections/:id
router.openapi(
  createRoute({
    method: 'delete', path: '/collections/{id}',
    request: { params: z.object({ id: z.coerce.number().int().positive() }) },
    responses: {
      200: { description: 'Deleted',   content: { 'application/json': { schema: CollectionSchema } } },
      404: { description: 'Not found', content: { 'application/json': { schema: z.object({ error: z.string() }) } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const row    = await repo.deleteCollection(c.var.db, id)
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json(row)
  }
)

export default router
