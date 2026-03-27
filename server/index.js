import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'

import { logger } from './lib/logger.js'
import { apiLimiter } from './middleware/rateLimiter.js'
import authRoutes     from './routes/auth.js'
import exerciseRoutes from './routes/exercises.js'
import coachRoutes    from './routes/coach.js'
import clientRoutes   from './routes/client.js'
import messageRoutes  from './routes/messages.js'
import mediaRoutes    from './routes/media.js'

// ─── Validate required env vars at startup ────────────────────────────────────
const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET']
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`❌  Missing required environment variable: ${key}`)
    console.error('    Copy server/.env.example to server/.env and fill it in.')
    process.exit(1)
  }
}
if (process.env.JWT_SECRET.length < 32) {
  console.error('❌  JWT_SECRET must be at least 32 characters long.')
  process.exit(1)
}

const app  = express()
const PORT = process.env.PORT || 4000
const IS_PROD = process.env.NODE_ENV === 'production'

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(helmet())

// ─── CORS ─────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = IS_PROD
  ? (process.env.ALLOWED_ORIGINS ?? '').split(',').map(o => o.trim()).filter(Boolean)
  : ['http://localhost:3000']

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
    cb(new Error(`CORS: origin ${origin} not allowed`))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '64kb' }))
app.use(express.urlencoded({ extended: false, limit: '64kb' }))

// ─── Rate limiting ────────────────────────────────────────────────────────────
// Skip rate limiting in test environment
if (process.env.NODE_ENV !== 'test') {
  app.use('/api/', apiLimiter)
}

// ─── Request audit logging ────────────────────────────────────────────────────
// Log all mutating requests with user context, path, status and latency.
app.use((req, _res, next) => {
  const start = Date.now()
  _res.on('finish', () => {
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
      logger.info('REQUEST', {
        method:  req.method,
        path:    req.path,
        status:  _res.statusCode,
        ms:      Date.now() - start,
        userId:  req.user?.id ?? null,
        ip:      req.ip,
      })
    }
  })
  next()
})

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/v1/auth',      authRoutes)
app.use('/api/v1/exercises', exerciseRoutes)
app.use('/api/v1/coach',     coachRoutes)
app.use('/api/v1/client',    clientRoutes)
app.use('/api/v1/messages',  messageRoutes)
app.use('/api/v1/media',     mediaRoutes)

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } })
})

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  const status  = err.status  || 500
  const code    = err.code    || 'INTERNAL_ERROR'

  if (!IS_PROD) {
    console.error(err)
    return res.status(status).json({ error: { code, message: err.message, stack: err.stack } })
  }

  logger.error('UNHANDLED_ERROR', { code, message: err.message, status })
  console.error(`[${new Date().toISOString()}] ${code}: ${err.message}`)
  const message = status < 500 ? err.message : 'Something went wrong'
  res.status(status).json({ error: { code, message } })
})

// ─── Only bind port when run directly, not when imported by tests ─────────────
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀  Server running on http://localhost:${PORT}`)
    console.log(`    Environment: ${process.env.NODE_ENV ?? 'development'}`)
    logger.info('SERVER_START', { port: PORT, env: process.env.NODE_ENV ?? 'development' })
  })
}

export default app
