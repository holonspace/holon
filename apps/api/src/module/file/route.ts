import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from '@/lib/errors'
import {
  CHUNK_SIZE,
  CompleteUploadSchema,
  CompleteUploadResponseSchema,
  GetFileResponseSchema,
  StartUploadResponseSchema,
  StartUploadSchema,
  UploadPartResponseSchema,
} from '@/module/file/schema'
import { Env } from '@/types'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { z } from 'zod'

const router = new OpenAPIHono<Env>()

// ─── Helper: read userId from header ─────────────────────────────────────────

function getUserId(c: { req: { header: (name: string) => string | undefined } }): string {
  const id = c.req.header('X-User-Id')
  if (!id) throw new UnauthorizedException('Missing X-User-Id header')
  return id
}

// ─── POST /files/upload/start ─────────────────────────────────────────────────

router.openapi(
  createRoute({
    tags: ['File'],
    summary: 'Start or resume a multipart upload',
    method: 'post',
    path: '/files/upload/start',
    request: {
      body: { content: { 'application/json': { schema: StartUploadSchema } } },
    },
    responses: {
      200: {
        description: 'Upload session ready',
        content: { 'application/json': { schema: StartUploadResponseSchema } },
      },
    },
  }),
  async (c) => {
    const userId = getUserId(c)
    const { hash, filename, contentType, size, visibility } = c.req.valid('json')
    const repo = c.get('fileRepository')

    const state = await repo.startUpload(userId, hash, filename, contentType, size, visibility)
    const totalParts = Math.ceil(size / CHUNK_SIZE)

    return c.json({
      uploadId: state.uploadId,
      chunkSize: CHUNK_SIZE,
      totalParts,
      completedParts: state.completedParts,
      // Find the first part number not yet in completedParts (handles non-sequential gaps)
      startFrom: (() => {
        const done = new Set(state.completedParts.map(p => p.partNumber))
        return (Array.from({ length: totalParts }, (_, i) => i + 1).find(n => !done.has(n)) ?? totalParts + 1)
      })(),
    }, 200)
  },
)

// ─── PUT /files/upload/:hash/parts/:partNumber ────────────────────────────────

router.openapi(
  createRoute({
    tags: ['File'],
    summary: 'Upload a single part',
    method: 'put',
    path: '/files/upload/{hash}/parts/{partNumber}',
    request: {
      params: z.object({
        hash: z.string().min(64).max(64),
        partNumber: z.coerce.number().int().min(1),
      }),
    },
    responses: {
      200: {
        description: 'Part uploaded',
        content: { 'application/json': { schema: UploadPartResponseSchema } },
      },
    },
  }),
  async (c) => {
    const userId = getUserId(c)
    const { hash, partNumber } = c.req.valid('param')
    const repo = c.get('fileRepository')

    const body = await c.req.arrayBuffer()
    if (body.byteLength === 0) throw new BadRequestException('Empty body')

    const result = await repo.uploadPart(userId, hash, partNumber, body)
    return c.json(result, 200)
  },
)

// ─── POST /files/upload/:hash/complete ───────────────────────────────────────

router.openapi(
  createRoute({
    tags: ['File'],
    summary: 'Complete a multipart upload',
    method: 'post',
    path: '/files/upload/{hash}/complete',
    request: {
      params: z.object({ hash: z.string().min(64).max(64) }),
      body: { content: { 'application/json': { schema: CompleteUploadSchema } } },
    },
    responses: {
      200: {
        description: 'Upload complete',
        content: { 'application/json': { schema: CompleteUploadResponseSchema } },
      },
    },
  }),
  async (c) => {
    const userId = getUserId(c)
    const { hash: hashParam } = c.req.valid('param')
    const { hash, parts } = c.req.valid('json')

    if (hashParam !== hash) throw new BadRequestException('Hash mismatch')

    const repo = c.get('fileRepository')

    const result = await repo.completeUpload(userId, hash, parts)
    return c.json(result, 200)
  },
)

// ─── DELETE /files/upload/:hash ───────────────────────────────────────────────

router.openapi(
  createRoute({
    tags: ['File'],
    summary: 'Abort a multipart upload',
    method: 'delete',
    path: '/files/upload/{hash}',
    request: {
      params: z.object({ hash: z.string().min(64).max(64) }),
    },
    responses: {
      204: { description: 'Upload aborted' },
    },
  }),
  async (c) => {
    const userId = getUserId(c)
    const { hash } = c.req.valid('param')
    const repo = c.get('fileRepository')

    await repo.abortUpload(userId, hash)
    return c.body(null, 204)
  },
)

