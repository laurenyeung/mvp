import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { query } from '../db/pool.js'
import { requireAuth } from '../middleware/auth.js'
import { authLimiter } from '../middleware/rateLimiter.js'
import { registerSchema, loginSchema } from '../middleware/validate.js'

const router = Router()

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  )
}

// ─── POST /auth/register ──────────────────────────────────────────────────────
// Rate-limited: 10 attempts per 15 min per IP
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    // Validate + sanitize input
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message },
      })
    }
    const { email, password, role, first_name, last_name } = parsed.data
    // email is already lowercased + trimmed by the schema

    const existing = await query('SELECT id FROM users WHERE email=$1', [email])
    if (existing.rows.length) {
      // Use a generic message to avoid user enumeration
      return res.status(409).json({ error: { code: 'CONFLICT', message: 'Email already registered' } })
    }

    const password_hash = await bcrypt.hash(password, 12)
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, role, first_name, last_name)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, email, role, first_name, last_name, created_at`,
      [email, password_hash, role, first_name, last_name]
    )
    const user = rows[0]

    if (role === 'COACH') {
      await query('INSERT INTO coach_profiles (user_id) VALUES ($1)', [user.id])
    }

    res.status(201).json({ data: { user, token: signToken(user) } })
  } catch (err) { next(err) }
})

// ─── POST /auth/login ─────────────────────────────────────────────────────────
// Rate-limited: 10 attempts per 15 min per IP — brute-force protection
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      // Intentionally vague — don't reveal which field failed
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } })
    }
    const { email, password } = parsed.data

    const { rows } = await query(
      'SELECT * FROM users WHERE email=$1 AND is_active=true', [email]
    )

    // Always run bcrypt even if user not found — prevents timing attacks
    const dummyHash = '$2a$12$invalidhashfortimingattackprevention000000000000000000000'
    const hashToCheck = rows[0]?.password_hash ?? dummyHash
    const valid = await bcrypt.compare(password, hashToCheck)

    if (!rows.length || !valid) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } })
    }

    const { password_hash, ...safeUser } = rows[0]
    res.json({ data: { user: safeUser, token: signToken(safeUser) } })
  } catch (err) { next(err) }
})

// ─── GET /auth/me ─────────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, email, role, first_name, last_name, profile_image_url, created_at
       FROM users WHERE id=$1`,
      [req.user.id]
    )
    if (!rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } })
    res.json({ data: { user: rows[0] } })
  } catch (err) { next(err) }
})

export default router
