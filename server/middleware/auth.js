import jwt from 'jsonwebtoken'

export function requireAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing token' } })
  try {
    req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } })
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } })
    }
    next()
  }
}
