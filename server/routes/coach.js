import { Router } from 'express'
import { query, transaction } from '../db/pool.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import {
  createTemplateSchema,
  updateTemplateSchema,
  assignWorkoutSchema,
  updateWorkoutSchema,
  uuidSchema,
  commentSchema,
  safeStr,
} from '../middleware/validate.js'
import { z } from 'zod'

const router = Router()
router.use(requireAuth, requireRole('COACH', 'ADMIN'))

async function getCoachProfileId(userId) {
  const { rows } = await query('SELECT id FROM coach_profiles WHERE user_id=$1', [userId])
  if (!rows.length) throw Object.assign(new Error('Coach profile not found'), { status: 404, code: 'NOT_FOUND' })
  return rows[0].id
}

// ════════════════════════════════════════════════════════
//  WORKOUT TEMPLATES
// ════════════════════════════════════════════════════════

router.get('/templates', async (req, res, next) => {
  try {
    const coachId = await getCoachProfileId(req.user.id)
    const { rows } = await query(
      `SELECT wt.*,
         COALESCE(
           json_agg(
             json_build_object(
               'id', wte.id, 'exercise_id', wte.exercise_id, 'name', e.name,
               'order_index', wte.order_index, 'prescribed_sets', wte.prescribed_sets,
               'prescribed_reps', wte.prescribed_reps, 'prescribed_rest_secs', wte.prescribed_rest_secs,
               'notes', wte.notes
             ) ORDER BY wte.order_index
           ) FILTER (WHERE wte.id IS NOT NULL), '[]'
         ) AS exercises
       FROM workout_templates wt
       LEFT JOIN workout_template_exercises wte ON wte.workout_template_id = wt.id
       LEFT JOIN exercises e ON e.id = wte.exercise_id
       WHERE wt.coach_id=$1 AND wt.is_archived=false
       GROUP BY wt.id ORDER BY wt.created_at DESC`,
      [coachId]
    )
    res.json({ data: rows })
  } catch (err) { next(err) }
})

router.get('/templates/:id', async (req, res, next) => {
  try {
    const idParsed = uuidSchema.safeParse(req.params.id)
    if (!idParsed.success) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Template not found' } })
    const coachId = await getCoachProfileId(req.user.id)
    const { rows } = await query(
      `SELECT wt.*,
         COALESCE(
           json_agg(
             json_build_object(
               'id', wte.id, 'exercise_id', wte.exercise_id, 'name', e.name,
               'order_index', wte.order_index,
               'prescribed_sets', wte.prescribed_sets, 'prescribed_reps', wte.prescribed_reps,
               'prescribed_weight', wte.prescribed_weight, 'prescribed_tempo', wte.prescribed_tempo,
               'prescribed_rest_secs', wte.prescribed_rest_secs, 'notes', wte.notes
             ) ORDER BY wte.order_index
           ) FILTER (WHERE wte.id IS NOT NULL), '[]'
         ) AS exercises
       FROM workout_templates wt
       LEFT JOIN workout_template_exercises wte ON wte.workout_template_id = wt.id
       LEFT JOIN exercises e ON e.id = wte.exercise_id
       WHERE wt.id=$1 AND wt.coach_id=$2 AND wt.is_archived=false GROUP BY wt.id`,
      [idParsed.data, coachId]
    )
    if (!rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Template not found' } })
    res.json({ data: rows[0] })
  } catch (err) { next(err) }
})

router.post('/templates', async (req, res, next) => {
  try {
    const parsed = createTemplateSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } })
    }
    const coachId = await getCoachProfileId(req.user.id)
    const { name, description, exercises } = parsed.data

    // Duplicate name check — scoped to this coach's non-archived templates
    const { rows: existing } = await query(
      `SELECT id FROM workout_templates WHERE coach_id=$1 AND name=$2 AND is_archived=false`,
      [coachId, name.trim()]
    )
    if (existing.length) {
      return res.status(409).json({ error: { code: 'CONFLICT', message: 'A template with that name already exists' } })
    }

    const result = await transaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO workout_templates (coach_id, name, description)
         VALUES ($1,$2,$3) RETURNING *`,
        [coachId, name, description ?? null]
      )
      const template = rows[0]
      for (const [i, ex] of exercises.entries()) {
        await client.query(
          `INSERT INTO workout_template_exercises
             (workout_template_id, exercise_id, order_index, prescribed_sets,
              prescribed_reps, prescribed_weight, prescribed_tempo, prescribed_rest_secs, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [template.id, ex.exercise_id, ex.order_index ?? i,
           ex.prescribed_sets ?? null, ex.prescribed_reps ?? null,
           ex.prescribed_weight ?? null, ex.prescribed_tempo ?? null,
           ex.prescribed_rest_secs ?? null, ex.notes ?? null]
        )
      }
      return template
    })
    res.status(201).json({ data: result })
  } catch (err) { next(err) }
})

