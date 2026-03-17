import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.js';
import exerciseRoutes from './routes/exercises.js';
import coachRoutes from './routes/coach.js';
import clientRoutes from './routes/client.js';
import messageRoutes from './routes/messages.js';
import mediaRoutes from './routes/media.js';

const app = express();
const PORT = process.env.PORT || 3001;

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use('/api/', limiter);

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/v1/auth',      authRoutes);
app.use('/api/v1/exercises', exerciseRoutes);
app.use('/api/v1/coach',     coachRoutes);
app.use('/api/v1/client',    clientRoutes);
app.use('/api/v1/messages',  messageRoutes);
app.use('/api/v1/media',     mediaRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }));

// ── Error handler ─────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'An unexpected error occurred',
    },
  });
});

app.listen(PORT, () => {
  console.log(`🚀 API running on http://localhost:${PORT}`);
});

export default app;
