import 'dotenv/config'
import { randomUUID } from 'crypto'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import csrf from 'tiny-csrf'

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

// Trust Fly.io's proxy so Express sees the real client IP in req.ip.
// Required for express-rate-limit to work correctly behind a reverse proxy.
if (IS_PROD) app.set('trust proxy', 1)

// ─── Request ID ──────────────────────────────────────────────────────────────
// Attach a UUID to every request so all log lines for one request can be correlated.
// Exposed as X-Request-Id so clients/tests can reference it too.
app.use((req, res, next) => {
  req.id = randomUUID()
  res.setHeader('X-Request-Id', req.id)
  next()
})

// ─── Cookie parsing ───────────────────────────────────────────────────────────
// Secret required by tiny-csrf so the _csrf cookie is signed.
app.use(cookieParser(process.env.JWT_SECRET))

// ─── CSRF protection ──────────────────────────────────────────────────────────
// tiny-csrf: token is served via GET /api/v1/csrf-token, stored in memory by
// the frontend, and echoed back as req.body._csrf on every mutating request.
// Skipped in test environment.
const csrfSecret = process.env.JWT_SECRET.slice(0, 32) // tiny-csrf requires exactly 32 chars

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(helmet())

// ─── CORS ─────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = IS_PROD
  ? (process.env.ALLOWED_ORIGINS ?? '').split(',').map(o => o.trim()).filter(Boolean)
  : ['http://localhost:3000']

if (IS_PROD && ALLOWED_ORIGINS.length === 0) {
  console.error('❌  ALLOWED_ORIGINS is required in production.')
  console.error('    On Fly.io: fly secrets set ALLOWED_ORIGINS="https://lockedinforlife.com,https://www.lockedinforlife.com"')
  process.exit(1)
}

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
    cb(Object.assign(new Error(`CORS: origin ${origin} not allowed`), { status: 403 }))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
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
        method:     req.method,
        path:       req.path,
        status:     _res.statusCode,
        ms:         Date.now() - start,
        userId:     req.user?.id ?? null,
        ip:         req.ip,
        requestId:  req.id,
      })
    }
  })
  next()
})

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

// Apply CSRF middleware globally so req.csrfToken() is always available (tiny-csrf
// needs to run on GET /csrf-token to generate the secret cookie). Auth routes are
// excluded from enforcement — login/register are unauthenticated so no token
// exists yet, and CSRF attacks require an existing session to be useful.
// Skipped in test environment.
if (process.env.NODE_ENV !== 'test') {
  const csrfMiddleware = csrf(csrfSecret, ['POST', 'PUT', 'PATCH', 'DELETE'])
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.path.startsWith('/api/v1/auth/')) return next()
    csrfMiddleware(req, res, next)
  })
}

// ─── CSRF token endpoint ──────────────────────────────────────────────────────
// Called once on app load (and refreshed every 4 min). tiny-csrf sets the secret
// cookie on this GET request; subsequent POSTs to protected routes validate
// req.body._csrf against that cookie.
app.get('/api/v1/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken() })
})

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
  if (err.message?.startsWith('Did not get a valid CSRF token')) {
    return res.status(403).json({ error: { code: 'CSRF_INVALID', message: 'Invalid or missing CSRF token' } })
  }

  const status  = err.status  || 500
  const code    = err.code    || 'INTERNAL_ERROR'

  if (!IS_PROD) {
    console.error(err)
    return res.status(status).json({ error: { code, message: err.message, stack: err.stack } })
  }

  logger.error('UNHANDLED_ERROR', { err, code, status, requestId: _req.id })
  const message = status < 500 ? err.message : 'Something went wrong'
  res.status(status).json({ error: { code, message } })
})

// ─── Only bind port when run directly, not when imported by tests ─────────────
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀  Server running on port ${PORT}`)
    console.log(`    Environment: ${process.env.NODE_ENV ?? 'development'}`)
    logger.info('SERVER_START', { port: PORT, env: process.env.NODE_ENV ?? 'development' })
  })
}

export default app
