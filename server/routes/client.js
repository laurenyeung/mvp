import { Router } from 'express'
import { query, transaction } from '../db/pool.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import {
  workoutLogSchema,
  exerciseMediaSchema,
  progressSchema,
  uuidSchema,
  commentSchema,
} from '../middleware/validate.js'

const router = Router()
router.use(requireAuth, requireRole('CLIENT'))

async function getClientProfileId(userId) {
  const { rows } = await query('SELECT id FROM client_profiles WHERE user_id=$1', [userId])
  if (!rows.length) throw Object.assign(new Error('Client profile not found'), { status: 404, code: 'NOT_FOUND' })
  return rows[0].id
}

async function attachExercises(workouts) {
  if (!workouts.length) return workouts
  const ids = workouts.map(w => w.id)
  const { rows: exRows } = await query(
    `SELECT we.*, e.name, e.primary_muscle_group, e.description
     FROM workout_exercises we
     JOIN exercises e ON e.id = we.exercise_id
     WHERE we.workout_id = ANY($1::uuid[])
     ORDER BY we.order_index`,
    [ids]
  )
  const byWorkout = {}
  for (const ex of exRows) {
    if (!byWorkout[ex.workout_id]) byWorkout[ex.workout_id] = []
    byWorkout[ex.workout_id].push(ex)
  }
  return workouts.map(w => ({ ...w, exercises: byWorkout[w.id] || [] }))
}

// ─── GET /client/workouts/today ───────────────────────────────────────────────
router.get('/workouts/today', async (req, res, next) => {
  try {
    const clientId = await getClientProfileId(req.user.id)
    const today = new Date().toISOString().split('T')[0]
    const { rows } = await query(
      `SELECT * FROM workouts WHERE client_id=$1 AND scheduled_date=$2 LIMIT 1`,
      [clientId, today]
    )
    if (!rows.length) return res.json({ data: null })
    const [enriched] = await attachExercises(rows)
    res.json({ data: enriched })
  } catch (err) { next(err) }
})

// ─── GET /client/workouts/upcoming ───────────────────────────────────────────
router.get('/workouts/upcoming', async (req, res, next) => {
  try {
    const clientId = await getClientProfileId(req.user.id)
    const today = new Date().toISOString().split('T')[0]
    const { rows } = await query(
      `SELECT * FROM workouts
       WHERE client_id=$1 AND scheduled_date > $2 AND status='SCHEDULED'
       ORDER BY scheduled_date ASC LIMIT 20`,
      [clientId, today]
    )
    const enriched = await attachExercises(rows)
    res.json({ data: enriched })
  } catch (err) { next(err) }
})

// ─── GET /client/workouts/past ────────────────────────────────────────────────
router.get('/workouts/past', async (req, res, next) => {
  try {
    const clientId = await getClientProfileId(req.user.id)
    const today = new Date().toISOString().split('T')[0]
    const { rows } = await query(
      `SELECT * FROM workouts
       WHERE client_id=$1 AND (scheduled_date < $2 OR status IN ('COMPLETED','MISSED'))
       ORDER BY scheduled_date DESC LIMIT 40`,
      [clientId, today]
    )
    const enriched = await attachExercises(rows)
    res.json({ data: enriched })
  } catch (err) { next(err) }
})

// ─── GET /client/workouts ─────────────────────────────────────────────────────
router.get('/workouts', async (req, res, next) => {
  try {
    const clientId = await getClientProfileId(req.user.id)
    const ALLOWED_STATUSES = ['SCHEDULED', 'COMPLETED', 'MISSED']
    const status = ALLOWED_STATUSES.includes(req.query.status) ? req.query.status : null

    const params = [clientId]
    let where = 'client_id=$1'
    if (status) { params.push(status); where += ` AND status=$${params.length}` }

    const { rows } = await query(
      `SELECT * FROM workouts WHERE ${where} ORDER BY scheduled_date DESC`,
      params
    )
    const enriched = await attachExercises(rows)
    res.json({ data: enriched })
  } catch (err) { next(err) }
})

