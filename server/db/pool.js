import 'dotenv/config'
import pg from 'pg'
const { Pool } = pg

if (!process.env.DATABASE_URL) {
  console.error('❌  DATABASE_URL is not set. Copy server/.env.example to server/.env and fill it in.')
  console.error('    Or run: bash fix-postgres.sh from the project root.')
  process.exit(1)
}

if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  console.error('❌  JWT_SECRET must be at least 32 characters long.')
  process.exit(1)
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL client error:', err.message)
})

export async function query(text, params) {
  const client = await pool.connect()
  try {
    return await client.query(text, params)
  } finally {
    client.release()
  }
}

export async function transaction(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
