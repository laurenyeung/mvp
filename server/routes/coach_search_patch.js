// GET /coach/clients/search?q=name_or_email
// Find registered CLIENT users not yet linked to this coach.
// Drives the "Add Client" modal dropdown in the UI.
// NOTE: must be defined BEFORE /clients/:id to avoid route conflict.
router.get('/clients/search', async (req, res, next) => {
  try {
    const coachId = await getCoachProfileId(req.user.id)
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : ''

    // Require at least 2 characters — prevents accidental full-table scans
    // and matches the frontend's minimum search length
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
         AND u.id NOT IN (
           SELECT cp.user_id FROM client_profiles cp WHERE cp.coach_id = $2
         )
       ORDER BY u.first_name, u.last_name
       LIMIT 10`,
      [`%${q}%`, coachId]
    )
    res.json({ data: rows })
  } catch (err) { next(err) }
})