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
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'

const app = new OpenAPIHono<Env>()

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-User-Id'],
  maxAge: 600,
}))

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
