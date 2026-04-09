import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/index'

export type Database = ReturnType<typeof drizzle<typeof schema>>

export function createDB(connectionString: string): Database {
  const client = postgres(connectionString, { prepare: false, max: 1 })
  return drizzle(client, { schema })
}
