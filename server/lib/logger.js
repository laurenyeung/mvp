import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const IS_TEST = process.env.NODE_ENV === 'test'
const IS_PROD = process.env.NODE_ENV === 'production'

// In production write to stdout (captured by process manager / log aggregator).
// In development write to logs/server.log (append-only, one JSON object per line).
// In test stay silent — don't pollute test output.

const LOG_DIR  = path.resolve(fileURLToPath(import.meta.url), '../../logs')
const LOG_FILE = path.join(LOG_DIR, 'server.log')

let fileReady = false

function ensureLogFile() {
  if (fileReady || IS_TEST || IS_PROD) return
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    fileReady = true
  } catch {
    // If we can't create the dir, fall back to console
  }
}

function write(level, event, data) {
  if (IS_TEST) return
  const entry = JSON.stringify({ ts: new Date().toISOString(), level, event, ...data })
  if (IS_PROD) {
    process.stdout.write(entry + '\n')
    return
  }
  ensureLogFile()
  try {
    fs.appendFileSync(LOG_FILE, entry + '\n')
  } catch {
    process.stderr.write(entry + '\n')
  }
}

export const logger = {
  info:  (event, data = {}) => write('info',  event, data),
  error: (event, data = {}) => write('error', event, data),
  warn:  (event, data = {}) => write('warn',  event, data),
}
