import { drizzle } from 'drizzle-orm/node-postgres'
import { Client } from 'pg'
import * as schema from './schema'

/**
 * Create a Drizzle ORM instance backed by a single pg.Client.
 *
 * CF Workers runtime cancels dangling socket event-listeners after each
 * response unless `ctx.waitUntil(client.end())` is called.  Callers must
 * schedule that cleanup themselves via `c.executionCtx.waitUntil(client.end())`.
 *
 * Returns both the Drizzle `db` handle and the raw `client` so callers can
 * call `client.end()` in a `waitUntil` to avoid Miniflare "hung" errors.
 */
export async function createDb(connectionString: string) {
  const client = new Client({
    connectionString,
    ssl: false,          // local Docker; set ssl: true for production Neon/RDS
  })
  await client.connect()
  const db = drizzle(client, { schema })
  return { db, client }
}

export type Db = Awaited<ReturnType<typeof createDb>>['db']
