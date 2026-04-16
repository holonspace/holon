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
  // 204 No Content (DELETE endpoints) — no body to parse
  if (res.status === 204) return undefined as T
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
