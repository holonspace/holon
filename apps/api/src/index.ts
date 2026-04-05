import { OpenAPIHono } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import { createDb } from '@/db/client'
import collectionRoute from '@/modules/collection/route'
import documentRoute   from '@/modules/document/route'
import searchRoute     from '@/modules/search/route'

type Bindings = { DB_URL: string }
type Variables = { db: ReturnType<typeof createDb> }

const app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>()

// Singleton DB pool per Worker isolate — CF Workers reuses isolates across
// requests, so module-level singleton avoids creating a new Pool every request.
let _db: ReturnType<typeof createDb> | null = null

app.use('*', async (c, next) => {
  if (!_db) _db = createDb(c.env.DB_URL)
  c.set('db', _db)
  await next()
})

app.route('/', collectionRoute)
app.route('/', documentRoute)
app.route('/', searchRoute)

app.get('/ui', swaggerUI({ url: '/doc' }))

app.doc('/doc', {
  info: { title: 'Holon API', version: 'v1' },
  openapi: '3.1.0',
})

export default app
