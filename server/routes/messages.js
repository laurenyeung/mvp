import { Router } from 'express'
import { query } from '../db/pool.js'
import { requireAuth } from '../middleware/auth.js'
import { sendMessageSchema, uuidSchema } from '../middleware/validate.js'

const router = Router()
router.use(requireAuth)

async function enrichThreads(threads, userId) {
  return Promise.all(
    threads.map(async (t) => {
      const otherUserId = t.coach_user_id === userId ? t.client_user_id : t.coach_user_id
      const { rows } = await query(
        `SELECT id, first_name, last_name, role, profile_image_url FROM users WHERE id=$1`,
        [otherUserId]
      )
      const { rows: lastMsg } = await query(
        `SELECT content FROM messages WHERE thread_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [t.id]
      )
      return { ...t, other_user: rows[0] ?? null, last_message: lastMsg[0]?.content ?? null }
    })
  )
}

// GET /messages/threads
router.get('/threads', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT mt.*,
              cp_coach.user_id  AS coach_user_id,
              cp_client.user_id AS client_user_id
       FROM message_threads mt
       JOIN coach_profiles  cp_coach  ON cp_coach.id  = mt.coach_id
       JOIN client_profiles cp_client ON cp_client.id = mt.client_id
       WHERE cp_coach.user_id=$1 OR cp_client.user_id=$1
       ORDER BY mt.created_at DESC`,
      [req.user.id]
    )
    const enriched = await enrichThreads(rows, req.user.id)
    res.json({ data: enriched })
  } catch (err) { next(err) }
})

// GET /messages/threads/:threadId
router.get('/threads/:threadId', async (req, res, next) => {
  try {
    const idParsed = uuidSchema.safeParse(req.params.threadId)
    if (!idParsed.success) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Thread not found' } })

    // Clamp limit to 1–100 — prevents fetching entire message history in one shot
    const rawLimit = parseInt(req.query.limit, 10)
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 30

    const cursorParsed = req.query.cursor ? uuidSchema.safeParse(req.query.cursor) : null
    const cursor = cursorParsed?.success ? cursorParsed.data : null

    const params = [idParsed.data, limit + 1]
    let cursorClause = ''
    if (cursor) { params.push(cursor); cursorClause = `AND m.id < $${params.length}` }

    const { rows } = await query(
      `SELECT m.id, m.thread_id, m.sender_id, m.content, m.created_at,
              u.first_name, u.last_name
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.thread_id=$1 ${cursorClause}
       ORDER BY m.created_at DESC
       LIMIT $2`,
      params
    )
    const hasMore = rows.length > limit
    const messages = hasMore ? rows.slice(0, -1) : rows
    const next_cursor = hasMore ? messages[messages.length - 1]?.id : null
    res.json({ data: messages.reverse(), meta: { next_cursor } })
  } catch (err) { next(err) }
})

// POST /messages/send
router.post('/send', async (req, res, next) => {
  try {
    const parsed = sendMessageSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message },
      })
    }
    const { thread_id, content } = parsed.data

    // Verify the requester is a participant in this thread
    const { rows: threadRows } = await query(
      `SELECT mt.*,
              cp_coach.user_id  AS coach_user_id,
              cp_client.user_id AS client_user_id
       FROM message_threads mt
       JOIN coach_profiles  cp_coach  ON cp_coach.id  = mt.coach_id
       JOIN client_profiles cp_client ON cp_client.id = mt.client_id
       WHERE mt.id=$1`,
      [thread_id]
    )
    if (!threadRows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Thread not found' } })
    const t = threadRows[0]
    if (t.coach_user_id !== req.user.id && t.client_user_id !== req.user.id) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a participant in this thread' } })
    }

    const { rows } = await query(
      `INSERT INTO messages (thread_id, sender_id, content) VALUES ($1,$2,$3) RETURNING *`,
      [thread_id, req.user.id, content]
    )
    res.status(201).json({ data: rows[0] })
  } catch (err) { next(err) }
})

export default router