// ─── POST /client/workouts/:workoutId/log ─────────────────────────────────────
// Idempotent at the workout_log level (ON CONFLICT on workout_id).
// Each call inserts new exercise_logs + set_logs; caller controls what is sent.
// Pass exercise_logs: [] to update only workout-level fields without adding sets.
router.post('/workouts/:workoutId/log', async (req, res, next) => {
  try {
    const idParsed = uuidSchema.safeParse(req.params.workoutId)
    if (!idParsed.success) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workout not found' } })

    const parsed = workoutLogSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message },
      })
    }

    const clientId = await getClientProfileId(req.user.id)
    const { overall_notes, rating, exercise_logs } = parsed.data

    const { rows: wRows } = await query(
      `SELECT id FROM workouts WHERE id=$1 AND client_id=$2`,
      [idParsed.data, clientId]
    )
    if (!wRows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workout not found' } })

    const log = await transaction(async (client) => {
      // Upsert the workout log
      const { rows: logRows } = await client.query(
        `INSERT INTO workout_logs (workout_id, client_id, overall_notes, rating)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (workout_id) DO UPDATE
           SET overall_notes = EXCLUDED.overall_notes,
               rating        = EXCLUDED.rating,
               completed_at  = NOW()
         RETURNING *`,
        [idParsed.data, clientId, overall_notes ?? null, rating ?? null]
      )
      const workoutLog = logRows[0]

      for (const el of exercise_logs) {
        const { rows: elRows } = await client.query(
          `INSERT INTO exercise_logs
             (workout_log_id, workout_exercise_id, actual_sets, actual_reps,
              actual_weight, rpe, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING id`,
          [workoutLog.id, el.workout_exercise_id,
           el.actual_sets ?? null, el.actual_reps ?? null,
           el.actual_weight ?? null, el.rpe ?? null, el.notes ?? null]
        )
        const exerciseLogId = elRows[0].id

        // V2: insert per-set breakdown
        for (const s of (el.sets || [])) {
          await client.query(
            `INSERT INTO exercise_set_logs (exercise_log_id, set_index, reps, weight, rpe)
             VALUES ($1,$2,$3,$4,$5)`,
            [exerciseLogId, s.set_index, s.reps ?? null, s.weight ?? null, s.rpe ?? null]
          )
        }
      }

      await client.query(
        `UPDATE workouts SET status='COMPLETED' WHERE id=$1`, [idParsed.data]
      )

      // V2: activity + notification
      await client.query(
        `INSERT INTO activity (user_id, type, related_id) VALUES ($1,'WORKOUT_COMPLETED',$2)`,
        [req.user.id, idParsed.data]
      )

      // Notify the coach
      const { rows: coachRows } = await client.query(
        `SELECT w.coach_id, cp.user_id AS coach_user_id
         FROM workouts w JOIN coach_profiles cp ON cp.id = w.coach_id
         WHERE w.id=$1`, [idParsed.data]
      )
      if (coachRows.length) {
        await client.query(
          `INSERT INTO notifications (user_id, type, related_id) VALUES ($1,'WORKOUT_COMPLETED',$2)`,
          [coachRows[0].coach_user_id, idParsed.data]
        )
      }

      return workoutLog
    })
    res.status(201).json({ data: log })
  } catch (err) { next(err) }
})

// ─── POST /client/workouts/:workoutId/comments ────────────────────────────────
router.post('/workouts/:workoutId/comments', async (req, res, next) => {
  try {
    const idParsed = uuidSchema.safeParse(req.params.workoutId)
    if (!idParsed.success) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workout not found' } })

    const parsed = commentSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } })
    }

    const clientId = await getClientProfileId(req.user.id)
    const { rows: wRows } = await query(
      `SELECT id FROM workouts WHERE id=$1 AND client_id=$2`, [idParsed.data, clientId]
    )
    if (!wRows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workout not found' } })

    const { rows } = await query(
      `INSERT INTO workout_comments (workout_id, user_id, content) VALUES ($1,$2,$3) RETURNING *`,
      [idParsed.data, req.user.id, parsed.data.content]
    )
    res.status(201).json({ data: rows[0] })
  } catch (err) { next(err) }
})

// ─── GET /client/workouts/:workoutId/comments ─────────────────────────────────
router.get('/workouts/:workoutId/comments', async (req, res, next) => {
  try {
    const idParsed = uuidSchema.safeParse(req.params.workoutId)
    if (!idParsed.success) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workout not found' } })

    const clientId = await getClientProfileId(req.user.id)
    const { rows: wRows } = await query(
      `SELECT id FROM workouts WHERE id=$1 AND client_id=$2`, [idParsed.data, clientId]
    )
    if (!wRows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workout not found' } })

    const { rows } = await query(
      `SELECT wc.*, u.first_name, u.last_name, u.role
       FROM workout_comments wc JOIN users u ON u.id = wc.user_id
       WHERE wc.workout_id=$1 ORDER BY wc.created_at ASC`,
      [idParsed.data]
    )
    res.json({ data: rows })
  } catch (err) { next(err) }
})

// ─── POST /client/exercise-logs/:id/comments ─────────────────────────────────
router.post('/exercise-logs/:id/comments', async (req, res, next) => {
  try {
    const idParsed = uuidSchema.safeParse(req.params.id)
    if (!idParsed.success) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } })

    const parsed = commentSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } })
    }

    // Verify ownership via workout_log → workout → client_id
    const clientId = await getClientProfileId(req.user.id)
    const { rows: elRows } = await query(
      `SELECT el.id FROM exercise_logs el
       JOIN workout_logs wl ON wl.id = el.workout_log_id
       WHERE el.id=$1 AND wl.client_id=$2`,
      [idParsed.data, clientId]
    )
    if (!elRows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } })

    const { rows } = await query(
      `INSERT INTO exercise_comments (exercise_log_id, user_id, content) VALUES ($1,$2,$3) RETURNING *`,
      [idParsed.data, req.user.id, parsed.data.content]
    )
    res.status(201).json({ data: rows[0] })
  } catch (err) { next(err) }
})