router.put('/templates/:id', async (req, res, next) => {
  try {
    const idParsed = uuidSchema.safeParse(req.params.id)
    if (!idParsed.success) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Template not found' } })

    const parsed = updateTemplateSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } })
    }
    const coachId = await getCoachProfileId(req.user.id)
    const { name, description, exercises } = parsed.data

    const result = await transaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE workout_templates
         SET name=COALESCE($1,name), description=COALESCE($2,description), updated_at=NOW()
         WHERE id=$3 AND coach_id=$4 RETURNING *`,
        [name ?? null, description ?? null, idParsed.data, coachId]
      )
      if (!rows.length) throw Object.assign(new Error('Template not found'), { status: 404, code: 'NOT_FOUND' })
      if (exercises !== undefined) {
        // Validate all exercise_ids exist before mutating — prevents FK 500 and gives a clean 400
        if (exercises.length > 0) {
          const exerciseIds = exercises.map(ex => ex.exercise_id)
          const { rows: validExs } = await client.query(
            'SELECT id FROM exercises WHERE id = ANY($1::uuid[])',
            [exerciseIds]
          )
          if (validExs.length !== exerciseIds.length) {
            throw Object.assign(new Error('One or more exercise_ids are invalid'), { status: 400, code: 'VALIDATION_ERROR' })
          }
        }
        await client.query('DELETE FROM workout_template_exercises WHERE workout_template_id=$1', [idParsed.data])
        for (const [i, ex] of exercises.entries()) {
          await client.query(
            `INSERT INTO workout_template_exercises
               (workout_template_id, exercise_id, order_index, prescribed_sets,
                prescribed_reps, prescribed_weight, prescribed_tempo, prescribed_rest_secs, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [idParsed.data, ex.exercise_id, ex.order_index ?? i,
             ex.prescribed_sets ?? null, ex.prescribed_reps ?? null,
             ex.prescribed_weight ?? null, ex.prescribed_tempo ?? null,
             ex.prescribed_rest_secs ?? null, ex.notes ?? null]
          )
        }
      }
      return rows[0]
    })
    res.json({ data: result })
  } catch (err) { next(err) }
})

router.delete('/templates/:id', async (req, res, next) => {
  try {
    const idParsed = uuidSchema.safeParse(req.params.id)
    if (!idParsed.success) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Template not found' } })
    const coachId = await getCoachProfileId(req.user.id)
    await query(
      `UPDATE workout_templates SET is_archived=true WHERE id=$1 AND coach_id=$2`,
      [idParsed.data, coachId]
    )
    res.json({ data: { deleted: true } })
  } catch (err) { next(err) }
})

// ════════════════════════════════════════════════════════
//  CLIENTS
// ════════════════════════════════════════════════════════

