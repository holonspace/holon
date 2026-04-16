# File Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Cloudflare R2 file storage with resumable multipart upload, public/private access control, and a React upload hook with progress tracking.

**Architecture:** The backend exposes a file module (`apps/api/src/module/file/`) following the existing route/repository/schema pattern, backed by R2 binding. Resumable state (uploadId + completed parts) is persisted as a JSON object in R2 at `{userId}/{hash}/.upload-state` so resume works across devices. Private file access uses HMAC-signed download tokens (no external storage needed). The frontend provides `computeFileHash` (sampled SHA-256, ~6MB read regardless of file size), `useFileUpload` hook with `progress: number` variable, and a `FileUploader` component.

**Tech Stack:** Cloudflare Workers R2 binding, Hono + `@hono/zod-openapi`, Zod v4, React 19, TanStack Router, Web Crypto API (`crypto.subtle`)

---

## File Map

### Backend (`apps/api`)

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `wrangler.jsonc` | Add R2 bucket binding + signing secret var |
| Modify | `src/types.ts` | Add `FILE_BUCKET`, `FILE_SIGNING_SECRET`, `PUBLIC_R2_BASE_URL` to Bindings; add `fileRepository` to Variables |
| Create | `src/module/file/schema.ts` | All Zod request/response schemas for file routes |
| Create | `src/module/file/repository.ts` | R2 operations: start, uploadPart, complete, abort, getFile, deleteFile, signToken, verifyToken |
| Create | `src/module/file/route.ts` | 7 OpenAPIHono routes |
| Modify | `src/module/index.ts` | Export `fileRoute` |
| Modify | `src/index.ts` | Inject `fileRepository`, mount `fileRoute` |

