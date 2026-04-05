import { Pool } from 'pg'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function migrate() {
  const url = process.env.DB_URL ?? 'postgresql://postgres:postgres@localhost:5432/holon'
  const pool = new Pool({ connectionString: url, ssl: false })

  console.log('Running migration...')
  const sql = readFileSync(join(__dirname, 'migrations/0000_init.sql'), 'utf8')
  await pool.query(sql)
  await pool.end()
  console.log('Migration complete.')
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
