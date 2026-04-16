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

  // Middle samples (skip if head already covers the whole file)
  if (size > HEAD_SIZE) {
    for (const point of SAMPLE_POINTS) {
      const start = Math.floor(size * point)
      if (start + SAMPLE_SIZE > size - TAIL_SIZE && size > HEAD_SIZE + TAIL_SIZE) continue
      if (start < HEAD_SIZE) continue
      chunks.push(await readSlice(file, start, start + SAMPLE_SIZE))
    }
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