### Frontend (`apps/web`)

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/file-hash.ts` | Sampled SHA-256 hash computation |
| Create | `src/lib/file-api.ts` | API client wrapping all `/files/*` calls |
| Create | `src/hooks/use-file-upload.ts` | Upload state machine with `progress` variable |
| Create | `src/components/file/file-uploader.tsx` | File picker + status display component |

---

## Task 1: Configure R2 Binding and Types

**Files:**
- Modify: `apps/api/wrangler.jsonc`
- Modify: `apps/api/src/types.ts`

- [ ] **Step 1: Add R2 bucket and vars to wrangler.jsonc**

Replace entire contents of `apps/api/wrangler.jsonc` with:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "api",
  "main": "src/index.ts",
  "compatibility_date": "2026-04-05",
  "compatibility_flags": ["nodejs_compat"],
  "r2_buckets": [
    {
      "binding": "FILE_BUCKET",
      "bucket_name": "holon-files"
    }
  ],
  "vars": {
    "PUBLIC_R2_BASE_URL": "",
    "FILE_SIGNING_SECRET": ""
  }
}
```

- [ ] **Step 2: Update `src/types.ts` with new bindings and variables**

Replace entire `apps/api/src/types.ts`:

```ts
import { createDB } from "@/db"
import { ChunkRepository } from "@/module/chunk/repository"
import { CollectionRepository } from "@/module/collection/repository"
import { DocumentRepository } from "@/module/document/repository"
import { FileRepository } from "@/module/file/repository"
import { SearchRepository } from "@/module/search/repository"

type Bindings = {
  DATABASE_URL: string
  OPENAI_API_KEY: string
  FILE_BUCKET: R2Bucket
  PUBLIC_R2_BASE_URL: string   // e.g. "https://pub-xxx.r2.dev" for public bucket
  FILE_SIGNING_SECRET: string  // random string, e.g. openssl rand -hex 32
}

type Variables = {
  db: ReturnType<typeof createDB>
  documentRepository: DocumentRepository
  chunkRepository: ChunkRepository
  searchRepository: SearchRepository
  collectionRepository: CollectionRepository
  fileRepository: FileRepository
}

type Env = {
  Bindings: Bindings
  Variables: Variables
}

export { Bindings, Env, Variables }
```

- [ ] **Step 3: Add secrets to `.dev.vars`**

Append to `apps/api/.dev.vars` (create if missing):

```
FILE_SIGNING_SECRET=dev-signing-secret-change-in-prod
PUBLIC_R2_BASE_URL=
```

Leave `PUBLIC_R2_BASE_URL` empty for local dev (public URL is only needed after R2 bucket is made public in the Cloudflare dashboard).

- [ ] **Step 4: Type-check**

```bash
cd apps/api && pnpm check-types
```

Expected: no errors (FileRepository import will error until Task 3 — that's fine, fix after Task 3).

- [ ] **Step 5: Commit**

```bash
git add apps/api/wrangler.jsonc apps/api/src/types.ts apps/api/.dev.vars
git commit -m "feat(api): add R2 binding and file signing config"
```

---

## Task 2: Backend Zod Schemas

**Files:**
- Create: `apps/api/src/module/file/schema.ts`

- [ ] **Step 1: Create `apps/api/src/module/file/schema.ts`**

```ts
import { z } from 'zod'

export const ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const

export const CHUNK_SIZE = 10_485_760 // 10MB
export const MAX_FILE_SIZE = 104_857_600 // 100MB

// ─── Upload Start ─────────────────────────────────────────────────────────────

export const StartUploadSchema = z.object({
  hash: z.string().min(64).max(64),           // SHA-256 hex
  filename: z.string().min(1).max(255),
  contentType: z.enum(ALLOWED_CONTENT_TYPES),
  size: z.number().int().min(1).max(MAX_FILE_SIZE),
  visibility: z.enum(['public', 'private']),
})

export const UploadedPartSchema = z.object({
  partNumber: z.number().int().min(1),
  etag: z.string(),
})

export const StartUploadResponseSchema = z.object({
  uploadId: z.string(),
  chunkSize: z.number(),
  totalParts: z.number(),
  completedParts: z.array(UploadedPartSchema),
  startFrom: z.number().int().min(1),
})

// ─── Upload Part ──────────────────────────────────────────────────────────────

export const UploadPartResponseSchema = z.object({
  partNumber: z.number().int().min(1),
  etag: z.string(),
})

// ─── Complete Upload ──────────────────────────────────────────────────────────

export const CompleteUploadSchema = z.object({
  hash: z.string().min(64).max(64),
  parts: z.array(UploadedPartSchema).min(1),
})

export const CompleteUploadResponseSchema = z.object({
  fileId: z.string(),
  url: z.string(),
  visibility: z.enum(['public', 'private']),
  filename: z.string(),
  contentType: z.string(),
  size: z.number(),
})

// ─── File Access ──────────────────────────────────────────────────────────────

export const GetFileResponseSchema = z.object({
  url: z.string(),
  expiresIn: z.number().optional(),  // seconds, only for private files
  visibility: z.enum(['public', 'private']),
})

// ─── R2 State Object (stored in R2, not exposed to clients) ──────────────────

export type UploadState = {
  uploadId: string
  filename: string
  contentType: string
  size: number
  visibility: 'public' | 'private'
  completedParts: Array<{ partNumber: number; etag: string }>
}

// ─── DTO types ────────────────────────────────────────────────────────────────

export type StartUploadDto = z.infer<typeof StartUploadSchema>
export type CompleteUploadDto = z.infer<typeof CompleteUploadSchema>
export type UploadedPartDto = z.infer<typeof UploadedPartSchema>
```

- [ ] **Step 2: Verify schema compiles**

```bash
cd apps/api && pnpm check-types
```

Expected: errors only about missing `repository.ts` and `route.ts` — ignore until those tasks.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/module/file/schema.ts
git commit -m "feat(api/file): add Zod schemas for file upload endpoints"
```

---

## Task 3: Backend File Repository

**Files:**
- Create: `apps/api/src/module/file/repository.ts`

The repository encapsulates all R2 operations. It does NOT know about HTTP — it receives plain values and returns plain objects.

- [ ] **Step 1: Create `apps/api/src/module/file/repository.ts`**

```ts
import { UploadState, UploadedPartDto } from '@/module/file/schema'

// ─── Key helpers ──────────────────────────────────────────────────────────────

function fileKey(userId: string, hash: string, filename: string): string {
  return `${userId}/${hash}/${filename}`
}

function stateKey(userId: string, hash: string): string {
  return `${userId}/${hash}/.upload-state`
}

// ─── Token helpers ────────────────────────────────────────────────────────────

async function hmacSign(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hmacVerify(secret: string, message: string, signature: string): Promise<boolean> {
  const expected = await hmacSign(secret, message)
  // constant-time comparison
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return diff === 0
}

// ─── Repository factory ───────────────────────────────────────────────────────

export function createFileRepository(bucket: R2Bucket, signingSecret: string, publicBaseUrl: string) {
  return {
    // ── Start / Resume ───────────────────────────────────────────────────────

    async startUpload(
      userId: string,
      hash: string,
      filename: string,
      contentType: string,
      size: number,
      visibility: 'public' | 'private',
    ): Promise<UploadState> {
      const sk = stateKey(userId, hash)
      const existing = await bucket.get(sk)

      if (existing) {
        const state: UploadState = await existing.json()
        return state
      }

      const fk = fileKey(userId, hash, filename)
      const multipart = await bucket.createMultipartUpload(fk, {
        customMetadata: {
          'x-meta-user-id': userId,
          'x-meta-visibility': visibility,
          'x-meta-filename': filename,
          'x-meta-size': String(size),
        },
        httpMetadata: { contentType },
      })

      const state: UploadState = {
        uploadId: multipart.uploadId,
        filename,
        contentType,
        size,
        visibility,
        completedParts: [],
      }

      await bucket.put(sk, JSON.stringify(state))
      return state
    },

    // ── Upload Part ──────────────────────────────────────────────────────────

    async uploadPart(
      userId: string,
      hash: string,
      partNumber: number,
      body: ArrayBuffer,
    ): Promise<UploadedPartDto> {
      const sk = stateKey(userId, hash)
      const stateObj = await bucket.get(sk)
      if (!stateObj) throw new Error('Upload state not found')

      const state: UploadState = await stateObj.json()
      const fk = fileKey(userId, hash, state.filename)
      const multipart = bucket.resumeMultipartUpload(fk, state.uploadId)
      const uploaded = await multipart.uploadPart(partNumber, body)

      // Update completed parts in state
      const alreadyDone = state.completedParts.some(p => p.partNumber === partNumber)
      if (!alreadyDone) {
        state.completedParts.push({ partNumber: uploaded.partNumber, etag: uploaded.etag })
        state.completedParts.sort((a, b) => a.partNumber - b.partNumber)
        await bucket.put(sk, JSON.stringify(state))
      }

      return { partNumber: uploaded.partNumber, etag: uploaded.etag }
    },

    // ── Complete ─────────────────────────────────────────────────────────────

    async completeUpload(
      userId: string,
      hash: string,
      parts: UploadedPartDto[],
    ): Promise<{
      fileId: string
      url: string
      visibility: 'public' | 'private'
      filename: string
      contentType: string
      size: number
    }> {
      const sk = stateKey(userId, hash)
      const stateObj = await bucket.get(sk)
      if (!stateObj) throw new Error('Upload state not found')

      const state: UploadState = await stateObj.json()
      const fk = fileKey(userId, hash, state.filename)
      const multipart = bucket.resumeMultipartUpload(fk, state.uploadId)

      const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber)
      await multipart.complete(sorted)
      await bucket.delete(sk)

      const url = state.visibility === 'public' && publicBaseUrl
        ? `${publicBaseUrl}/${fk}`
        : ''

      return {
        fileId: hash,
        url,
        visibility: state.visibility,
        filename: state.filename,
        contentType: state.contentType,
        size: state.size,
      }
    },

    // ── Abort ────────────────────────────────────────────────────────────────

    async abortUpload(userId: string, hash: string): Promise<void> {
      const sk = stateKey(userId, hash)
      const stateObj = await bucket.get(sk)
      if (!stateObj) return  // already aborted or never started

      const state: UploadState = await stateObj.json()
      const fk = fileKey(userId, hash, state.filename)
      const multipart = bucket.resumeMultipartUpload(fk, state.uploadId)

      try {
        await multipart.abort()
      } catch {
        // Ignore if already completed/aborted
      }
      await bucket.delete(sk)
    },

    // ── Get File ─────────────────────────────────────────────────────────────

    async getFile(userId: string, hash: string): Promise<{
      object: R2Object
      key: string
    } | null> {
      const listed = await bucket.list({ prefix: `${userId}/${hash}/` })
      const file = listed.objects.find(o => !o.key.endsWith('/.upload-state'))
      if (!file) return null

      const object = await bucket.head(file.key)
      if (!object) return null

      return { object, key: file.key }
    },

    // ── Stream File (for signed download) ────────────────────────────────────

    async streamFile(key: string): Promise<R2ObjectBody | null> {
      return bucket.get(key)
    },

    // ── Delete File ──────────────────────────────────────────────────────────

    async deleteFile(userId: string, hash: string): Promise<boolean> {
      const listed = await bucket.list({ prefix: `${userId}/${hash}/` })
      const file = listed.objects.find(o => !o.key.endsWith('/.upload-state'))
      if (!file) return false

      await bucket.delete(file.key)
      return true
    },

    // ── Token (for private download URLs) ────────────────────────────────────

    async createDownloadToken(fileId: string, userId: string): Promise<string> {
      const exp = Math.floor(Date.now() / 1000) + 3600  // 1 hour
      const payload = `${fileId}:${userId}:${exp}`
      const sig = await hmacSign(signingSecret, payload)
      const data = btoa(JSON.stringify({ fileId, userId, exp }))
      return `${data}.${sig}`
    },

    async verifyDownloadToken(token: string): Promise<{ fileId: string; userId: string } | null> {
      const dotIdx = token.lastIndexOf('.')
      if (dotIdx === -1) return null

      const data = token.slice(0, dotIdx)
      const sig = token.slice(dotIdx + 1)

      let parsed: { fileId: string; userId: string; exp: number }
      try {
        parsed = JSON.parse(atob(data))
      } catch {
        return null
      }

      const now = Math.floor(Date.now() / 1000)
      if (parsed.exp < now) return null  // expired

      const payload = `${parsed.fileId}:${parsed.userId}:${parsed.exp}`
      const valid = await hmacVerify(signingSecret, payload, sig)
      if (!valid) return null

      return { fileId: parsed.fileId, userId: parsed.userId }
    },
  }
}

export type FileRepository = ReturnType<typeof createFileRepository>
```

- [ ] **Step 2: Type-check**

```bash
cd apps/api && pnpm check-types
```

Expected: errors only about missing `route.ts` — ignore.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/module/file/repository.ts
git commit -m "feat(api/file): add R2 file repository with multipart + HMAC tokens"
```

---

## Task 4: Backend Upload Routes

**Files:**
- Create: `apps/api/src/module/file/route.ts` (upload half)

- [ ] **Step 1: Create `apps/api/src/module/file/route.ts`** with the 4 upload endpoints

```ts
import { BadRequestException, ForbiddenException, NotFoundException } from '@/lib/errors'
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
  return c.req.header('X-User-Id') ?? 'mock-user-001'
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
      startFrom: state.completedParts.length + 1,
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
        'Content-Disposition': `inline; filename="${filename}"`,
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
```

- [ ] **Step 2: Type-check**

```bash
cd apps/api && pnpm check-types
```

Expected: errors only about `fileRepository` not yet injected — ignore until Task 6.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/module/file/route.ts
git commit -m "feat(api/file): add all 7 file upload/access routes"
```

---

## Task 5: Register Module + Wire DI

**Files:**
- Modify: `apps/api/src/module/index.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Export `fileRoute` from `apps/api/src/module/index.ts`**

Replace entire file:

```ts
import chunkRoute from '@/module/chunk/route'
import collectionRoute from '@/module/collection/route'
import documentRoute from '@/module/document/route'
import fileRoute from '@/module/file/route'
import searchRoute from '@/module/search/route'

export { chunkRoute, collectionRoute, documentRoute, fileRoute, searchRoute }
```

- [ ] **Step 2: Inject repository and mount route in `apps/api/src/index.ts`**

Replace entire file:

```ts
import { createDB } from '@/db'
import { chunkRoute, collectionRoute, documentRoute, fileRoute, searchRoute } from '@/module'
import { createChunkRepository } from '@/module/chunk/repository'
import { createCollectionRepository } from '@/module/collection/repository'
import { createDocumentRepository } from '@/module/document/repository'
import { createFileRepository } from '@/module/file/repository'
import { createSearchRepository } from '@/module/search/repository'
import { Env } from '@/types'
import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { HTTPException } from 'hono/http-exception'

const app = new OpenAPIHono<Env>()

app.use('*', async (c, next) => {
  const db = createDB(c.env.DATABASE_URL)
  c.set('db', db)
  c.set('documentRepository', createDocumentRepository(db))
  c.set('chunkRepository', createChunkRepository(db))
  c.set('searchRepository', createSearchRepository(db))
  c.set('collectionRepository', createCollectionRepository(db))
  c.set('fileRepository', createFileRepository(
    c.env.FILE_BUCKET,
    c.env.FILE_SIGNING_SECRET,
    c.env.PUBLIC_R2_BASE_URL,
  ))
  await next()
})

app.onError((err, c) => {
  console.error(err)
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status)
  }
  return c.json({ error: 'Internal Server Error' }, 500)
})

app.route('/', documentRoute)
app.route('/', chunkRoute)
app.route('/', searchRoute)
app.route('/', collectionRoute)
app.route('/', fileRoute)

app.get('/ui', swaggerUI({ url: '/doc' }))

app.doc('/doc', {
  info: { title: 'Holon API', version: 'v1' },
  openapi: '3.1.0',
})

export default app
```

- [ ] **Step 3: Final type-check**

```bash
cd apps/api && pnpm check-types
```

Expected: **0 errors**

- [ ] **Step 4: Start local dev server and verify routes are registered**

```bash
cd apps/api && pnpm dev
```

Visit `http://localhost:8787/ui` — you should see the File tag with 7 endpoints.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/module/index.ts apps/api/src/index.ts
git commit -m "feat(api/file): register file module and inject repository"
```

---

## Task 6: Manual API Testing

Before building the frontend, verify the backend works end-to-end with curl. Requires `pnpm dev` running in `apps/api`.

> **Note:** R2 in local `wrangler dev` uses an in-memory store that resets between server restarts. This is expected.

- [ ] **Step 1: Start upload**

```bash
curl -X POST http://localhost:8787/files/upload/start \
  -H "Content-Type: application/json" \
  -H "X-User-Id: test-user" \
  -d '{"hash":"a3f9c1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab","filename":"test.pdf","contentType":"application/pdf","size":1048576,"visibility":"private"}'
```

Expected response:
```json
{"uploadId":"...","chunkSize":10485760,"totalParts":1,"completedParts":[],"startFrom":1}
```

- [ ] **Step 2: Upload part**

```bash
# Create a 1MB test file
dd if=/dev/urandom of=/tmp/test.bin bs=1024 count=1024 2>/dev/null

curl -X PUT "http://localhost:8787/files/upload/a3f9c1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab/parts/1" \
  -H "X-User-Id: test-user" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @/tmp/test.bin
```

Expected: `{"partNumber":1,"etag":"..."}`

- [ ] **Step 3: Complete upload** (use the etag from Step 2)

```bash
curl -X POST "http://localhost:8787/files/upload/a3f9c1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab/complete" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: test-user" \
  -d '{"hash":"a3f9c1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab","parts":[{"partNumber":1,"etag":"ETAG_FROM_STEP_2"}]}'
```

Expected: `{"fileId":"a3f9c...","url":"","visibility":"private","filename":"test.pdf",...}`

- [ ] **Step 4: Get file URL**

```bash
curl -v http://localhost:8787/files/a3f9c1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab \
  -H "X-User-Id: test-user"
```

Expected: `{"url":"http://localhost:8787/files/a3f9c.../download?token=...","expiresIn":3600,"visibility":"private"}`

- [ ] **Step 5: Test forbidden access**

```bash
curl -v http://localhost:8787/files/a3f9c1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab \
  -H "X-User-Id: other-user"
```

Expected: `403 Forbidden`

- [ ] **Step 6: Test download via token**

Copy the `url` from Step 4 and fetch it:

```bash
curl "http://localhost:8787/files/a3f9c.../download?token=TOKEN_FROM_STEP_4" -o /tmp/downloaded.bin
# Verify file size matches
wc -c /tmp/downloaded.bin
```

Expected: `1048576 /tmp/downloaded.bin`

---

## Task 7: Frontend — File Hash

**Files:**
- Create: `apps/web/src/lib/file-hash.ts`

- [ ] **Step 1: Create `apps/web/src/lib/file-hash.ts`**

```ts
const HEAD_SIZE = 2 * 1024 * 1024      // 2MB
const TAIL_SIZE = 2 * 1024 * 1024      // 2MB
const SAMPLE_SIZE = 512 * 1024          // 512KB per middle sample
const SAMPLE_POINTS = [0.2, 0.4, 0.6, 0.8]  // offsets as fraction of file size

async function readSlice(file: File, start: number, end: number): Promise<ArrayBuffer> {
  return file.slice(Math.max(0, start), Math.min(file.size, end)).arrayBuffer()
}

/**
 * Compute a fast sampled SHA-256 hash of a file.
 * Reads ~6MB fixed regardless of file size.
 * Suitable for upload identity/resume — not a cryptographic guarantee.
 */
