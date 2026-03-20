import rateLimit from 'express-rate-limit'

// ─── Shared response formatter ────────────────────────────────────────────────
const handler = (req, res) =>
  res.status(429).json({
    error: { code: 'RATE_LIMITED', message: 'Too many requests — please slow down.' },
  })

// No-op middleware for test environment — allows unlimited requests in tests
const noopLimiter = (_req, _res, next) => next()

const isTest = process.env.NODE_ENV === 'test'

// ─── Auth endpoints (login / register) ───────────────────────────────────────
// 10 attempts per 15 minutes per IP — prevents brute-force and credential stuffing
export const authLimiter = isTest ? noopLimiter : rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
})

// ─── General API ─────────────────────────────────────────────────────────────
// 200 requests per minute per IP — allows normal usage, throttles scrapers/DDoS
export const apiLimiter = isTest ? noopLimiter : rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
})

// ─── Media / presign ─────────────────────────────────────────────────────────
// 30 presign requests per minute — prevents S3 URL farming
export const mediaLimiter = isTest ? noopLimiter : rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
})
