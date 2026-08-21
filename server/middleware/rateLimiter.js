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
// 30 attempts per 15 minutes per IP — throttles brute-force/credential-stuffing
// scripts while tolerating real usage on a shared IP (e.g. several coaches/
// clients on the same gym WiFi) and normal password-mistype retries. IP-based
// limiting is a blunt secondary defense — bcrypt cost 12 is what actually
// makes each guess expensive; this just caps request volume.
export const authLimiter = isTest ? noopLimiter : rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
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
