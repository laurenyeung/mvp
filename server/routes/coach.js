import { Router } from 'express'
import { query, transaction } from '../db/pool.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import {
  createTemplateSchema,
  updateTemplateSchema,
  assignWorkoutSchema,
  updateWorkoutSchema,
  uuidSchema,
} from '../middleware/validate.js'

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
               'prescribed_reps', wte.prescribed_reps, 'prescribed_rest_secs', wte.prescribed_rest_secs
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
               'primary_muscle_group', e.primary_muscle_group, 'order_index', wte.order_index,
               'prescribed_sets', wte.prescribed_sets, 'prescribed_reps', wte.prescribed_reps,
               'prescribed_weight', wte.prescribed_weight, 'prescribed_tempo', wte.prescribed_tempo,
               'prescribed_rest_secs', wte.prescribed_rest_secs, 'notes', wte.notes
             ) ORDER BY wte.order_index
           ) FILTER (WHERE wte.id IS NOT NULL), '[]'
         ) AS exercises
       FROM workout_templates wt
       LEFT JOIN workout_template_exercises wte ON wte.workout_template_id = wt.id
       LEFT JOIN exercises e ON e.id = wte.exercise_id
       WHERE wt.id=$1 AND wt.coach_id=$2 GROUP BY wt.id`,
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
    const { name, description, estimated_duration_minutes, exercises } = parsed.data

    const result = await transaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO workout_templates (coach_id, name, description, estimated_duration_minutes)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [coachId, name, description ?? null, estimated_duration_minutes ?? null]
      )
      const template = rows[0]
      for (const [i, ex] of exercises.entries()) {
        await client.query(
          `INSERT INTO workout_template_exercises
             (workout_template_id, exercise_id, order_index, prescribed_sets,
              prescribed_reps, prescribed_weight, prescribed_tempo, prescribed_rest_secs, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [template.id, ex.exercise_id, ex.order_index ?? i,
           ex.prescribed_sets ?? 3, ex.prescribed_reps ?? null,
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
    const { name, description, estimated_duration_minutes, exercises } = parsed.data

    const result = await transaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE workout_templates
         SET name=COALESCE($1,name), description=COALESCE($2,description),
             estimated_duration_minutes=COALESCE($3,estimated_duration_minutes), updated_at=NOW()
         WHERE id=$4 AND coach_id=$5 RETURNING *`,
        [name ?? null, description ?? null, estimated_duration_minutes ?? null, idParsed.data, coachId]
      )
      if (!rows.length) throw Object.assign(new Error('Template not found'), { status: 404, code: 'NOT_FOUND' })
      if (exercises !== undefined) {
        await client.query('DELETE FROM workout_template_exercises WHERE workout_template_id=$1', [idParsed.data])
        for (const [i, ex] of exercises.entries()) {
          await client.query(
            `INSERT INTO workout_template_exercises
               (workout_template_id, exercise_id, order_index, prescribed_sets,
                prescribed_reps, prescribed_weight, prescribed_tempo, prescribed_rest_secs, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [idParsed.data, ex.exercise_id, ex.order_index ?? i,
             ex.prescribed_sets ?? 3, ex.prescribed_reps ?? null,
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
//  WORKOUT ASSIGNMENT
// ════════════════════════════════════════════════════════

router.post('/workouts/assign', async (req, res, next) => {
  try {
    const parsed = assignWorkoutSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } })
    }
    const coachId = await getCoachProfileId(req.user.id)
    const { template_id, client_id, scheduled_date, name } = parsed.data

    const { rows: tmpl } = await query(
      'SELECT * FROM workout_templates WHERE id=$1 AND coach_id=$2', [template_id, coachId]
    )
    if (!tmpl.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Template not found' } })

    const { rows: tmplExercises } = await query(
      'SELECT * FROM workout_template_exercises WHERE workout_template_id=$1 ORDER BY order_index',
      [template_id]
    )

    const workout = await transaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO workouts (template_id, coach_id, client_id, name, scheduled_date)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [template_id, coachId, client_id, name ?? tmpl[0].name, scheduled_date]
      )
      const w = rows[0]
      for (const ex of tmplExercises) {
        await client.query(
          `INSERT INTO workout_exercises
             (workout_id, exercise_id, order_index, superset_group, prescribed_sets,
              prescribed_reps, prescribed_weight, prescribed_tempo, prescribed_rest_secs, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [w.id, ex.exercise_id, ex.order_index, ex.superset_group,
           ex.prescribed_sets, ex.prescribed_reps, ex.prescribed_weight,
           ex.prescribed_tempo, ex.prescribed_rest_secs, ex.notes]
        )
      }
      return w
    })
    res.status(201).json({ data: workout })
  } catch (err) { next(err) }
})

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
      `SELECT w.* FROM workouts w WHERE ${where} ORDER BY w.scheduled_date DESC`, params
    )
    res.json({ data: rows })
  } catch (err) { next(err) }
})

router.get('/clients', async (req, res, next) => {
  try {
    const coachId = await getCoachProfileId(req.user.id)
    const { rows } = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.profile_image_url,
              cp.id AS profile_id, cp.goals, cp.notes,
              COUNT(w.id) FILTER (WHERE w.status='SCHEDULED') AS upcoming_workouts
       FROM client_profiles cp
       JOIN users u ON u.id = cp.user_id
       LEFT JOIN workouts w ON w.client_id = cp.id
       WHERE cp.coach_id=$1
       GROUP BY u.id, cp.id ORDER BY u.first_name`,
      [coachId]
    )
    res.json({ data: rows })
  } catch (err) { next(err) }
})

router.get('/clients/:id', async (req, res, next) => {
  try {
    const idParsed = uuidSchema.safeParse(req.params.id)
    if (!idParsed.success) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Client not found' } })
    const coachId = await getCoachProfileId(req.user.id)
    const { rows } = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.profile_image_url,
              cp.id AS profile_id, cp.goals, cp.notes, cp.date_of_birth,
              cp.height_cm, cp.weight_kg
       FROM client_profiles cp
       JOIN users u ON u.id = cp.user_id
       WHERE cp.user_id=$1 AND cp.coach_id=$2`,
      [idParsed.data, coachId]
    )
    if (!rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Client not found' } })
    res.json({ data: rows[0] })
  } catch (err) { next(err) }
})

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
