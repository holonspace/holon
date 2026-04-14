import { createAuth } from '@/auth'
import { AuthPage } from '@/page/auth'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { renderer } from './renderer'
import type { Env } from './types'

const app = new Hono<Env>()

// CORS configuration for auth routesƒ
app.use(
  "/api/**",
  cors({
    origin: (origin, c) => {
      const allowedOrigins = c.env.ALLOWED_ORIGINS.split(",")
      // 如果請求的 origin 在允許名單中，回傳該 origin；否則回傳 null
      return allowedOrigins.includes(origin) ? origin : null
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    maxAge: 600,
    credentials: true,
  })
)

// Middleware to initialize auth instance for each request
app.use("*", async (c, next) => {
  const auth = createAuth(c.env, (c.req.raw as any).cf || {})
  c.set("auth", auth)
  await next()
})

// Handle all auth routes
app.all("/api/*", async c => {
  const auth = c.get("auth")
  try {
    return auth.handler(c.req.raw)
  } catch (error) {
    if (error instanceof HTTPException) {
      return c.json({ error: error.message }, error.status)
    }
    return c.json({ error: "Internal server error" }, 500)
  }
})

app.use(renderer)

app.get('/', (c) => {
  return c.render(<AuthPage />, { page: 'auth' })
})


export default app
