import { OpenAPIHono } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import { createDb } from '@/db/client'
import collectionRoute from '@/modules/collection/route'
import documentRoute   from '@/modules/document/route'
import searchRoute     from '@/modules/search/route'

type Bindings = { DB_URL: string }
type Variables = { db: ReturnType<typeof createDb> }

const app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>()

// Per-request pg.Client pattern (recommended for CF Workers without Hyperdrive).
//
// CF Workers runtime cancels dangling socket event-listeners after each response.
// We create a fresh Client per request and use ctx.waitUntil(client.end()) to
// cleanly close the connection AFTER the response is sent.
//
// For production, replace with Hyperdrive + a module-level Pool.

app.use('*', async (c, next) => {
  const { db, client } = await createDb(c.env.DB_URL)
  c.set('db', db)
  try {
    await next()
  } finally {
    // Schedule connection cleanup after response is flushed.
    c.executionCtx.waitUntil(client.end())
  }
})

app.onError((err, c) => {
  console.error('[onError]', err)
  return c.json({ error: err.message }, 500)
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