// ─── POST /client/exercise-logs/:id/media ────────────────────────────────────
router.post('/exercise-logs/:id/media', async (req, res, next) => {
  try {
    const idParsed = uuidSchema.safeParse(req.params.id)
    if (!idParsed.success) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } })

    const parsed = exerciseMediaSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message },
      })
    }
    const { s3_key, thumbnail_key, mime_type, file_size_kb } = parsed.data

    const result = await transaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO media_uploads
           (uploaded_by, related_type, related_id, s3_key, thumbnail_key, mime_type, file_size_kb)
         VALUES ($1,'EXERCISE_LOG',$2,$3,$4,$5,$6) RETURNING *`,
        [req.user.id, idParsed.data, s3_key, thumbnail_key ?? null, mime_type, file_size_kb ?? null]
      )
      // V2: activity + notification
      await client.query(
        `INSERT INTO activity (user_id, type, related_id) VALUES ($1,'VIDEO_UPLOADED',$2)`,
        [req.user.id, rows[0].id]
      )
      // Notify coach
      const { rows: coachRows } = await client.query(
        `SELECT cp_coach.user_id AS coach_user_id
         FROM exercise_logs el
         JOIN workout_logs wl ON wl.id = el.workout_log_id
         JOIN workouts w ON w.id = wl.workout_id
         JOIN coach_profiles cp_coach ON cp_coach.id = w.coach_id
         WHERE el.id=$1`, [idParsed.data]
      )
      if (coachRows.length) {
        await client.query(
          `INSERT INTO notifications (user_id, type, related_id) VALUES ($1,'VIDEO_UPLOADED',$2)`,
          [coachRows[0].coach_user_id, rows[0].id]
        )
      }
      return rows[0]
    })
    res.status(201).json({ data: result })
  } catch (err) { next(err) }
})

// ─── GET /client/progress ─────────────────────────────────────────────────────
router.get('/progress', async (req, res, next) => {
  try {
    const clientId = await getClientProfileId(req.user.id)
    const ALLOWED_METRIC_TYPES = ['WEIGHT', 'BODY_FAT', 'WAIST', 'CUSTOM']
    const metric_type = ALLOWED_METRIC_TYPES.includes(req.query.metric_type) ? req.query.metric_type : null
    const dateRe = /^\d{4}-\d{2}-\d{2}$/
    const from = dateRe.test(req.query.from ?? '') ? req.query.from : null
    const to   = dateRe.test(req.query.to   ?? '') ? req.query.to   : null

    const params = [clientId]
    let where = 'client_id=$1'
    if (metric_type) { params.push(metric_type); where += ` AND metric_type=$${params.length}` }
    if (from)        { params.push(from);         where += ` AND recorded_at>=$${params.length}` }
    if (to)          { params.push(to);           where += ` AND recorded_at<=$${params.length}` }

    const { rows } = await query(
      `SELECT * FROM progress_metrics WHERE ${where} ORDER BY recorded_at DESC`, params
    )
    res.json({ data: rows })
  } catch (err) { next(err) }
})

// ─── POST /client/progress ────────────────────────────────────────────────────
router.post('/progress', async (req, res, next) => {
  try {
    const parsed = progressSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message },
      })
    }
    const clientId = await getClientProfileId(req.user.id)
    const { metric_type, metric_label, value, unit, recorded_at } = parsed.data
    const { rows } = await query(
      `INSERT INTO progress_metrics (client_id, metric_type, metric_label, value, unit, recorded_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [clientId, metric_type, metric_label ?? null, value, unit, recorded_at]
    )
    res.status(201).json({ data: rows[0] })
  } catch (err) { next(err) }
})

export default router
