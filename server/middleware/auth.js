import jwt from 'jsonwebtoken'
import { logger } from '../lib/logger.js'

export function requireAuth(req, res, next) {
  const token = req.cookies?.jwt
  if (!token) {
    logger.warn('TOKEN_MISSING', { endpoint: req.path, method: req.method, ip: req.ip, requestId: req.id })
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing token' } })
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch (err) {
    logger.warn('TOKEN_INVALID', { endpoint: req.path, method: req.method, ip: req.ip, reason: err.message, requestId: req.id })
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } })
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      logger.warn('PERMISSION_DENIED', {
        userId:       req.user?.id ?? null,
        role:         req.user?.role ?? null,
        requiredRole: roles,
        endpoint:     req.path,
        method:       req.method,
        requestId:    req.id,
      })
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } })
    }
    next()
  }
}