export async function computeFileHash(file: File): Promise<string> {
  const size = file.size

  const chunks: ArrayBuffer[] = []

  // Head
  chunks.push(await readSlice(file, 0, HEAD_SIZE))

  // Tail (only if file is large enough to have a distinct tail)
  if (size > HEAD_SIZE + TAIL_SIZE) {
    chunks.push(await readSlice(file, size - TAIL_SIZE, size))
  }

  // Middle samples
  for (const point of SAMPLE_POINTS) {
    const start = Math.floor(size * point)
    if (start + SAMPLE_SIZE > size - TAIL_SIZE && size > HEAD_SIZE + TAIL_SIZE) continue
    if (start < HEAD_SIZE && size > HEAD_SIZE) continue
    chunks.push(await readSlice(file, start, start + SAMPLE_SIZE))
  }

  // Append fileSize as 8-byte little-endian uint64
  const sizeBuffer = new ArrayBuffer(8)
  const sizeView = new DataView(sizeBuffer)
  sizeView.setBigUint64(0, BigInt(size), true)
  chunks.push(sizeBuffer)

  // Append filename as UTF-8
  chunks.push(new TextEncoder().encode(file.name).buffer as ArrayBuffer)

  // Concatenate all chunks
  const totalLength = chunks.reduce((acc, c) => acc + c.byteLength, 0)
  const combined = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(new Uint8Array(chunk), offset)
    offset += chunk.byteLength
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', combined)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && pnpm typecheck
```

Expected: 0 errors for this file.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/file-hash.ts
git commit -m "feat(web): add sampled SHA-256 file hash utility"
```

---

## Task 8: Frontend — API Client

**Files:**
- Create: `apps/web/src/lib/file-api.ts`

- [ ] **Step 1: Create `apps/web/src/lib/file-api.ts`**

```ts
const API_BASE = 'https://api.holon.dev'

export type StartUploadParams = {
  hash: string
  filename: string
  contentType: string
  size: number
  visibility: 'public' | 'private'
}

export type StartUploadResult = {
  uploadId: string
  chunkSize: number
  totalParts: number
  completedParts: Array<{ partNumber: number; etag: string }>
  startFrom: number
}

export type UploadPartResult = {
  partNumber: number
  etag: string
}

export type CompleteUploadResult = {
  fileId: string
  url: string
  visibility: 'public' | 'private'
  filename: string
  contentType: string
  size: number
}

export type GetFileResult = {
  url: string
  expiresIn?: number
  visibility: 'public' | 'private'
}

async function apiRequest<T>(
  path: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    signal,
    headers: {
      'X-User-Id': 'mock-user-001',
      ...init.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}

export const fileApi = {
  startUpload(params: StartUploadParams): Promise<StartUploadResult> {
    return apiRequest('/files/upload/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
  },

  uploadPart(
    hash: string,
    partNumber: number,
    chunk: ArrayBuffer,
    signal?: AbortSignal,
  ): Promise<UploadPartResult> {
    return apiRequest(`/files/upload/${hash}/parts/${partNumber}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: chunk,
    }, signal)
  },

  completeUpload(
    hash: string,
    parts: Array<{ partNumber: number; etag: string }>,
  ): Promise<CompleteUploadResult> {
    return apiRequest(`/files/upload/${hash}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash, parts }),
    })
  },

  abortUpload(hash: string): Promise<void> {
    return apiRequest(`/files/upload/${hash}`, { method: 'DELETE' })
  },

  getFile(fileId: string): Promise<GetFileResult> {
    return apiRequest(`/files/${fileId}`, { method: 'GET' })
  },

  deleteFile(fileId: string): Promise<void> {
    return apiRequest(`/files/${fileId}`, { method: 'DELETE' })
  },
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && pnpm typecheck
```

Expected: 0 errors for this file.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/file-api.ts
git commit -m "feat(web): add file API client"
```

---

## Task 9: Frontend — Upload Hook

**Files:**
- Create: `apps/web/src/hooks/use-file-upload.ts`

- [ ] **Step 1: Create `apps/web/src/hooks/use-file-upload.ts`**

```ts
import { computeFileHash } from '@/lib/file-hash'
import { fileApi, CompleteUploadResult } from '@/lib/file-api'
import { useCallback, useRef, useState } from 'react'

export type UploadStatus = 'idle' | 'hashing' | 'uploading' | 'paused' | 'complete' | 'error'

export type UploadState = {
  status: UploadStatus
  /** 0–100: percentage of parts uploaded */
  progress: number
  /** SHA-256 sampled hash of the file, set after hashing completes */
  fileId: string | null
  /** Final URL (public files only); empty string for private */
  url: string | null
  error: string | null
}

const INITIAL_STATE: UploadState = {
  status: 'idle',
  progress: 0,
  fileId: null,
  url: null,
  error: null,
}

export function useFileUpload() {
  const [state, setState] = useState<UploadState>(INITIAL_STATE)
  const abortRef = useRef<AbortController | null>(null)
  const hashRef = useRef<string | null>(null)

  const reset = useCallback(() => {
    setState(INITIAL_STATE)
    hashRef.current = null
  }, [])

  const upload = useCallback(async (
    file: File,
    visibility: 'public' | 'private',
  ) => {
    try {
      // 1. Hash
      setState(s => ({ ...s, status: 'hashing', error: null }))
      const hash = await computeFileHash(file)
      hashRef.current = hash
      setState(s => ({ ...s, fileId: hash }))

      // 2. Start (new or resume)
      const session = await fileApi.startUpload({
        hash,
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
        visibility,
      })

      const { chunkSize, totalParts, completedParts } = session
      const doneParts = [...completedParts]

      setState(s => ({
        ...s,
        status: 'uploading',
        progress: Math.round((doneParts.length / totalParts) * 100),
      }))

      // 3. Upload remaining parts
      abortRef.current = new AbortController()

      for (let partNumber = session.startFrom; partNumber <= totalParts; partNumber++) {
        const start = (partNumber - 1) * chunkSize
        const end = Math.min(start + chunkSize, file.size)
        const chunk = await file.slice(start, end).arrayBuffer()

        const result = await fileApi.uploadPart(hash, partNumber, chunk, abortRef.current.signal)
        doneParts.push(result)

        setState(s => ({
          ...s,
          progress: Math.round((doneParts.length / totalParts) * 100),
        }))
      }

      // 4. Complete
      const completed: CompleteUploadResult = await fileApi.completeUpload(hash, doneParts)
      setState({
        status: 'complete',
        progress: 100,
        fileId: hash,
        url: completed.url || null,
        error: null,
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setState(s => ({ ...s, status: 'paused' }))
      } else {
        setState(s => ({
          ...s,
          status: 'error',
          error: err instanceof Error ? err.message : 'Upload failed',
        }))
      }
    }
  }, [])

  const pause = useCallback(() => {
    abortRef.current?.abort()
    // status is set to 'paused' by the AbortError catch in upload()
  }, [])

  const resume = useCallback(async (
    file: File,
    visibility: 'public' | 'private',
  ) => {
    // Re-run upload — startUpload will detect existing state in R2 and return startFrom > 1
    await upload(file, visibility)
  }, [upload])

  const abort = useCallback(async (file: File) => {
    abortRef.current?.abort()
    try {
      setState(s => ({ ...s, status: 'idle', error: null }))
      if (hashRef.current) {
        await fileApi.abortUpload(hashRef.current)
      } else {
        // Need to hash first to get the key
        const hash = await computeFileHash(file)
        await fileApi.abortUpload(hash)
      }
      hashRef.current = null
    } catch {
      // Ignore abort errors
    }
    setState(INITIAL_STATE)
  }, [])

  return { state, upload, pause, resume, abort, reset }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/use-file-upload.ts
git commit -m "feat(web): add useFileUpload hook with progress tracking"
```

---

## Task 10: Frontend — File Uploader Component

**Files:**
- Create: `apps/web/src/components/file/file-uploader.tsx`

- [ ] **Step 1: Create directory**

```bash
mkdir -p apps/web/src/components/file
```

- [ ] **Step 2: Create `apps/web/src/components/file/file-uploader.tsx`**

```tsx
import { useFileUpload } from '@/hooks/use-file-upload'
import { Button } from '@workspace/ui/components/button'
import { useRef, useState } from 'react'

const ACCEPTED_TYPES = '.pdf,image/*'

export function FileUploader() {
  const { state, upload, pause, resume, abort } = useFileUpload()
  const [visibility, setVisibility] = useState<'public' | 'private'>('private')
  const fileRef = useRef<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    fileRef.current = file
  }

  function handleUpload() {
    if (!fileRef.current) return
    upload(fileRef.current, visibility)
  }

  function handlePause() {
    pause()
  }

  function handleResume() {
    if (!fileRef.current) return
    resume(fileRef.current, visibility)
  }

  function handleAbort() {
    if (!fileRef.current) return
    abort(fileRef.current)
    if (inputRef.current) inputRef.current.value = ''
    fileRef.current = null
  }

  const { status, progress, url, error } = state

  return (
    <div className="flex flex-col gap-4 p-4 max-w-md">
      <h2 className="text-lg font-semibold">Upload File</h2>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={handleFileChange}
        disabled={status === 'uploading' || status === 'hashing'}
        className="block w-full text-sm"
      />

      <div className="flex gap-2 items-center">
        <label className="text-sm font-medium">Visibility:</label>
        <select
          value={visibility}
          onChange={e => setVisibility(e.target.value as 'public' | 'private')}
          disabled={status === 'uploading' || status === 'hashing'}
          className="text-sm border rounded px-2 py-1"
        >
          <option value="private">Private</option>
          <option value="public">Public</option>
        </select>
      </div>

      {/* Status display */}
      <div className="text-sm text-muted-foreground">
        Status: <span className="font-medium">{status}</span>
        {status === 'uploading' && ` — ${progress}%`}
      </div>

      {/* progress variable — ready for a <ProgressBar progress={progress} /> component */}
      {(status === 'uploading' || status === 'paused') && (
        <div className="text-xs text-muted-foreground">
          Progress: {progress} / 100
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        {(status === 'idle' || status === 'error') && (
          <Button onClick={handleUpload} disabled={!fileRef.current}>
            Upload
          </Button>
        )}
        {status === 'uploading' && (
          <Button variant="outline" onClick={handlePause}>
            Pause
          </Button>
        )}
        {status === 'paused' && (
          <Button onClick={handleResume} disabled={!fileRef.current}>
            Resume
          </Button>
        )}
        {(status === 'uploading' || status === 'paused') && (
          <Button variant="outline" onClick={handleAbort}>
            Cancel
          </Button>
        )}
      </div>

      {/* Result */}
      {status === 'complete' && (
        <div className="text-sm text-green-600">
          Upload complete!
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="ml-2 underline">
              View file
            </a>
          )}
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600">Error: {error}</div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Add component to a test route — create or edit `apps/web/src/routes/dashboard/index.tsx`**

This lets you see the component in the browser without further setup:

```tsx
import { FileUploader } from '@/components/file/file-uploader'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="p-8">
      <FileUploader />
    </div>
  )
}
```

- [ ] **Step 5: Start web dev server and smoke test**

```bash
# Terminal 1
cd apps/api && pnpm dev

# Terminal 2
cd apps/web && pnpm dev
```

Open `http://localhost:3000/dashboard` (or `https://holon.dev/dashboard`). 

Verify:
- File picker appears
- Selecting a PDF or image enables Upload button
- Clicking Upload shows `status: hashing` briefly, then `uploading`
- `progress` increments per part
- Completes with `status: complete`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/file/file-uploader.tsx apps/web/src/routes/dashboard/index.tsx
git commit -m "feat(web): add FileUploader component with progress variable"
```

---

## Self-Review Checklist

After all tasks complete, verify:

- [ ] `POST /files/upload/start` returns correct `startFrom` for both new and resumed uploads
- [ ] `PUT /files/upload/:hash/parts/:partNumber` updates `.upload-state` in R2 after each part
- [ ] `POST /files/upload/:hash/complete` deletes `.upload-state` after completing
- [ ] Private `GET /files/:fileId` returns 403 for wrong userId
- [ ] Download token expires after 3600s (verify manually by setting short expiry in dev)
- [ ] `useFileUpload` `progress` variable reaches 100 on completion
- [ ] `status: 'paused'` is set when AbortController fires mid-upload
- [ ] Resume re-hashes file and calls `startUpload` — server returns `startFrom > 1` for partial uploads
- [ ] TypeScript 0 errors in both `apps/api` and `apps/web`
