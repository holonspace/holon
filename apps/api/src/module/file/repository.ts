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
