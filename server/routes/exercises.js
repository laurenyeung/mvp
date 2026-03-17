import { Router } from 'express'
import { query } from '../db/pool.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import {
  createExerciseSchema,
  updateExerciseSchema,
  paginationSchema,
  uuidSchema,
} from '../middleware/validate.js'

const router = Router()
router.use(requireAuth)

// GET /exercises
router.get('/', async (req, res, next) => {
  try {
    // Clamp limit to 1–100 — prevents DoS via limit=9999999
    const pagination = paginationSchema.safeParse(req.query)
    const { limit, page } = pagination.success ? pagination.data : { limit: 40, page: 1 }
    const offset = (page - 1) * limit

    // Validate optional filter params
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : null
    const muscle = typeof req.query.muscle === 'string' ? req.query.muscle.trim().slice(0, 100) : null

    const params = [req.user.id]
    let where = `(is_public=true OR created_by=$1)`
    if (search) { params.push(`%${search}%`); where += ` AND name ILIKE $${params.length}` }
    if (muscle) { params.push(muscle);         where += ` AND primary_muscle_group=$${params.length}` }
    params.push(limit, offset)

    const { rows } = await query(
      `SELECT id, name, description, primary_muscle_group, secondary_muscle_groups,
              equipment_required, is_public, created_by, created_at
       FROM exercises
       WHERE ${where}
       ORDER BY name
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    )
    res.json({ data: rows })
  } catch (err) { next(err) }
})

// GET /exercises/:id
router.get('/:id', async (req, res, next) => {
  try {
    // Validate UUID format to prevent malformed DB queries
    const idParsed = uuidSchema.safeParse(req.params.id)
    if (!idParsed.success) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Exercise not found' } })

    const { rows } = await query('SELECT * FROM exercises WHERE id=$1', [idParsed.data])
    if (!rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Exercise not found' } })
    const media = await query('SELECT * FROM exercise_media WHERE exercise_id=$1', [idParsed.data])
    res.json({ data: { ...rows[0], media: media.rows } })
  } catch (err) { next(err) }
})

// POST /exercises — COACH or ADMIN only
router.post('/', requireRole('COACH', 'ADMIN'), async (req, res, next) => {
  try {
    const parsed = createExerciseSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message },
      })
    }
    const { name, description, primary_muscle_group, secondary_muscle_groups, equipment_required, is_public } = parsed.data

    const { rows } = await query(
      `INSERT INTO exercises
         (name, description, primary_muscle_group, secondary_muscle_groups,
          equipment_required, created_by, is_public)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, description ?? null, primary_muscle_group,
       secondary_muscle_groups ?? [], equipment_required ?? [],
       req.user.id, is_public]
    )
    res.status(201).json({ data: rows[0] })
  } catch (err) { next(err) }
})

// PATCH /exercises/:id — COACH (own) or ADMIN
router.patch('/:id', requireRole('COACH', 'ADMIN'), async (req, res, next) => {
  try {
    const idParsed = uuidSchema.safeParse(req.params.id)
    if (!idParsed.success) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } })

    const parsed = updateExerciseSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message },
      })
    }

    const { rows: existing } = await query('SELECT created_by FROM exercises WHERE id=$1', [idParsed.data])
    if (!existing.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } })
    if (req.user.role !== 'ADMIN' && existing[0].created_by !== req.user.id) {
      return res.status(403).json({ error: { code: 'NOT_YOUR_RESOURCE', message: 'Forbidden' } })
    }

    const { name, description, primary_muscle_group, is_public } = parsed.data
    const { rows } = await query(
      `UPDATE exercises
       SET name=COALESCE($1,name),
           description=COALESCE($2,description),
           primary_muscle_group=COALESCE($3,primary_muscle_group),
           is_public=COALESCE($4,is_public)
       WHERE id=$5 RETURNING *`,
      [name ?? null, description ?? null, primary_muscle_group ?? null, is_public ?? null, idParsed.data]
    )
    res.json({ data: rows[0] })
  } catch (err) { next(err) }
})

// DELETE /exercises/:id
router.delete('/:id', requireRole('COACH', 'ADMIN'), async (req, res, next) => {
  try {
    const idParsed = uuidSchema.safeParse(req.params.id)
    if (!idParsed.success) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } })

    const { rows: existing } = await query('SELECT created_by FROM exercises WHERE id=$1', [idParsed.data])
    if (!existing.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } })
    if (req.user.role !== 'ADMIN' && existing[0].created_by !== req.user.id) {
      return res.status(403).json({ error: { code: 'NOT_YOUR_RESOURCE', message: 'Forbidden' } })
    }

    await query('DELETE FROM exercises WHERE id=$1', [idParsed.data])
    res.json({ data: { deleted: true } })
  } catch (err) { next(err) }
})

export default router