// GET /coach/clients/search — NOTE: must be before /clients/:id
router.get('/clients/search', async (req, res, next) => {
  try {
    await getCoachProfileId(req.user.id)
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : ''
    if (q.length < 2) return res.json({ data: [] })

    const { rows } = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name
       FROM users u
       WHERE u.role = 'CLIENT'
         AND u.is_active = true
         AND (
           u.email      ILIKE $1
           OR u.first_name ILIKE $1
           OR u.last_name  ILIKE $1
           OR (u.first_name || ' ' || u.last_name) ILIKE $1
         )
         AND u.id NOT IN (SELECT cp.user_id FROM client_profiles cp)
       ORDER BY u.first_name, u.last_name
       LIMIT 10`,
      [`%${q}%`]
    )
    res.json({ data: rows })
  } catch (err) { next(err) }
})

// POST /coach/clients
router.post('/clients', async (req, res, next) => {
  try {
    const parsed = z.object({ user_id: uuidSchema }).safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'user_id must be a valid UUID' } })
    }
    const coachId = await getCoachProfileId(req.user.id)
    const { user_id } = parsed.data

    const { rows: userRows } = await query(
      `SELECT id FROM users WHERE id=$1 AND role='CLIENT' AND is_active=true`, [user_id]
    )
    if (!userRows.length) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Client user not found' } })
    }

    // Check if user is already linked to ANY coach (unique constraint on user_id)
    const { rows: anyProfile } = await query(
      `SELECT id, coach_id FROM client_profiles WHERE user_id=$1`, [user_id]
    )
    if (anyProfile.length) {
      return res.status(409).json({ error: { code: 'CONFLICT', message: 'Client is already linked to a coach' } })
    }

    const { rows: inserted } = await query(
      `INSERT INTO client_profiles (user_id, coach_id) VALUES ($1,$2) RETURNING id`,
      [user_id, coachId]
    )

    const { rows: full } = await query(
      `SELECT cp.id, u.id AS user_id, u.email, u.first_name, u.last_name,
              u.profile_image_url, cp.goals, cp.notes
       FROM client_profiles cp JOIN users u ON u.id = cp.user_id
       WHERE cp.id=$1`,
      [inserted[0].id]
    )
    res.status(201).json({ data: full[0] })
  } catch (err) { next(err) }
})

// GET /coach/clients
router.get('/clients', async (req, res, next) => {
  try {
    const coachId = await getCoachProfileId(req.user.id)
    const { rows } = await query(
      `SELECT cp.id, u.id AS user_id, u.email, u.first_name, u.last_name,
              u.profile_image_url, cp.goals, cp.notes,
              COUNT(w.id) FILTER (WHERE w.status='SCHEDULED') AS upcoming_workouts
       FROM client_profiles cp
       JOIN users u ON u.id = cp.user_id
       LEFT JOIN workouts w ON w.client_id = cp.id
       WHERE cp.coach_id=$1
       GROUP BY cp.id, u.id ORDER BY u.first_name`,
      [coachId]
    )
    res.json({ data: rows })
  } catch (err) { next(err) }
})

// GET /coach/clients/:id
router.get('/clients/:id', async (req, res, next) => {
  try {
    const idParsed = uuidSchema.safeParse(req.params.id)
    if (!idParsed.success) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Client not found' } })
    const coachId = await getCoachProfileId(req.user.id)
    const { rows } = await query(
      `SELECT cp.id, u.id AS user_id, u.email, u.first_name, u.last_name,
              u.profile_image_url, cp.goals, cp.notes,
              cp.date_of_birth, cp.height_cm, cp.weight_kg
       FROM client_profiles cp JOIN users u ON u.id = cp.user_id
       WHERE cp.id=$1 AND cp.coach_id=$2`,
      [idParsed.data, coachId]
    )
    if (!rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Client not found' } })
    res.json({ data: rows[0] })
  } catch (err) { next(err) }
})

// GET /coach/clients/:clientId/workouts
router.get('/clients/:clientId/workouts', async (req, res, next) => {
  try {
    const idParsed = uuidSchema.safeParse(req.params.clientId)
    if (!idParsed.success) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Client not found' } })
    const coachId = await getCoachProfileId(req.user.id)

    const ALLOWED_STATUSES = ['SCHEDULED', 'COMPLETED', 'MISSED']
    const status = ALLOWED_STATUSES.includes(req.query.status) ? req.query.status : null
    const dateRe = /^\d{4}-\d{2}-\d{2}$/
    const from = dateRe.test(req.query.from ?? '') ? req.query.from : null
    const to   = dateRe.test(req.query.to   ?? '') ? req.query.to   : null

    const params = [idParsed.data, coachId]
    let where = 'w.client_id=$1 AND w.coach_id=$2'
    if (status) { params.push(status); where += ` AND w.status=$${params.length}` }
    if (from)   { params.push(from);   where += ` AND w.scheduled_date>=$${params.length}` }
    if (to)     { params.push(to);     where += ` AND w.scheduled_date<=$${params.length}` }

    const { rows } = await query(
      `SELECT w.* FROM workouts w WHERE ${where} ORDER BY w.scheduled_date DESC`,
      params
    )
    res.json({ data: rows })
  } catch (err) { next(err) }
})

// ════════════════════════════════════════════════════════
//  WORKOUT COMMENTS (coach side)
// ════════════════════════════════════════════════════════

// POST /coach/workouts/:id/comments
router.post('/workouts/:id/comments', async (req, res, next) => {
  try {
    const idParsed = uuidSchema.safeParse(req.params.id)
    if (!idParsed.success) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workout not found' } })

    const parsed = commentSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } })
    }

    const coachId = await getCoachProfileId(req.user.id)
    // Verify this workout belongs to this coach
    const { rows: wRows } = await query(
      `SELECT w.id, cp_client.user_id AS client_user_id
       FROM workouts w JOIN client_profiles cp_client ON cp_client.id = w.client_id
       WHERE w.id=$1 AND w.coach_id=$2`,
      [idParsed.data, coachId]
    )
    if (!wRows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workout not found' } })

    const result = await transaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO workout_comments (workout_id, user_id, content) VALUES ($1,$2,$3) RETURNING *`,
        [idParsed.data, req.user.id, parsed.data.content]
      )
      // Notify client
      await client.query(
        `INSERT INTO notifications (user_id, type, related_id) VALUES ($1,'COMMENT_ADDED',$2)`,
        [wRows[0].client_user_id, rows[0].id]
      )
      await client.query(
        `INSERT INTO activity (user_id, type, related_id) VALUES ($1,'COMMENT_ADDED',$2)`,
        [req.user.id, rows[0].id]
      )
      return rows[0]
    })
    res.status(201).json({ data: result })
  } catch (err) { next(err) }
})

