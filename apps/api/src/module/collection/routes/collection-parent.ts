import { BadRequestException, NotFoundException } from '@/lib/errors'
import { toDto } from '@/module/collection/helpers'
import { CollectionParamsSchema, CollectionSchema, MoveToParentSchema } from '@/module/collection/schema'
import { Env } from '@/types'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'

const router = new OpenAPIHono<Env>()

// ── PUT /collections/:collectionId/parent ─────────────────────────────────────

router.openapi(
  createRoute({
    tags: ['Collection'],
    summary: 'Move collection to a new parent',
    description:
      'Reparent a collection under a new parent collection using the closure table pattern. Cycle detection is enforced — a collection cannot be moved into itself or any of its descendants.',
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
    description:
      'Remove the parent relationship of a collection, promoting it to a root-level node. Descendant relationships within the subtree are preserved.',
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

export default router
