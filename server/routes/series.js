import { Router } from 'express'
import { query, transaction } from '../db/pool.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { createSeriesSchema, updateSeriesSchema, uuidSchema, paginationSchema } from '../middleware/validate.js'
import { logger } from '../lib/logger.js'

const router = Router()
router.use(requireAuth)

// Resolves the coach_profiles.id whose Series a given user is allowed to see.
// COACH: their own coach_profiles.id. CLIENT: their coach's id, read straight
// off client_profiles.coach_id — roster-wide visibility, no assignment step.
async function resolveVisibleCoachId(user) {
  if (user.role === 'COACH') {
    const { rows } = await query('SELECT id FROM coach_profiles WHERE user_id=$1', [user.id])
    if (!rows.length) throw Object.assign(new Error('Coach profile not found'), { status: 404, code: 'NOT_FOUND' })
    return rows[0].id
  }
  if (user.role === 'CLIENT') {
    // A client not yet linked to a coach is a normal, expected state (same
    // convention client.js already uses for today/upcoming/past/workouts) —
    // not an error, just "sees no series yet." Callers must check for null.
    const { rows } = await query('SELECT coach_id FROM client_profiles WHERE user_id=$1', [user.id])
    return rows.length ? rows[0].coach_id : null
  }
  throw Object.assign(new Error('Forbidden'), { status: 403, code: 'FORBIDDEN' })
}

router.get('/', async (req, res, next) => {
  try {
    const coachId = await resolveVisibleCoachId(req.user)
    if (!coachId) return res.json({ data: [], total: 0 })

    const pagination = paginationSchema.safeParse(req.query)
    const { limit, page } = pagination.success ? pagination.data : { limit: 40, page: 1 }
    const offset = (page - 1) * limit

    const { rows: countRows } = await query(
      `SELECT COUNT(*) FROM series WHERE coach_id=$1 AND is_archived=false`,
      [coachId]
    )
    const total = Number(countRows[0].count)

    const { rows } = await query(
      `SELECT s.*,
         COALESCE(
           json_agg(
             json_build_object(
               'id', se.id, 'exercise_id', se.exercise_id, 'order_index', se.order_index,
               'name', e.name, 'description', e.description, 'youtube_url', e.youtube_url
             ) ORDER BY se.order_index
           ) FILTER (WHERE se.id IS NOT NULL), '[]'
         ) AS exercises
       FROM series s
       LEFT JOIN series_exercises se ON se.series_id = s.id
       LEFT JOIN exercises e ON e.id = se.exercise_id
       WHERE s.coach_id=$1 AND s.is_archived=false
       GROUP BY s.id ORDER BY s.created_at DESC
       LIMIT $2 OFFSET $3`,
      [coachId, limit, offset]
    )
    res.json({ data: rows, total })
  } catch (err) { next(err) }
})

router.get('/:id', async (req, res, next) => {
  try {
    const idParsed = uuidSchema.safeParse(req.params.id)
    if (!idParsed.success) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Series not found' } })
    const coachId = await resolveVisibleCoachId(req.user)
    if (!coachId) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Series not found' } })
    const { rows } = await query(
      `SELECT s.*,
         COALESCE(
           json_agg(
             json_build_object(
               'id', se.id, 'exercise_id', se.exercise_id, 'order_index', se.order_index,
               'name', e.name, 'description', e.description, 'youtube_url', e.youtube_url
             ) ORDER BY se.order_index
           ) FILTER (WHERE se.id IS NOT NULL), '[]'
         ) AS exercises
       FROM series s
       LEFT JOIN series_exercises se ON se.series_id = s.id
       LEFT JOIN exercises e ON e.id = se.exercise_id
       WHERE s.id=$1 AND s.coach_id=$2 AND s.is_archived=false GROUP BY s.id`,
      [idParsed.data, coachId]
    )
    if (!rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Series not found' } })
    res.json({ data: rows[0] })
  } catch (err) { next(err) }
})

router.post('/', requireRole('COACH', 'ADMIN'), async (req, res, next) => {
  try {
    const parsed = createSeriesSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } })
    }
    const coachId = await resolveVisibleCoachId(req.user)
    const { title, description, exercises } = parsed.data

    if (exercises.length > 0) {
      const ids = exercises.map(e => e.exercise_id)
      const { rows: validExs } = await query('SELECT id FROM exercises WHERE id = ANY($1::uuid[])', [ids])
      if (validExs.length !== new Set(ids).size) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'One or more exercise_ids are invalid' } })
      }
    }

    const result = await transaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO series (coach_id, title, description) VALUES ($1,$2,$3) RETURNING *`,
        [coachId, title, description ?? null]
      )
      const series = rows[0]
      for (const [i, ex] of exercises.entries()) {
        await client.query(
          `INSERT INTO series_exercises (series_id, exercise_id, order_index) VALUES ($1,$2,$3)`,
          [series.id, ex.exercise_id, ex.order_index ?? i]
        )
      }
      return series
    })
    logger.info('SERIES_CREATED', { seriesId: result.id, title, coachId, exerciseCount: exercises.length, requestId: req.id })
    res.status(201).json({ data: result })
  } catch (err) { next(err) }
})

router.put('/:id', requireRole('COACH', 'ADMIN'), async (req, res, next) => {
  try {
    const idParsed = uuidSchema.safeParse(req.params.id)
    if (!idParsed.success) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Series not found' } })
    const parsed = updateSeriesSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } })
    }
    const coachId = await resolveVisibleCoachId(req.user)
    const { title, description, exercises } = parsed.data

    const result = await transaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE series SET title=COALESCE($1,title), description=COALESCE($2,description), updated_at=NOW()
         WHERE id=$3 AND coach_id=$4 RETURNING *`,
        [title ?? null, description ?? null, idParsed.data, coachId]
      )
      if (!rows.length) throw Object.assign(new Error('Series not found'), { status: 404, code: 'NOT_FOUND' })
      if (exercises !== undefined) {
        if (exercises.length > 0) {
          const ids = exercises.map(e => e.exercise_id)
          const { rows: validExs } = await client.query('SELECT id FROM exercises WHERE id = ANY($1::uuid[])', [ids])
          if (validExs.length !== new Set(ids).size) {
            throw Object.assign(new Error('One or more exercise_ids are invalid'), { status: 400, code: 'VALIDATION_ERROR' })
          }
        }
        await client.query('DELETE FROM series_exercises WHERE series_id=$1', [idParsed.data])
        for (const [i, ex] of exercises.entries()) {
          await client.query(
            `INSERT INTO series_exercises (series_id, exercise_id, order_index) VALUES ($1,$2,$3)`,
            [idParsed.data, ex.exercise_id, ex.order_index ?? i]
          )
        }
      }
      return rows[0]
    })
    logger.info('SERIES_UPDATED', { seriesId: idParsed.data, coachId, requestId: req.id })
    res.json({ data: result })
  } catch (err) { next(err) }
})

router.delete('/:id', requireRole('COACH', 'ADMIN'), async (req, res, next) => {
  try {
    const idParsed = uuidSchema.safeParse(req.params.id)
    if (!idParsed.success) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Series not found' } })
    const coachId = await resolveVisibleCoachId(req.user)
    const { rowCount } = await query(`UPDATE series SET is_archived=true WHERE id=$1 AND coach_id=$2`, [idParsed.data, coachId])
    if (!rowCount) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Series not found' } })
    logger.info('SERIES_DELETED', { seriesId: idParsed.data, coachId, requestId: req.id })
    res.json({ data: { deleted: true } })
  } catch (err) { next(err) }
})

export default router