// GET /coach/workouts/:id/comments
router.get('/workouts/:id/comments', async (req, res, next) => {
  try {
    const idParsed = uuidSchema.safeParse(req.params.id)
    if (!idParsed.success) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workout not found' } })
    const coachId = await getCoachProfileId(req.user.id)

    const { rows: wRows } = await query(
      `SELECT id FROM workouts WHERE id=$1 AND coach_id=$2`, [idParsed.data, coachId]
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

// ════════════════════════════════════════════════════════
//  WORKOUT ASSIGNMENT
// ════════════════════════════════════════════════════════

router.post('/workouts/assign', async (req, res, next) => {
  try {
    const parsed = assignWorkoutSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } })
    }
    const coachId = await getCoachProfileId(req.user.id)
    const { template_id, client_id, scheduled_date, name, exercises: exerciseOverrides } = parsed.data

    const { rows: tmpl } = await query(
      'SELECT * FROM workout_templates WHERE id=$1 AND coach_id=$2 AND is_archived=false', [template_id, coachId]
    )
    if (!tmpl.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Template not found' } })

    // Use coach-provided overrides if supplied, otherwise fall back to template defaults
    let exercisesToInsert
    if (exerciseOverrides && exerciseOverrides.length > 0) {
      exercisesToInsert = exerciseOverrides.map((ex, i) => ({
        exercise_id: ex.exercise_id,
        order_index: ex.order_index ?? i,
        superset_group: null,
        prescribed_sets: ex.prescribed_sets ?? null,
        prescribed_reps: ex.prescribed_reps ?? null,
        prescribed_weight: ex.prescribed_weight ?? null,
        prescribed_tempo: ex.prescribed_tempo ?? null,
        prescribed_rest_secs: ex.prescribed_rest_secs ?? null,
        notes: ex.notes ?? null,
        log_weight: ex.log_weight ?? false,
      }))
    } else {
      const { rows: tmplExercises } = await query(
        'SELECT * FROM workout_template_exercises WHERE workout_template_id=$1 ORDER BY order_index',
        [template_id]
      )
      exercisesToInsert = tmplExercises
    }

    const { rows: clientUser } = await query(
      'SELECT user_id FROM client_profiles WHERE id=$1', [client_id]
    )
    if (!clientUser.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Client not found' } })
    const clientUserId = clientUser[0].user_id

    const workout = await transaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO workouts (template_id, coach_id, client_id, name, scheduled_date)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [template_id, coachId, client_id, name ?? tmpl[0].name, scheduled_date]
      )
      const w = rows[0]

      for (const ex of exercisesToInsert) {
        await client.query(
          `INSERT INTO workout_exercises
             (workout_id, exercise_id, order_index, superset_group, prescribed_sets,
              prescribed_reps, prescribed_weight, prescribed_tempo, prescribed_rest_secs, notes, log_weight)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [w.id, ex.exercise_id, ex.order_index, ex.superset_group,
           ex.prescribed_sets, ex.prescribed_reps, ex.prescribed_weight,
           ex.prescribed_tempo, ex.prescribed_rest_secs, ex.notes, ex.log_weight ?? false]
        )
      }

      await client.query(
        `INSERT INTO notifications (user_id, type, related_id) VALUES ($1,'WORKOUT_ASSIGNED',$2)`,
        [clientUserId, w.id]
      )

      return w
    })
    res.status(201).json({ data: workout })
  } catch (err) { next(err) }
})

// ── PATCH /coach/workout-exercises/:id ───────────────────────────────────────
const updateWorkoutExerciseSchema = z.object({
  prescribed_sets:      z.number().int().min(1).max(20).optional(),
  prescribed_reps:      safeStr(50).nullable().optional(),
  prescribed_weight:    safeStr(50).optional(),
  prescribed_tempo:     safeStr(20).optional(),
  prescribed_rest_secs: z.number().int().min(0).max(600).optional(),
  notes:                safeStr(500).nullable().optional(),
})

router.patch('/workout-exercises/:id', async (req, res, next) => {
  try {
    const idParsed = uuidSchema.safeParse(req.params.id)
    if (!idParsed.success) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } })

    const parsed = updateWorkoutExerciseSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } })
    }

    const coachId = await getCoachProfileId(req.user.id)
    const { rows: existing } = await query(
      `SELECT we.*, w.coach_id FROM workout_exercises we
       JOIN workouts w ON w.id = we.workout_id WHERE we.id=$1`,
      [idParsed.data]
    )
    if (!existing.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } })
    if (existing[0].coach_id !== coachId) {
      return res.status(403).json({ error: { code: 'NOT_YOUR_RESOURCE', message: 'Forbidden' } })
    }

    const { prescribed_sets, prescribed_reps, prescribed_weight, prescribed_tempo, prescribed_rest_secs, notes } = parsed.data
    const { rows } = await query(
      `UPDATE workout_exercises
       SET prescribed_sets      = COALESCE($1, prescribed_sets),
           prescribed_reps      = COALESCE($2, prescribed_reps),
           prescribed_weight    = COALESCE($3, prescribed_weight),
           prescribed_tempo     = COALESCE($4, prescribed_tempo),
           prescribed_rest_secs = COALESCE($5, prescribed_rest_secs),
           notes                = COALESCE($6, notes)
       WHERE id=$7 RETURNING *`,
      [prescribed_sets ?? null, prescribed_reps ?? null, prescribed_weight ?? null,
       prescribed_tempo ?? null, prescribed_rest_secs ?? null, notes ?? null, idParsed.data]
    )
    res.json({ data: rows[0] })
  } catch (err) { next(err) }
})

// ── PATCH /coach/workouts/:id ─────────────────────────────────────────────────
router.patch('/workouts/:id', async (req, res, next) => {
  try {
    const idParsed = uuidSchema.safeParse(req.params.id)
    if (!idParsed.success) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workout not found' } })

    const parsed = updateWorkoutSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } })
    }
    const coachId = await getCoachProfileId(req.user.id)
    const { scheduled_date, name, status } = parsed.data

    const { rows } = await query(
      `UPDATE workouts
       SET scheduled_date=COALESCE($1,scheduled_date),
           name=COALESCE($2,name),
           status=COALESCE($3,status)
       WHERE id=$4 AND coach_id=$5 RETURNING *`,
      [scheduled_date ?? null, name ?? null, status ?? null, idParsed.data, coachId]
    )
    if (!rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workout not found' } })
    res.json({ data: rows[0] })
  } catch (err) { next(err) }
})

// ── DELETE /coach/workouts/:id ────────────────────────────────────────────────
router.delete('/workouts/:id', async (req, res, next) => {
  try {
    const idParsed = uuidSchema.safeParse(req.params.id)
    if (!idParsed.success) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workout not found' } })
    const coachId = await getCoachProfileId(req.user.id)

    const { rows: existing } = await query(
      `SELECT w.status, wl.id AS log_id
       FROM workouts w
       LEFT JOIN workout_logs wl ON wl.workout_id = w.id
       WHERE w.id=$1 AND w.coach_id=$2`,
      [idParsed.data, coachId]
    )
    if (!existing.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workout not found' } })
    if (existing[0].status !== 'SCHEDULED')
      return res.status(409).json({ error: { code: 'CONFLICT', message: 'Can only delete SCHEDULED workouts' } })
    if (existing[0].log_id)
      return res.status(409).json({ error: { code: 'CONFLICT', message: 'Workout already has a log' } })

    await query('DELETE FROM workouts WHERE id=$1', [idParsed.data])
    res.json({ data: { deleted: true } })
  } catch (err) { next(err) }
})

export default router