// ─── GET /files/:fileId ───────────────────────────────────────────────────────

router.openapi(
  createRoute({
    tags: ['File'],
    summary: 'Get file access URL',
    method: 'get',
    path: '/files/{fileId}',
    request: {
      params: z.object({ fileId: z.string().min(64).max(64) }),
    },
    responses: {
      200: {
        description: 'File access info for private files',
        content: { 'application/json': { schema: GetFileResponseSchema } },
      },
      302: { description: 'Redirect to public file URL' },
      403: { description: 'Forbidden' },
      404: { description: 'Not found' },
    },
  }),
  async (c) => {
    const userId = getUserId(c)
    const { fileId } = c.req.valid('param')
    const repo = c.get('fileRepository')

    const found = await repo.getFile(userId, fileId)
    if (!found) throw new NotFoundException('File not found')

    const { object, key } = found
    const visibility = object.customMetadata?.['x-meta-visibility'] ?? 'private'
    const ownerId = object.customMetadata?.['x-meta-user-id'] ?? ''

    if (visibility === 'public') {
      const publicBaseUrl = c.env.PUBLIC_R2_BASE_URL
      const url = publicBaseUrl ? `${publicBaseUrl}/${key}` : ''
      if (!url) {
        // Public bucket URL not configured — fall back to signed download
        const token = await repo.createDownloadToken(fileId, userId)
        const downloadUrl = new URL(c.req.url)
        downloadUrl.pathname = `/files/${fileId}/download`
        downloadUrl.searchParams.set('token', token)
        return c.json({ url: downloadUrl.toString(), visibility: 'public' as const }, 200)
      }
      return c.redirect(url, 302)
    }

    // Private: verify ownership
    if (ownerId !== userId) throw new ForbiddenException()

    const token = await repo.createDownloadToken(fileId, userId)
    const downloadUrl = new URL(c.req.url)
    downloadUrl.pathname = `/files/${fileId}/download`
    downloadUrl.searchParams.set('token', token)

    return c.json({
      url: downloadUrl.toString(),
      expiresIn: 3600,
      visibility: 'private' as const,
    }, 200)
  },
)

// ─── GET /files/:fileId/download ──────────────────────────────────────────────

router.openapi(
  createRoute({
    tags: ['File'],
    summary: 'Download file via signed token',
    method: 'get',
    path: '/files/{fileId}/download',
    request: {
      params: z.object({ fileId: z.string().min(64).max(64) }),
      query: z.object({ token: z.string() }),
    },
    responses: {
      200: { description: 'File content' },
      403: { description: 'Invalid or expired token' },
      404: { description: 'Not found' },
    },
  }),
  async (c) => {
    const { fileId } = c.req.valid('param')
    const { token } = c.req.valid('query')
    const repo = c.get('fileRepository')

    const payload = await repo.verifyDownloadToken(token)
    if (!payload || payload.fileId !== fileId) throw new ForbiddenException('Invalid or expired token')

    const found = await repo.getFile(payload.userId, fileId)
    if (!found) throw new NotFoundException('File not found')

    const body = await repo.streamFile(found.key)
    if (!body) throw new NotFoundException('File not found')

    const contentType = found.object.httpMetadata?.contentType ?? 'application/octet-stream'
    const filename = found.object.customMetadata?.['x-meta-filename'] ?? 'download'

    return new Response(body.body, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  },
)

// ─── DELETE /files/:fileId ────────────────────────────────────────────────────

router.openapi(
  createRoute({
    tags: ['File'],
    summary: 'Delete a file',
    method: 'delete',
    path: '/files/{fileId}',
    request: {
      params: z.object({ fileId: z.string().min(64).max(64) }),
    },
    responses: {
      204: { description: 'Deleted' },
      403: { description: 'Forbidden' },
      404: { description: 'Not found' },
    },
  }),
  async (c) => {
    const userId = getUserId(c)
    const { fileId } = c.req.valid('param')
    const repo = c.get('fileRepository')

    const found = await repo.getFile(userId, fileId)
    if (!found) throw new NotFoundException('File not found')

    const ownerId = found.object.customMetadata?.['x-meta-user-id'] ?? ''
    if (ownerId !== userId) throw new ForbiddenException()

    await repo.deleteFile(userId, fileId)
    return c.body(null, 204)
  },
)

export default router
