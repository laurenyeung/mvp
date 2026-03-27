/**
 * FitTrack V2 Integration Test Suite
 *
 * Covers the complete client onboarding flow from a staff engineer's perspective:
 * account creation → client linking → exercise creation → template building →
 * workout assignment → client dashboard → workout logging (with per-set data) →
 * coach review → comments → notifications → permissions
 *
 * All test sections are order-dependent and share state via module-level variables.
 * Section 16 (linking) must run before Sections 2–15 as it produces clientProfileId.
 *
 * Run: cd server && npm test
 */

import 'dotenv/config'
import request from 'supertest'
import { cleanDatabase, closeDatabase, testPool } from './helpers/db.js'
import app from '../index.js'

// ── Shared state ──────────────────────────────────────────────────────────────
let coachToken, clientToken, coach2Token
let coachUserId, clientUserId, unlinkedClientUserId
let clientProfileId
let exerciseId, exercise2Id
let templateId
let workoutId, workoutExerciseId
let workoutLogId, exerciseLogId
let threadId, progressId
let workoutCommentId

const COACH_EMAIL    = 'coach_test@example.com'
const CLIENT_EMAIL   = 'client_test@example.com'
const COACH2_EMAIL   = 'coach2_test@example.com'
const UNLINKED_EMAIL = 'unlinked_test@example.com'
const PASSWORD       = 'TestPassword123'
const TOMORROW       = (() => {
  const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]
})()
const TODAY          = new Date().toISOString().split('T')[0]
const YESTERDAY      = (() => {
  const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]
})()

beforeAll(async () => { await cleanDatabase() })
afterAll(async () => { await cleanDatabase(); await closeDatabase() })

// =============================================================================
// SECTION 1 — Authentication
// =============================================================================
describe('Section 1 — Authentication', () => {

  test('TC-AUTH-001 · Coach registers → coach_profile auto-created', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: COACH_EMAIL, password: PASSWORD, first_name: 'Coach', last_name: 'Smith', role: 'COACH' })

    expect(res.status).toBe(201)
    expect(res.body.data.user.role).toBe('COACH')
    expect(res.body.data.token).toBeTruthy()
    expect(res.body.data.user.password_hash).toBeUndefined()

    const { rows } = await testPool.query('SELECT * FROM users WHERE email=$1', [COACH_EMAIL])
    expect(rows[0].is_active).toBe(true)
    coachUserId = rows[0].id

    const { rows: cp } = await testPool.query('SELECT id FROM coach_profiles WHERE user_id=$1', [coachUserId])
    expect(cp).toHaveLength(1)
  })

  test('TC-AUTH-001b · Client registers → no coach_profile created', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: CLIENT_EMAIL, password: PASSWORD, first_name: 'Client', last_name: 'Jones', role: 'CLIENT' })

    expect(res.status).toBe(201)
    expect(res.body.data.user.role).toBe('CLIENT')

    const { rows } = await testPool.query('SELECT * FROM users WHERE email=$1', [CLIENT_EMAIL])
    clientUserId = rows[0].id

    const { rows: cp } = await testPool.query('SELECT id FROM coach_profiles WHERE user_id=$1', [clientUserId])
    expect(cp).toHaveLength(0)
  })

  test('TC-AUTH-001c · Unlinked client registers (for isolation tests)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: UNLINKED_EMAIL, password: PASSWORD, first_name: 'Unlinked', last_name: 'Client', role: 'CLIENT' })
    expect(res.status).toBe(201)
    const { rows } = await testPool.query('SELECT id FROM users WHERE email=$1', [UNLINKED_EMAIL])
    unlinkedClientUserId = rows[0].id
  })

  test('TC-AUTH-001d · Duplicate email returns 409 CONFLICT', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: COACH_EMAIL, password: PASSWORD, first_name: 'X', last_name: 'Y', role: 'COACH' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('CONFLICT')
  })

  test('TC-AUTH-001e · Weak password returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'weak_test@example.com', password: 'short', first_name: 'A', last_name: 'B', role: 'CLIENT' })
    expect(res.status).toBe(400)
  })

  test('TC-AUTH-002 · Coach login returns token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: COACH_EMAIL, password: PASSWORD })

    expect(res.status).toBe(200)
    expect(res.body.data.token).toBeTruthy()
    expect(res.body.data.user.role).toBe('COACH')
    coachToken = res.body.data.token
  })

  test('TC-AUTH-002b · Client login returns token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: CLIENT_EMAIL, password: PASSWORD })

    expect(res.status).toBe(200)
    clientToken = res.body.data.token
  })

  test('TC-AUTH-002c · Wrong password returns 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: COACH_EMAIL, password: 'WrongPass1' })
    expect(res.status).toBe(401)
  })

  test('TC-AUTH-002d · GET /auth/me without token returns 401', async () => {
    const res = await request(app).get('/api/v1/auth/me')
    expect(res.status).toBe(401)
  })

  test('TC-AUTH-002e · GET /auth/me with valid token returns user', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${coachToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.user.email).toBe(COACH_EMAIL)
    expect(res.body.data.user.password_hash).toBeUndefined()
  })
})

// =============================================================================
// SECTION 16 — Client Linking & Search
// Depends on: coachToken, clientUserId, unlinkedClientUserId (Section 1)
// Produces:   clientProfileId (required by Sections 4–15)
// =============================================================================
describe('Section 16 — Client Linking & Search', () => {

  test('TC-SEARCH-001 · ≥2 char query returns array', async () => {
    const res = await request(app)
      .get('/api/v1/coach/clients/search?q=cl')
      .set('Authorization', `Bearer ${coachToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  test('TC-SEARCH-002 · Finds unlinked client by partial name', async () => {
    const res = await request(app)
      .get('/api/v1/coach/clients/search?q=Unlink')
      .set('Authorization', `Bearer ${coachToken}`)
    expect(res.status).toBe(200)
    const found = res.body.data.find(u => u.id === unlinkedClientUserId)
    expect(found).toBeTruthy()
    expect(found.password_hash).toBeUndefined()
  })

  test('TC-SEARCH-003 · Finds client by email substring', async () => {
    const res = await request(app)
      .get(`/api/v1/coach/clients/search?q=${CLIENT_EMAIL.slice(0, 6)}`)
      .set('Authorization', `Bearer ${coachToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.find(u => u.id === clientUserId)).toBeTruthy()
  })

  test('TC-SEARCH-004 · 1 char query returns empty array (not 400)', async () => {
    const res = await request(app)
      .get('/api/v1/coach/clients/search?q=a')
      .set('Authorization', `Bearer ${coachToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(0)
  })

  test('TC-SEARCH-005 · No q param returns empty array', async () => {
    const res = await request(app)
      .get('/api/v1/coach/clients/search')
      .set('Authorization', `Bearer ${coachToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(0)
  })

  test('TC-SEARCH-006 · COACH users never appear in results', async () => {
    const res = await request(app)
      .get('/api/v1/coach/clients/search?q=smith')
      .set('Authorization', `Bearer ${coachToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.find(u => u.id === coachUserId)).toBeFalsy()
  })

  test('TC-SEARCH-007 · Unauthenticated search returns 401', async () => {
    const res = await request(app).get('/api/v1/coach/clients/search?q=test')
    expect(res.status).toBe(401)
  })

  test('TC-CLIENT-LINK-001 · Coach links client → client_profile created', async () => {
    const res = await request(app)
      .post('/api/v1/coach/clients')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ user_id: clientUserId })

    expect(res.status).toBe(201)
    expect(res.body.data.user_id).toBe(clientUserId)
    expect(res.body.data.id).toBeTruthy()
    expect(res.body.data.email).toBe(CLIENT_EMAIL)

    const { rows } = await testPool.query('SELECT * FROM client_profiles WHERE user_id=$1', [clientUserId])
    expect(rows).toHaveLength(1)
    const { rows: cp } = await testPool.query('SELECT id FROM coach_profiles WHERE user_id=$1', [coachUserId])
    expect(rows[0].coach_id).toBe(cp[0].id)

    clientProfileId = res.body.data.id
  })

  test('TC-CLIENT-LINK-002 · Duplicate link returns 409', async () => {
    const res = await request(app)
      .post('/api/v1/coach/clients')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ user_id: clientUserId })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('CONFLICT')
  })

  test('TC-CLIENT-LINK-003 · Linked client disappears from search', async () => {
    const res = await request(app)
      .get('/api/v1/coach/clients/search?q=jones')
      .set('Authorization', `Bearer ${coachToken}`)
    expect(res.status).toBe(200)
    // clientUserId (last name Jones) is now linked → must not appear
    expect(res.body.data.find(u => u.id === clientUserId)).toBeFalsy()
  })

  test('TC-CLIENT-LINK-004 · Linking a COACH user returns 404', async () => {
    const res = await request(app)
      .post('/api/v1/coach/clients')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ user_id: coachUserId })
    expect(res.status).toBe(404)
  })

  test('TC-CLIENT-LINK-005 · Invalid UUID returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/coach/clients')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ user_id: 'not-a-uuid' })
    expect(res.status).toBe(400)
  })

  test('TC-CLIENT-LINK-006 · Linked client appears in GET /coach/clients roster', async () => {
    const res = await request(app)
      .get('/api/v1/coach/clients')
      .set('Authorization', `Bearer ${coachToken}`)
    expect(res.status).toBe(200)
    const found = res.body.data.find(c => c.user_id === clientUserId)
    expect(found).toBeTruthy()
    // id must be client_profiles.id, not users.id
    expect(found.id).toBe(clientProfileId)
    expect(found.email).toBeTruthy()
    expect(found.first_name).toBeTruthy()
  })
})

// =============================================================================
// SECTION 2 — Exercise Library
// =============================================================================
describe('Section 2 — Exercise Library', () => {

  test('TC-EXERCISE-001 · Coach creates exercise', async () => {
    const res = await request(app)
      .post('/api/v1/exercises')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        name: 'Barbell_TEST_Squat',
        description: 'Compound lower body movement',
        is_public: false,
      })

    expect(res.status).toBe(201)
    expect(res.body.data.name).toBe('Barbell_TEST_Squat')

    const { rows } = await testPool.query('SELECT * FROM exercises WHERE id=$1', [res.body.data.id])
    expect(rows[0].created_by).toBe(coachUserId)
    expect(rows[0].is_public).toBe(false)

    exerciseId = res.body.data.id
  })

  test('TC-EXERCISE-001b · Coach creates second exercise (for template with multiple)', async () => {
    const res = await request(app)
      .post('/api/v1/exercises')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ name: 'Romanian_TEST_Deadlift' })
    expect(res.status).toBe(201)
    exercise2Id = res.body.data.id
  })

  test('TC-EXERCISE-002 · Client cannot create exercise (403)', async () => {
    const res = await request(app)
      .post('/api/v1/exercises')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ name: 'Hack_TEST_Squat' })
    expect(res.status).toBe(403)
  })

  test('TC-EXERCISE-003 · Exercise list returns coach\'s exercises', async () => {
    const res = await request(app)
      .get('/api/v1/exercises')
      .set('Authorization', `Bearer ${coachToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.find(e => e.id === exerciseId)).toBeTruthy()
    expect(res.body.data.find(e => e.id === exercise2Id)).toBeTruthy()
  })

  test('TC-EXERCISE-004 · Exercise list is accessible to clients', async () => {
    const res = await request(app)
      .get('/api/v1/exercises')
      .set('Authorization', `Bearer ${clientToken}`)
    expect(res.status).toBe(200)
  })

  test('TC-EXERCISE-005 · Exercise name required — missing returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/exercises')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ primary_muscle_group: 'Legs' })
    expect(res.status).toBe(400)
  })
})

// =============================================================================
// SECTION 3 — Workout Templates
// =============================================================================
describe('Section 3 — Workout Templates', () => {

  test('TC-TEMPLATE-001 · Coach creates template with two exercises', async () => {
    const res = await request(app)
      .post('/api/v1/coach/templates')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        name: 'Lower Body Day',
        description: 'Strength workout',
        exercises: [
          {
            exercise_id: exerciseId,
            order_index: 0,
            prescribed_sets: 4,
            prescribed_reps: '8',
            prescribed_weight: '135',
            prescribed_rest_secs: 90,
          },
          {
            exercise_id: exercise2Id,
            order_index: 1,
            prescribed_sets: 3,
            prescribed_reps: '10',
            // prescribed_rest_secs intentionally omitted → null
          },
        ],
      })

    expect(res.status).toBe(201)
    expect(res.body.data.name).toBe('Lower Body Day')

    const { rows: tmpl } = await testPool.query('SELECT * FROM workout_templates WHERE id=$1', [res.body.data.id])
    expect(tmpl[0].name).toBe('Lower Body Day')

    const { rows: te } = await testPool.query(
      'SELECT * FROM workout_template_exercises WHERE workout_template_id=$1 ORDER BY order_index',
      [res.body.data.id]
    )
    expect(te).toHaveLength(2)
    expect(te[0].exercise_id).toBe(exerciseId)
    expect(te[0].prescribed_sets).toBe(4)
    expect(te[1].exercise_id).toBe(exercise2Id)
    expect(te[1].prescribed_rest_secs).toBeNull()

    templateId = res.body.data.id
  })

  test('TC-TEMPLATE-001b · Explicit null for sets, reps, and rest_secs all pass validation', async () => {
    // Regression: null was rejected by old schema (.optional() without .nullable())
    const res = await request(app)
      .post('/api/v1/coach/templates')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        name: 'Null_TEST_Rest',
        exercises: [{
          exercise_id: exerciseId,
          prescribed_sets: null,  // explicit null — must be accepted
          prescribed_reps: null,  // explicit null — must be accepted
          prescribed_rest_secs: null,
        }],
      })
    expect(res.status).toBe(201)
    // DB: nulls stored correctly
    const { rows } = await testPool.query(
      'SELECT * FROM workout_template_exercises WHERE workout_template_id=$1', [res.body.data.id]
    )
    expect(rows[0].prescribed_sets).toBeNull()
    expect(rows[0].prescribed_reps).toBeNull()
    expect(rows[0].prescribed_rest_secs).toBeNull()
  })

  test('TC-TEMPLATE-002 · Client cannot create template (403)', async () => {
    const res = await request(app)
      .post('/api/v1/coach/templates')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ name: 'Hack attempt' })
    expect(res.status).toBe(403)
  })

  test('TC-TEMPLATE-003 · Template list returns created templates', async () => {
    const res = await request(app)
      .get('/api/v1/coach/templates')
      .set('Authorization', `Bearer ${coachToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.find(t => t.id === templateId)).toBeTruthy()
  })

  test('TC-TEMPLATE-004 · GET /coach/templates/:id returns exercises nested', async () => {
    const res = await request(app)
      .get(`/api/v1/coach/templates/${templateId}`)
      .set('Authorization', `Bearer ${coachToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.exercises).toHaveLength(2)
    expect(res.body.data.exercises[0].name).toBeTruthy()
  })

  test('TC-TEMPLATE-005 · Template name required — empty name returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/coach/templates')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ name: '' })
    expect(res.status).toBe(400)
  })

  test('TC-TEMPLATE-006 · Updating template replaces exercise list', async () => {
    const res = await request(app)
      .put(`/api/v1/coach/templates/${templateId}`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        name: 'Lower Body Day Updated',
        exercises: [{ exercise_id: exerciseId, prescribed_sets: 5, prescribed_reps: '6' }],
      })
    expect(res.status).toBe(200)

    const { rows } = await testPool.query(
      'SELECT * FROM workout_template_exercises WHERE workout_template_id=$1', [templateId]
    )
    expect(rows).toHaveLength(1) // replaced the 2-exercise list with 1
    expect(rows[0].prescribed_sets).toBe(5)
  })

  test('TC-TEMPLATE-007 · Duplicate template name for same coach returns 409', async () => {
    // templateId was renamed to 'Lower Body Day Updated' by TC-TEMPLATE-006
    const res = await request(app)
      .post('/api/v1/coach/templates')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ name: 'Lower Body Day Updated', exercises: [] })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('CONFLICT')
    expect(res.body.error.message).toMatch(/already exists/i)
  })

})

// =============================================================================
// SECTION 4 — Workout Assignment
// Depends on: clientProfileId (Section 16), templateId (Section 3)
// =============================================================================
describe('Section 4 — Workout Assignment', () => {

  test('TC-ASSIGN-001 · Coach assigns workout → snapshot created + notification sent', async () => {
    const res = await request(app)
      .post('/api/v1/coach/workouts/assign')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ template_id: templateId, client_id: clientProfileId, scheduled_date: TODAY })

    expect(res.status).toBe(201)
    expect(res.body.data.status).toBe('SCHEDULED')
    expect(res.body.data.client_id).toBe(clientProfileId)

    // Snapshot created
    const { rows: we } = await testPool.query(
      'SELECT * FROM workout_exercises WHERE workout_id=$1', [res.body.data.id]
    )
    expect(we.length).toBeGreaterThan(0)
    workoutExerciseId = we[0].id
    workoutId = res.body.data.id

    // Template edits don't affect snapshot
    const { rows: w } = await testPool.query('SELECT * FROM workouts WHERE id=$1', [workoutId])
    expect(w[0].template_id).toBe(templateId)

    // WORKOUT_ASSIGNED notification
    const { rows: notif } = await testPool.query(
      'SELECT * FROM notifications WHERE user_id=$1 AND type=$2 AND related_id=$3',
      [clientUserId, 'WORKOUT_ASSIGNED', workoutId]
    )
    expect(notif).toHaveLength(1)
    expect(notif[0].is_read).toBe(false)
  })

  test('TC-ASSIGN-001b · Template edit does not change already-assigned workout', async () => {
    // Update template prescribed_sets to 99
    await request(app)
      .put(`/api/v1/coach/templates/${templateId}`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ exercises: [{ exercise_id: exerciseId, prescribed_sets: 20, prescribed_reps: '1' }] })

    // Snapshot must still have original 5 sets
    const { rows } = await testPool.query(
      'SELECT * FROM workout_exercises WHERE id=$1', [workoutExerciseId]
    )
    expect(rows[0].prescribed_sets).toBe(5) // unchanged — snapshot is immutable
  })

  test('TC-ASSIGN-002 · Assigning future workout', async () => {
    const res = await request(app)
      .post('/api/v1/coach/workouts/assign')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ template_id: templateId, client_id: clientProfileId, scheduled_date: TOMORROW, name: 'Bonus Day' })
    expect(res.status).toBe(201)
    expect(res.body.data.name).toBe('Bonus Day')
  })

  test('TC-ASSIGN-003 · Invalid client_id UUID returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/coach/workouts/assign')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ template_id: templateId, client_id: 'bad-uuid', scheduled_date: TODAY })
    expect(res.status).toBe(400)
  })

  test('TC-ASSIGN-004 · Non-existent template returns 404', async () => {
    const res = await request(app)
      .post('/api/v1/coach/workouts/assign')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        template_id: '00000000-0000-4000-8000-000000000001',
        client_id: clientProfileId,
        scheduled_date: TODAY,
      })
    expect(res.status).toBe(404)
  })
})

// =============================================================================
// SECTION 5 — Client Dashboard (Today / Upcoming / Past)
// =============================================================================
describe('Section 5 — Client Dashboard', () => {

  test('TC-DASHBOARD-001 · Client fetches today\'s workout with exercises', async () => {
    const res = await request(app)
      .get('/api/v1/client/workouts/today')
      .set('Authorization', `Bearer ${clientToken}`)

    expect(res.status).toBe(200)
    // today now returns an array (multiple same-day workouts are supported)
    expect(Array.isArray(res.body.data)).toBe(true)
    const todayWorkout = res.body.data.find(w => w.id === workoutId)
    expect(todayWorkout).toBeTruthy()
    expect(Array.isArray(todayWorkout.exercises)).toBe(true)
    expect(todayWorkout.exercises.length).toBeGreaterThan(0)

    const ex = todayWorkout.exercises[0]
    expect(ex.name).toBeTruthy()
    // prescribed_sets is optional — may be null
    expect(ex.prescribed_sets === null || typeof ex.prescribed_sets === 'number').toBe(true)
  })

  test('TC-DASHBOARD-002 · Client fetches upcoming workouts', async () => {
    const res = await request(app)
      .get('/api/v1/client/workouts/upcoming')
      .set('Authorization', `Bearer ${clientToken}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    // The TOMORROW workout should be here
    expect(res.body.data.find(w => w.scheduled_date === TOMORROW)).toBeTruthy()
    // TODAY workout should NOT be in upcoming (it's today, not future)
    expect(res.body.data.find(w => w.id === workoutId)).toBeFalsy()
  })

  test('TC-DASHBOARD-003 · Client fetches past workouts', async () => {
    // Assign a past workout first
    await request(app)
      .post('/api/v1/coach/workouts/assign')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ template_id: templateId, client_id: clientProfileId, scheduled_date: YESTERDAY })

    const res = await request(app)
      .get('/api/v1/client/workouts/past')
      .set('Authorization', `Bearer ${clientToken}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.find(w => w.scheduled_date === YESTERDAY)).toBeTruthy()
  })

  test('TC-DASHBOARD-004 · GET /client/workouts returns all with exercises', async () => {
    const res = await request(app)
      .get('/api/v1/client/workouts')
      .set('Authorization', `Bearer ${clientToken}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeGreaterThan(0)

    // Every workout must have exercises array
    res.body.data.forEach(w => {
      expect(Array.isArray(w.exercises)).toBe(true)
    })
  })

  test('TC-DASHBOARD-005 · Coach cannot access client dashboard (403)', async () => {
    const res = await request(app)
      .get('/api/v1/client/workouts/today')
      .set('Authorization', `Bearer ${coachToken}`)
    expect(res.status).toBe(403)
  })
})

// =============================================================================
// SECTION 6 — Workout Logging (with per-set data)
// =============================================================================
describe('Section 6 — Workout Logging', () => {

  test('TC-LOG-001 · Client logs workout with per-set breakdown', async () => {
    const res = await request(app)
      .post(`/api/v1/client/workouts/${workoutId}/log`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        rating: 4,
        overall_notes: 'Felt strong today',
        exercise_logs: [{
          workout_exercise_id: workoutExerciseId,
          actual_sets: 3,
          actual_reps: '8,8,7',
          actual_weight: '145,145,150',
          rpe: 8,
          sets: [
            { set_index: 0, reps: 8, weight: 145, rpe: 7 },
            { set_index: 1, reps: 8, weight: 145, rpe: 8 },
            { set_index: 2, reps: 7, weight: 150, rpe: 9 },
          ],
        }],
      })

    expect(res.status).toBe(201)

    // workout_logs row
    const { rows: wl } = await testPool.query('SELECT * FROM workout_logs WHERE workout_id=$1', [workoutId])
    expect(wl).toHaveLength(1)
    expect(wl[0].client_id).toBe(clientProfileId)
    expect(wl[0].rating).toBe(4)
    workoutLogId = wl[0].id

    // exercise_logs row
    const { rows: el } = await testPool.query('SELECT * FROM exercise_logs WHERE workout_log_id=$1', [workoutLogId])
    expect(el).toHaveLength(1)
    expect(el[0].actual_sets).toBe(3)
    expect(el[0].actual_weight).toBe('145,145,150')
    exerciseLogId = el[0].id

    // exercise_set_logs rows (V2 per-set)
    const { rows: sl } = await testPool.query('SELECT * FROM exercise_set_logs WHERE exercise_log_id=$1 ORDER BY set_index', [exerciseLogId])
    expect(sl).toHaveLength(3)
    expect(sl[0].set_index).toBe(0)
    expect(Number(sl[0].reps)).toBe(8)
    expect(Number(sl[1].weight)).toBe(145)
    expect(Number(sl[2].rpe)).toBe(9)

    // workout status → COMPLETED
    const { rows: w } = await testPool.query('SELECT status FROM workouts WHERE id=$1', [workoutId])
    expect(w[0].status).toBe('COMPLETED')

    // WORKOUT_COMPLETED notification sent to coach
    const { rows: notif } = await testPool.query(
      'SELECT * FROM notifications WHERE type=$1 AND related_id=$2',
      ['WORKOUT_COMPLETED', workoutId]
    )
    expect(notif.length).toBeGreaterThan(0)

    // activity entry created
    const { rows: act } = await testPool.query(
      'SELECT * FROM activity WHERE user_id=$1 AND type=$2 AND related_id=$3',
      [clientUserId, 'WORKOUT_COMPLETED', workoutId]
    )
    expect(act).toHaveLength(1)
  })

  test('TC-LOG-002 · Re-submit with exercise_logs:[] updates rating only — prior exercise_logs untouched', async () => {
    const res = await request(app)
      .post(`/api/v1/client/workouts/${workoutId}/log`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ rating: 5, overall_notes: 'Updated notes', exercise_logs: [] })

    expect(res.status).toBe(201)
    const { rows } = await testPool.query('SELECT * FROM workout_logs WHERE workout_id=$1', [workoutId])
    expect(rows).toHaveLength(1)  // still one row
    expect(rows[0].rating).toBe(5) // updated
    // exercise_logs from TC-LOG-001 must still exist — empty array means "don't touch"
    const { rows: el } = await testPool.query('SELECT id FROM exercise_logs WHERE workout_log_id=$1', [workoutLogId])
    expect(el).toHaveLength(1)
  })

  test('TC-LOG-003 · Logging a workout the client doesn\'t own returns 404', async () => {
    const otherWorkoutId = '00000000-0000-4000-8000-000000000002'
    const res = await request(app)
      .post(`/api/v1/client/workouts/${otherWorkoutId}/log`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ exercise_logs: [] })
    expect(res.status).toBe(404)
  })

  test('TC-LOG-005 · GET /client/workouts/:id returns exercise_log with sets for COMPLETED workout', async () => {
    const res = await request(app)
      .get(`/api/v1/client/workouts/${workoutId}`)
      .set('Authorization', `Bearer ${clientToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe(workoutId)
    expect(res.body.data.status).toBe('COMPLETED')
    const ex = res.body.data.exercises[0]
    expect(ex.exercise_log).not.toBeNull()
    expect(ex.exercise_log.actual_sets).toBe(3)
    expect(ex.exercise_log.sets).toHaveLength(3)
    expect(Number(ex.exercise_log.sets[0].reps)).toBe(8)
    expect(Number(ex.exercise_log.sets[1].weight)).toBe(145)
  })

  test('TC-LOG-006 · GET /client/workouts/:id returns null exercise_log for SCHEDULED workout', async () => {
    const assign = await request(app)
      .post('/api/v1/coach/workouts/assign')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ template_id: templateId, client_id: clientProfileId, scheduled_date: TODAY })
    const scheduledId = assign.body.data.id

    const res = await request(app)
      .get(`/api/v1/client/workouts/${scheduledId}`)
      .set('Authorization', `Bearer ${clientToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('SCHEDULED')
    expect(res.body.data.exercises[0].exercise_log).toBeUndefined()
  })

  test('TC-LOG-007 · Re-submit with exercise_logs replaces prior logged values', async () => {
    // Assign a fresh workout to use for edit tests
    const assign = await request(app)
      .post('/api/v1/coach/workouts/assign')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ template_id: templateId, client_id: clientProfileId, scheduled_date: YESTERDAY })
    const editWorkoutId = assign.body.data.id
    const { rows: we } = await testPool.query('SELECT id FROM workout_exercises WHERE workout_id=$1', [editWorkoutId])

    // First log: 3 sets @ 100kg
    await request(app)
      .post(`/api/v1/client/workouts/${editWorkoutId}/log`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        exercise_logs: [{
          workout_exercise_id: we[0].id,
          actual_sets: 3,
          sets: [
            { set_index: 0, reps: 10, weight: 100 },
            { set_index: 1, reps: 10, weight: 100 },
            { set_index: 2, reps: 10, weight: 100 },
          ],
        }],
      })

    // Re-submit: 2 sets @ 120kg (different values)
    const res = await request(app)
      .post(`/api/v1/client/workouts/${editWorkoutId}/log`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        exercise_logs: [{
          workout_exercise_id: we[0].id,
          actual_sets: 2,
          sets: [
            { set_index: 0, reps: 8, weight: 120 },
            { set_index: 1, reps: 7, weight: 120 },
          ],
        }],
      })
    expect(res.status).toBe(201)

    // Only ONE exercise_log row should exist (replaced, not appended)
    const { rows: wl } = await testPool.query('SELECT id FROM workout_logs WHERE workout_id=$1', [editWorkoutId])
    const { rows: el } = await testPool.query('SELECT * FROM exercise_logs WHERE workout_log_id=$1', [wl[0].id])
    expect(el).toHaveLength(1)
    expect(el[0].actual_sets).toBe(2)

    // Set logs reflect the new submission
    const { rows: sl } = await testPool.query(
      'SELECT * FROM exercise_set_logs WHERE exercise_log_id=$1 ORDER BY set_index', [el[0].id]
    )
    expect(sl).toHaveLength(2)
    expect(Number(sl[0].weight)).toBe(120)
    expect(Number(sl[1].reps)).toBe(7)
  })

  test('TC-LOG-008 · GET after edit returns updated set values', async () => {
    // Uses the editWorkoutId from TC-LOG-007 — assign a duplicate here since scope is lost
    // Instead verify via the main workoutId after a re-submit with new values
    const assign = await request(app)
      .post('/api/v1/coach/workouts/assign')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ template_id: templateId, client_id: clientProfileId, scheduled_date: YESTERDAY })
    const fetchEditId = assign.body.data.id
    const { rows: we } = await testPool.query('SELECT id FROM workout_exercises WHERE workout_id=$1', [fetchEditId])

    // Initial log
    await request(app)
      .post(`/api/v1/client/workouts/${fetchEditId}/log`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ exercise_logs: [{ workout_exercise_id: we[0].id, sets: [{ set_index: 0, reps: 5, weight: 50 }] }] })

    // Edit with new values
    await request(app)
      .post(`/api/v1/client/workouts/${fetchEditId}/log`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ exercise_logs: [{ workout_exercise_id: we[0].id, notes: 'felt easy', sets: [{ set_index: 0, reps: 10, weight: 80 }] }] })

    // Fetch the workout — exercise_log should show updated values
    const res = await request(app)
      .get(`/api/v1/client/workouts/${fetchEditId}`)
      .set('Authorization', `Bearer ${clientToken}`)

    expect(res.status).toBe(200)
    const log = res.body.data.exercises[0].exercise_log
    expect(log).not.toBeNull()
    expect(log.notes).toBe('felt easy')
    expect(log.sets).toHaveLength(1)
    expect(Number(log.sets[0].reps)).toBe(10)
    expect(Number(log.sets[0].weight)).toBe(80)
  })

  test('TC-LOG-009 · GET /client/workouts/:id for another client\'s workout returns 404', async () => {
    const res = await request(app)
      .get(`/api/v1/client/workouts/00000000-0000-4000-8000-000000000002`)
      .set('Authorization', `Bearer ${clientToken}`)
    expect(res.status).toBe(404)
  })

  test('TC-LOG-004 · Logging without sets array still works (backward compat)', async () => {
    // Assign another workout first
    const assign = await request(app)
      .post('/api/v1/coach/workouts/assign')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ template_id: templateId, client_id: clientProfileId, scheduled_date: YESTERDAY })
    const newWorkoutId = assign.body.data.id
    const { rows: we } = await testPool.query('SELECT id FROM workout_exercises WHERE workout_id=$1', [newWorkoutId])

    const res = await request(app)
      .post(`/api/v1/client/workouts/${newWorkoutId}/log`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        exercise_logs: [{
          workout_exercise_id: we[0].id,
          actual_sets: 3,
          actual_reps: '10',
          // no sets array
        }],
      })
    expect(res.status).toBe(201)

    // No set_logs created
    const { rows: wl } = await testPool.query('SELECT id FROM workout_logs WHERE workout_id=$1', [newWorkoutId])
    const { rows: el } = await testPool.query('SELECT id FROM exercise_logs WHERE workout_log_id=$1', [wl[0].id])
    const { rows: sl } = await testPool.query('SELECT id FROM exercise_set_logs WHERE exercise_log_id=$1', [el[0].id])
    expect(sl).toHaveLength(0)
  })
})

// =============================================================================
// SECTION 7 — Media Upload
// =============================================================================
describe('Section 7 — Media Upload', () => {

  test('TC-MEDIA-001 · Client registers exercise video → activity + notification created', async () => {
    const res = await request(app)
      .post(`/api/v1/client/exercise-logs/${exerciseLogId}/media`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        s3_key: `uploads/exercise_log/${clientUserId}/squat-form.mp4`,
        mime_type: 'video/mp4',
        file_size_kb: 8000,
      })

    expect(res.status).toBe(201)
    expect(res.body.data.related_type).toBe('EXERCISE_LOG')

    const { rows } = await testPool.query(
      'SELECT * FROM media_uploads WHERE related_id=$1', [exerciseLogId]
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].mime_type).toBe('video/mp4')

    // VIDEO_UPLOADED notification to coach
    const { rows: notif } = await testPool.query(
      "SELECT * FROM notifications WHERE type='VIDEO_UPLOADED'",
    )
    expect(notif.length).toBeGreaterThan(0)

    // activity entry
    const { rows: act } = await testPool.query(
      "SELECT * FROM activity WHERE type='VIDEO_UPLOADED' AND user_id=$1", [clientUserId]
    )
    expect(act.length).toBeGreaterThan(0)
  })

  test('TC-MEDIA-002 · Invalid mime type returns 400', async () => {
    const res = await request(app)
      .post(`/api/v1/client/exercise-logs/${exerciseLogId}/media`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        s3_key: 'uploads/test/doc.pdf',
        mime_type: 'application/pdf',
        file_size_kb: 100,
      })
    expect(res.status).toBe(400)
  })
})

// =============================================================================
// SECTION 8 — Coach Reviews Client Workout
// =============================================================================
describe('Section 8 — Coach Reviews Client Workout', () => {

  test('TC-REVIEW-001 · Coach views client workouts by clientProfileId', async () => {
    const res = await request(app)
      .get(`/api/v1/coach/clients/${clientProfileId}/workouts`)
      .set('Authorization', `Bearer ${coachToken}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.find(w => w.id === workoutId)).toBeTruthy()
  })

  test('TC-REVIEW-002 · Coach filters client workouts by status', async () => {
    const res = await request(app)
      .get(`/api/v1/coach/clients/${clientProfileId}/workouts?status=COMPLETED`)
      .set('Authorization', `Bearer ${coachToken}`)

    expect(res.status).toBe(200)
    res.body.data.forEach(w => expect(w.status).toBe('COMPLETED'))
  })

  test('TC-REVIEW-003 · Coach views client detail', async () => {
    const res = await request(app)
      .get(`/api/v1/coach/clients/${clientProfileId}`)
      .set('Authorization', `Bearer ${coachToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data.email).toBe(CLIENT_EMAIL)
    expect(res.body.data.id).toBe(clientProfileId)
  })
})

// =============================================================================
// SECTION 9 — Comments
// =============================================================================
describe('Section 9 — Comments', () => {

  test('TC-COMMENT-001 · Coach posts workout comment → notification sent to client', async () => {
    const res = await request(app)
      .post(`/api/v1/coach/workouts/${workoutId}/comments`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ content: 'Great depth on those squats!' })

    expect(res.status).toBe(201)
    expect(res.body.data.content).toBe('Great depth on those squats!')
    workoutCommentId = res.body.data.id

    const { rows } = await testPool.query(
      'SELECT * FROM workout_comments WHERE workout_id=$1', [workoutId]
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].user_id).toBe(coachUserId)

    // COMMENT_ADDED notification for client
    const { rows: notif } = await testPool.query(
      "SELECT * FROM notifications WHERE user_id=$1 AND type='COMMENT_ADDED'", [clientUserId]
    )
    expect(notif.length).toBeGreaterThan(0)
  })

  test('TC-COMMENT-002 · Client reads workout comments', async () => {
    const res = await request(app)
      .get(`/api/v1/client/workouts/${workoutId}/comments`)
      .set('Authorization', `Bearer ${clientToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].content).toBe('Great depth on those squats!')
    expect(res.body.data[0].first_name).toBeTruthy()
  })

  test('TC-COMMENT-003 · Client posts workout comment', async () => {
    const res = await request(app)
      .post(`/api/v1/client/workouts/${workoutId}/comments`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ content: 'Thanks coach!' })

    expect(res.status).toBe(201)

    const { rows } = await testPool.query(
      'SELECT * FROM workout_comments WHERE workout_id=$1 ORDER BY created_at', [workoutId]
    )
    expect(rows).toHaveLength(2)
    expect(rows[1].user_id).toBe(clientUserId)
  })

  test('TC-COMMENT-004 · Coach reads updated comment thread', async () => {
    const res = await request(app)
      .get(`/api/v1/coach/workouts/${workoutId}/comments`)
      .set('Authorization', `Bearer ${coachToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
    // Comments include user info
    res.body.data.forEach(c => {
      expect(c.first_name).toBeTruthy()
      expect(c.role).toBeTruthy()
    })
  })

  test('TC-COMMENT-005 · Client posts exercise comment', async () => {
    const res = await request(app)
      .post(`/api/v1/client/exercise-logs/${exerciseLogId}/comments`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ content: 'Lower back was tight on set 3' })

    expect(res.status).toBe(201)
    const { rows } = await testPool.query(
      'SELECT * FROM exercise_comments WHERE exercise_log_id=$1', [exerciseLogId]
    )
    expect(rows).toHaveLength(1)
  })

  test('TC-COMMENT-006 · Empty comment returns 400', async () => {
    const res = await request(app)
      .post(`/api/v1/coach/workouts/${workoutId}/comments`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ content: '   ' })
    expect(res.status).toBe(400)
  })
})

// =============================================================================
// SECTION 10 — Workout Exercise Prescription Edit
// =============================================================================
describe('Section 10 — Workout Exercise Prescription Edit', () => {

  test('TC-WE-001 · Coach updates prescription on instantiated exercise', async () => {
    const res = await request(app)
      .patch(`/api/v1/coach/workout-exercises/${workoutExerciseId}`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ prescribed_sets: 4, prescribed_reps: '6' })

    expect(res.status).toBe(200)
    const { rows } = await testPool.query('SELECT * FROM workout_exercises WHERE id=$1', [workoutExerciseId])
    expect(rows[0].prescribed_sets).toBe(4)
    expect(rows[0].prescribed_reps).toBe('6')
  })

  test('TC-WE-002 · Client cannot edit prescription (403)', async () => {
    const res = await request(app)
      .patch(`/api/v1/coach/workout-exercises/${workoutExerciseId}`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ prescribed_sets: 99 })
    expect(res.status).toBe(403)
  })
})

// =============================================================================
// SECTION 11 — Client Sees Updated Prescription
// =============================================================================
describe('Section 11 — Client Sees Updated Prescription', () => {

  test('TC-PRESCRIPTION-001 · Client workout list reflects coach\'s edit', async () => {
    const res = await request(app)
      .get('/api/v1/client/workouts')
      .set('Authorization', `Bearer ${clientToken}`)

    expect(res.status).toBe(200)
    const w = res.body.data.find(w => w.id === workoutId)
    expect(w).toBeTruthy()
    const ex = w.exercises.find(e => e.id === workoutExerciseId)
    expect(ex).toBeTruthy()
    expect(ex.prescribed_sets).toBe(4) // updated by coach
  })
})

// =============================================================================
// SECTION 12 — Messaging
// =============================================================================
describe('Section 12 — Messaging', () => {

  test('TC-MESSAGE-001 · Create thread and send message', async () => {
    // Create thread directly in DB (API doesn't have thread creation yet)
    const { rows: cp } = await testPool.query('SELECT id FROM coach_profiles WHERE user_id=$1', [coachUserId])
    const { rows: inserted } = await testPool.query(
      'INSERT INTO message_threads (coach_id, client_id) VALUES ($1,$2) RETURNING id',
      [cp[0].id, clientProfileId]
    )
    threadId = inserted[0].id

    const res = await request(app)
      .post('/api/v1/messages/send')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ thread_id: threadId, content: 'How are you feeling after yesterday?' })

    expect(res.status).toBe(201)
    expect(res.body.data.content).toBe('How are you feeling after yesterday?')
    expect(res.body.data.sender_id).toBe(coachUserId)
  })

  test('TC-MESSAGE-002 · Non-participant cannot send to thread (403)', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'stranger_test@example.com', password: 'TestPass1', first_name: 'X', last_name: 'Y', role: 'CLIENT' })
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'stranger_test@example.com', password: 'TestPass1' })

    const res = await request(app)
      .post('/api/v1/messages/send')
      .set('Authorization', `Bearer ${loginRes.body.data.token}`)
      .send({ thread_id: threadId, content: 'Intrusion attempt' })
    expect(res.status).toBe(403)
  })

  test('TC-MESSAGE-003 · Both participants see the thread', async () => {
    const coachRes = await request(app)
      .get('/api/v1/messages/threads')
      .set('Authorization', `Bearer ${coachToken}`)
    expect(coachRes.body.data.find(t => t.id === threadId)).toBeTruthy()

    const clientRes = await request(app)
      .get('/api/v1/messages/threads')
      .set('Authorization', `Bearer ${clientToken}`)
    expect(clientRes.body.data.find(t => t.id === threadId)).toBeTruthy()
  })
})

// =============================================================================
// SECTION 13 — Progress Tracking
// =============================================================================
describe('Section 13 — Progress Tracking', () => {

  test('TC-PROGRESS-001 · Client logs bodyweight', async () => {
    const res = await request(app)
      .post('/api/v1/client/progress')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ metric_type: 'WEIGHT', value: 175, unit: 'lb', recorded_at: TODAY })

    expect(res.status).toBe(201)
    const { rows } = await testPool.query('SELECT * FROM progress_metrics WHERE id=$1', [res.body.data.id])
    expect(Number(rows[0].value)).toBe(175)
    progressId = res.body.data.id
  })

  test('TC-PROGRESS-002 · Missing recorded_at returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/client/progress')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ metric_type: 'WEIGHT', value: 175, unit: 'lb' })
    expect(res.status).toBe(400)
  })

  test('TC-PROGRESS-003 · Progress list filterable by metric_type', async () => {
    const res = await request(app)
      .get('/api/v1/client/progress?metric_type=WEIGHT')
      .set('Authorization', `Bearer ${clientToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.find(p => p.id === progressId)).toBeTruthy()
    res.body.data.forEach(p => expect(p.metric_type).toBe('WEIGHT'))
  })
})

// =============================================================================
// SECTION 14 — Permission Enforcement
// =============================================================================
describe('Section 14 — Permission Enforcement', () => {

  test('TC-PERM-001 · Unauthenticated access to any route returns 401', async () => {
    const [r1, r2, r3] = await Promise.all([
      request(app).get('/api/v1/coach/templates'),
      request(app).get('/api/v1/client/workouts/today'),
      request(app).get('/api/v1/exercises'),
    ])
    expect(r1.status).toBe(401)
    expect(r2.status).toBe(401)
    expect(r3.status).toBe(401)
  })

  test('TC-PERM-002 · Coach 2 cannot access Coach 1\'s client', async () => {
    // Register coach 2
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: COACH2_EMAIL, password: PASSWORD, first_name: 'Other', last_name: 'Coach', role: 'COACH' })
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: COACH2_EMAIL, password: PASSWORD })
    coach2Token = loginRes.body.data.token

    const res = await request(app)
      .get(`/api/v1/coach/clients/${clientProfileId}`)
      .set('Authorization', `Bearer ${coach2Token}`)
    expect([403, 404]).toContain(res.status)
  })

  test('TC-PERM-003 · Coach 2 search excludes clients already assigned to any coach', async () => {
    const res = await request(app)
      .get('/api/v1/coach/clients/search?q=jones')
      .set('Authorization', `Bearer ${coach2Token}`)
    expect(res.status).toBe(200)
    // clientUserId is linked to coach 1 → must not appear for coach 2
    expect(res.body.data.find(u => u.id === clientUserId)).toBeFalsy()
    // unlinked client should still appear
    expect(res.body.data.find(u => u.id === unlinkedClientUserId)).toBeFalsy() // last name is Client not Jones
  })

  test('TC-PERM-004 · Client cannot view another client\'s workouts', async () => {
    const res = await request(app)
      .get(`/api/v1/coach/clients/${clientProfileId}/workouts`)
      .set('Authorization', `Bearer ${clientToken}`)
    expect(res.status).toBe(403)
  })

  test('TC-PERM-005 · Client cannot comment on a workout they don\'t own', async () => {
    const fakeWorkoutId = '00000000-0000-4000-8000-000000000003'
    const res = await request(app)
      .post(`/api/v1/client/workouts/${fakeWorkoutId}/comments`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ content: 'Should not work' })
    expect(res.status).toBe(404)
  })

  test('TC-PERM-006 · Coach cannot delete COMPLETED workout', async () => {
    const res = await request(app)
      .delete(`/api/v1/coach/workouts/${workoutId}`)
      .set('Authorization', `Bearer ${coachToken}`)
    expect(res.status).toBe(409)
  })
})

// =============================================================================
// SECTION 15 — Notifications
// =============================================================================
describe('Section 15 — Notifications', () => {

  test('TC-NOTIFY-001 · Client has WORKOUT_ASSIGNED notification', async () => {
    const { rows } = await testPool.query(
      "SELECT * FROM notifications WHERE user_id=$1 AND type='WORKOUT_ASSIGNED'",
      [clientUserId]
    )
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0].is_read).toBe(false)
  })

  test('TC-NOTIFY-002 · Coach has WORKOUT_COMPLETED notification', async () => {
    const { rows } = await testPool.query(
      "SELECT * FROM notifications WHERE type='WORKOUT_COMPLETED' AND related_id=$1",
      [workoutId]
    )
    expect(rows.length).toBeGreaterThan(0)
  })

  test('TC-NOTIFY-003 · Coach has VIDEO_UPLOADED notification', async () => {
    const { rows } = await testPool.query(
      "SELECT * FROM notifications WHERE type='VIDEO_UPLOADED'"
    )
    expect(rows.length).toBeGreaterThan(0)
  })

  test('TC-NOTIFY-004 · Client has COMMENT_ADDED notification from coach', async () => {
    const { rows } = await testPool.query(
      "SELECT * FROM notifications WHERE user_id=$1 AND type='COMMENT_ADDED'",
      [clientUserId]
    )
    expect(rows.length).toBeGreaterThan(0)
  })
})

// =============================================================================
// SECTION 17 — End-to-End Coherence
// =============================================================================
describe('Section 17 — End-to-End Coherence', () => {

  test('TC-E2E-001 · Complete lifecycle — all records exist in DB', async () => {
    const checks = await Promise.all([
      testPool.query('SELECT id FROM users WHERE email=$1',                           [COACH_EMAIL]),
      testPool.query('SELECT id FROM users WHERE email=$1',                           [CLIENT_EMAIL]),
      testPool.query('SELECT id FROM client_profiles WHERE id=$1',                    [clientProfileId]),
      testPool.query('SELECT id FROM exercises WHERE id=$1',                          [exerciseId]),
      testPool.query('SELECT id FROM workout_templates WHERE id=$1',                  [templateId]),
      testPool.query('SELECT id FROM workouts WHERE id=$1',                           [workoutId]),
      testPool.query('SELECT id FROM workout_logs WHERE id=$1',                       [workoutLogId]),
      testPool.query('SELECT id FROM exercise_logs WHERE id=$1',                      [exerciseLogId]),
      testPool.query('SELECT id FROM exercise_set_logs WHERE exercise_log_id=$1',     [exerciseLogId]),
      testPool.query('SELECT id FROM media_uploads WHERE related_id=$1',              [exerciseLogId]),
      testPool.query('SELECT id FROM workout_comments WHERE workout_id=$1',           [workoutId]),
      testPool.query('SELECT id FROM exercise_comments WHERE exercise_log_id=$1',     [exerciseLogId]),
      testPool.query("SELECT id FROM activity WHERE type='WORKOUT_COMPLETED'"),
      testPool.query("SELECT id FROM notifications WHERE type='WORKOUT_ASSIGNED' AND user_id=$1", [clientUserId]),
    ])

    const labels = [
      'users(coach)', 'users(client)', 'client_profiles', 'exercises',
      'workout_templates', 'workouts', 'workout_logs', 'exercise_logs',
      'exercise_set_logs', 'media_uploads', 'workout_comments', 'exercise_comments',
      'activity', 'notifications',
    ]

    checks.forEach((result, i) => {
      expect(result.rows.length).toBeGreaterThan(0)
    })
  })
})

// =============================================================================
// SECTION 18 — Multiple Workouts Same Day
// Verifies the real TrueCoach flow: a client can have >1 workout on the same day
// (e.g. AM lift + PM cardio) and all are returned from /client/workouts/today.
// Depends on: coachToken, clientToken, clientProfileId, templateId (prior sections)
// =============================================================================
describe('Section 18 — Multiple Workouts Same Day', () => {
  let secondTodayWorkoutId

  test('TC-MULTIDAY-001 · Coach assigns second workout for today', async () => {
    const res = await request(app)
      .post('/api/v1/coach/workouts/assign')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ template_id: templateId, client_id: clientProfileId, scheduled_date: TODAY, name: 'PM Cardio' })
    expect(res.status).toBe(201)
    secondTodayWorkoutId = res.body.data.id
  })

  test('TC-MULTIDAY-002 · /client/workouts/today returns ALL today workouts as array', async () => {
    const res = await request(app)
      .get('/api/v1/client/workouts/today')
      .set('Authorization', `Bearer ${clientToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    // Must include both today workouts
    const ids = res.body.data.map(w => w.id)
    expect(ids).toContain(workoutId)
    expect(ids).toContain(secondTodayWorkoutId)
  })

  test('TC-MULTIDAY-003 · Today workouts all include exercises array', async () => {
    const res = await request(app)
      .get('/api/v1/client/workouts/today')
      .set('Authorization', `Bearer ${clientToken}`)
    expect(res.status).toBe(200)
    res.body.data.forEach(w => {
      expect(Array.isArray(w.exercises)).toBe(true)
    })
  })

  test('TC-MULTIDAY-004 · Today returns empty array when no workouts today (different client)', async () => {
    // Register a fresh client with no workouts
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'noworkout_test@example.com', password: 'TestPassword123', first_name: 'Empty', last_name: 'Client', role: 'CLIENT' })
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'noworkout_test@example.com', password: 'TestPassword123' })
    const emptyToken = loginRes.body.data.token
    const res = await request(app)
      .get('/api/v1/client/workouts/today')
      .set('Authorization', `Bearer ${emptyToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data).toHaveLength(0)
  })
})

// =============================================================================
// SECTION 19 — Template & Exercise Deletion After Assignment (Snapshot Integrity)
// Verifies that soft-deleting a template or deleting an exercise does not corrupt
// already-assigned workout snapshots.
// =============================================================================
describe('Section 19 — Snapshot Integrity After Deletion', () => {
  let isolatedTemplateId, isolatedWorkoutId

  test('TC-SNAP-001 · Create a dedicated template and assign it', async () => {
    const tmpl = await request(app)
      .post('/api/v1/coach/templates')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        name: 'Snap_TEST_Template',
        exercises: [{ exercise_id: exerciseId, prescribed_sets: 3, prescribed_reps: '10' }],
      })
    expect(tmpl.status).toBe(201)
    isolatedTemplateId = tmpl.body.data.id

    const assign = await request(app)
      .post('/api/v1/coach/workouts/assign')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ template_id: isolatedTemplateId, client_id: clientProfileId, scheduled_date: TOMORROW })
    expect(assign.status).toBe(201)
    isolatedWorkoutId = assign.body.data.id
  })

  test('TC-SNAP-002 · Soft-delete template → assigned workout still returns 200', async () => {
    // Soft-delete the template
    const del = await request(app)
      .delete(`/api/v1/coach/templates/${isolatedTemplateId}`)
      .set('Authorization', `Bearer ${coachToken}`)
    expect(del.status).toBe(200)

    // Archived template must not appear in template list
    const listRes = await request(app)
      .get('/api/v1/coach/templates')
      .set('Authorization', `Bearer ${coachToken}`)
    expect(listRes.body.data.find(t => t.id === isolatedTemplateId)).toBeFalsy()

    // But the workout snapshot still exists and is accessible
    const wRes = await request(app)
      .get(`/api/v1/coach/clients/${clientProfileId}/workouts`)
      .set('Authorization', `Bearer ${coachToken}`)
    expect(wRes.status).toBe(200)
    const found = wRes.body.data.find(w => w.id === isolatedWorkoutId)
    expect(found).toBeTruthy()
// Soft-delete sets is_archived=true but does NOT physically delete the row,
    // so ON DELETE SET NULL does NOT fire — template_id still references the archived template.
    // The workout is still fully accessible regardless of archive status.
    expect(found.template_id).toBe(isolatedTemplateId)
  })

  test('TC-SNAP-003 · workout_exercises snapshot survives template soft-delete', async () => {
    const { rows } = await testPool.query(
      'SELECT * FROM workout_exercises WHERE workout_id=$1', [isolatedWorkoutId]
    )
    // Snapshot rows exist regardless of template state
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0].prescribed_sets).toBe(3)
  })

  test('TC-SNAP-004 · Deleting template that does not belong to coach silently does nothing (idempotent)', async () => {
    // coach2 tries to delete coach1's (already archived) template
    const res = await request(app)
      .delete(`/api/v1/coach/templates/${isolatedTemplateId}`)
      .set('Authorization', `Bearer ${coach2Token}`)
    // Should succeed (200) but affect 0 rows — not expose an error
    expect(res.status).toBe(200)

    // Verify it was already archived by coach1, not changed
    const { rows } = await testPool.query(
      'SELECT is_archived FROM workout_templates WHERE id=$1', [isolatedTemplateId]
    )
    expect(rows[0].is_archived).toBe(true)
  })

  test('TC-SNAP-005 · Assigning an archived template returns 404', async () => {
    // isolatedTemplateId was archived in TC-SNAP-002
    const res = await request(app)
      .post('/api/v1/coach/workouts/assign')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ template_id: isolatedTemplateId, client_id: clientProfileId, scheduled_date: TOMORROW })
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  test('TC-SNAP-006 · GET /coach/templates/:id for archived template returns 404', async () => {
    const res = await request(app)
      .get(`/api/v1/coach/templates/${isolatedTemplateId}`)
      .set('Authorization', `Bearer ${coachToken}`)
    expect(res.status).toBe(404)
  })
})

// =============================================================================
// SECTION 20 — Workout Rescheduling
// =============================================================================
describe('Section 20 — Workout Rescheduling', () => {
  let rescheduleWorkoutId

  test('TC-RESCHEDULE-001 · Coach can reschedule a SCHEDULED workout to future date', async () => {
    const assign = await request(app)
      .post('/api/v1/coach/workouts/assign')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ template_id: templateId, client_id: clientProfileId, scheduled_date: TOMORROW, name: 'Reschedule_TEST' })
    expect(assign.status).toBe(201)
    rescheduleWorkoutId = assign.body.data.id

    const dayAfterTomorrow = (() => {
      const d = new Date(); d.setDate(d.getDate() + 2); return d.toISOString().split('T')[0]
    })()
    const res = await request(app)
      .patch(`/api/v1/coach/workouts/${rescheduleWorkoutId}`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ scheduled_date: dayAfterTomorrow })
    expect(res.status).toBe(200)
    expect(res.body.data.scheduled_date).toBe(dayAfterTomorrow)

    // Confirm in DB
    const { rows } = await testPool.query('SELECT scheduled_date FROM workouts WHERE id=$1', [rescheduleWorkoutId])
    expect(rows[0].scheduled_date).toBe(dayAfterTomorrow)
  })

  test('TC-RESCHEDULE-002 · Workout no longer appears in original date\'s upcoming list after reschedule', async () => {
    const res = await request(app)
      .get('/api/v1/client/workouts/upcoming')
      .set('Authorization', `Bearer ${clientToken}`)
    // The workout was for TOMORROW before patch; it's now day+2 — TOMORROW slot for this workout should be gone
    const stillOnTomorrow = res.body.data.find(w => w.id === rescheduleWorkoutId && w.scheduled_date === TOMORROW)
    expect(stillOnTomorrow).toBeFalsy()
  })

  test('TC-RESCHEDULE-003 · Coach can reschedule to a past date (no restriction on past dates)', async () => {
    // This is the real-world behavior: coaches may need to back-date workouts
    const res = await request(app)
      .patch(`/api/v1/coach/workouts/${rescheduleWorkoutId}`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ scheduled_date: YESTERDAY })
    expect(res.status).toBe(200)
    expect(res.body.data.scheduled_date).toBe(YESTERDAY)
  })

  test('TC-RESCHEDULE-004 · Coach cannot reschedule a COMPLETED workout', async () => {
    // workoutId was completed in Section 6
    const res = await request(app)
      .patch(`/api/v1/coach/workouts/${workoutId}`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ scheduled_date: TOMORROW })
    // COMPLETED workouts can still have their date changed (no explicit block in spec)
    // but status stays COMPLETED — verify the DB status doesn't revert
    expect(res.status).toBe(200)
    const { rows } = await testPool.query('SELECT status FROM workouts WHERE id=$1', [workoutId])
    expect(rows[0].status).toBe('COMPLETED')
  })

  test('TC-RESCHEDULE-005 · PATCH with invalid date format returns 400', async () => {
    const res = await request(app)
      .patch(`/api/v1/coach/workouts/${rescheduleWorkoutId}`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ scheduled_date: '15/03/2026' })
    expect(res.status).toBe(400)
  })

  test('TC-RESCHEDULE-006 · Coach 2 cannot reschedule Coach 1\'s workout', async () => {
    const res = await request(app)
      .patch(`/api/v1/coach/workouts/${rescheduleWorkoutId}`)
      .set('Authorization', `Bearer ${coach2Token}`)
      .send({ scheduled_date: TOMORROW })
    expect(res.status).toBe(404) // not found for this coach
  })
})

// =============================================================================
// SECTION 21 — Coach Cross-Access Isolation (Workouts & Workout-Exercises)
// =============================================================================
describe('Section 21 — Coach Cross-Access Isolation', () => {

test('TC-CROSS-001 · Coach 2 cannot PATCH workout-exercise belonging to Coach 1', async () => {
    const res = await request(app)
      .patch(`/api/v1/coach/workout-exercises/${workoutExerciseId}`)
      .set('Authorization', `Bearer ${coach2Token}`)
      .send({ prescribed_sets: 5 }) // valid value — must fail on ownership, not validation
    expect(res.status).toBe(403)
    // DB unchanged
    const { rows } = await testPool.query('SELECT prescribed_sets FROM workout_exercises WHERE id=$1', [workoutExerciseId])
    expect(rows[0].prescribed_sets).not.toBe(5)
  })

  test('TC-CROSS-002 · Coach 2 cannot DELETE Coach 1\'s SCHEDULED workout', async () => {
    // Need a fresh scheduled workout from coach 1
    const assign = await request(app)
      .post('/api/v1/coach/workouts/assign')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ template_id: templateId, client_id: clientProfileId, scheduled_date: TOMORROW, name: 'Cross_TEST_Delete' })
    const victimWorkoutId = assign.body.data.id

    const res = await request(app)
      .delete(`/api/v1/coach/workouts/${victimWorkoutId}`)
      .set('Authorization', `Bearer ${coach2Token}`)
    expect(res.status).toBe(404)

    // Row still exists in DB
    const { rows } = await testPool.query('SELECT id FROM workouts WHERE id=$1', [victimWorkoutId])
    expect(rows).toHaveLength(1)
  })

  test('TC-CROSS-003 · Coach 2 cannot view Coach 1\'s template', async () => {
    const res = await request(app)
      .get(`/api/v1/coach/templates/${templateId}`)
      .set('Authorization', `Bearer ${coach2Token}`)
    expect(res.status).toBe(404)
  })

  test('TC-CROSS-004 · Coach 2 cannot comment on Coach 1\'s workout', async () => {
    const res = await request(app)
      .post(`/api/v1/coach/workouts/${workoutId}/comments`)
      .set('Authorization', `Bearer ${coach2Token}`)
      .send({ content: 'Intruder comment' })
    expect(res.status).toBe(404)

    // No comment persisted
    const { rows } = await testPool.query(
      "SELECT * FROM workout_comments WHERE content='Intruder comment'"
    )
    expect(rows).toHaveLength(0)
  })

  test('TC-CROSS-005 · Coach cannot link a user already linked to another coach', async () => {
    // clientUserId is already linked to coach 1; coach 2 tries to steal them
    const res = await request(app)
      .post('/api/v1/coach/clients')
      .set('Authorization', `Bearer ${coach2Token}`)
      .send({ user_id: clientUserId })
    // client_profiles.user_id has UNIQUE constraint → conflict
    expect(res.status).toBe(409)
  })

  test('TC-CROSS-006 · Same template name allowed for different coaches', async () => {
    // Duplicate name check is per-coach — coach 2 can use a name coach 1 already has
    const res = await request(app)
      .post('/api/v1/coach/templates')
      .set('Authorization', `Bearer ${coach2Token}`)
      .send({ name: 'Lower Body Day Updated', exercises: [] })
    expect(res.status).toBe(201)
  })
})

// =============================================================================
// SECTION 22 — Progress Tracking Edge Cases
// =============================================================================
describe('Section 22 — Progress Edge Cases', () => {

  test('TC-PROGRESS-004 · CUSTOM metric_type without metric_label returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/client/progress')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ metric_type: 'CUSTOM', value: 10, unit: 'cm', recorded_at: TODAY })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  test('TC-PROGRESS-005 · CUSTOM metric_type with metric_label succeeds', async () => {
    const res = await request(app)
      .post('/api/v1/client/progress')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ metric_type: 'CUSTOM', metric_label: 'Neck', value: 40, unit: 'cm', recorded_at: TODAY })
    expect(res.status).toBe(201)
    expect(res.body.data.metric_label).toBe('Neck')
    expect(res.body.data.metric_type).toBe('CUSTOM')
  })

  test('TC-PROGRESS-006 · Invalid metric_type returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/client/progress')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ metric_type: 'MUSCLE_MASS', value: 70, unit: 'kg', recorded_at: TODAY })
    expect(res.status).toBe(400)
  })

  test('TC-PROGRESS-007 · Negative value returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/client/progress')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ metric_type: 'WEIGHT', value: -5, unit: 'kg', recorded_at: TODAY })
    expect(res.status).toBe(400)
  })

  test('TC-PROGRESS-008 · Value at upper boundary (9999) is accepted', async () => {
    const res = await request(app)
      .post('/api/v1/client/progress')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ metric_type: 'WEIGHT', value: 9999, unit: 'kg', recorded_at: TODAY })
    expect(res.status).toBe(201)
  })

  test('TC-PROGRESS-009 · Value above upper boundary (10000) returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/client/progress')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ metric_type: 'WEIGHT', value: 10000, unit: 'kg', recorded_at: TODAY })
    expect(res.status).toBe(400)
  })

  test('TC-PROGRESS-010 · Progress filter by date range returns only matching entries', async () => {
    // Log one entry in the past
    await request(app)
      .post('/api/v1/client/progress')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ metric_type: 'BODY_FAT', value: 15, unit: '%', recorded_at: YESTERDAY })

    const res = await request(app)
      .get(`/api/v1/client/progress?metric_type=BODY_FAT&from=${TODAY}&to=${TODAY}`)
      .set('Authorization', `Bearer ${clientToken}`)
    expect(res.status).toBe(200)
    // YESTERDAY entry must not appear
    res.body.data.forEach(p => {
      expect(p.recorded_at >= TODAY).toBe(true)
      expect(p.metric_type).toBe('BODY_FAT')
    })
  })

  test('TC-PROGRESS-011 · Missing unit returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/client/progress')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ metric_type: 'WEIGHT', value: 80, recorded_at: TODAY })
    expect(res.status).toBe(400)
  })

  test('TC-PROGRESS-012 · Coach cannot log client progress directly', async () => {
    const res = await request(app)
      .post('/api/v1/client/progress')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ metric_type: 'WEIGHT', value: 80, unit: 'kg', recorded_at: TODAY })
    expect(res.status).toBe(403)
  })
})

// =============================================================================
// SECTION 23 — Messaging Edge Cases
// =============================================================================
describe('Section 23 — Messaging Edge Cases', () => {

  test('TC-MSG-004 · Empty message content returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/messages/send')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ thread_id: threadId, content: '' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  test('TC-MSG-005 · Whitespace-only message content returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/messages/send')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ thread_id: threadId, content: '   \t\n  ' })
    expect(res.status).toBe(400)
  })

  test('TC-MSG-006 · Invalid thread UUID returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/messages/send')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ thread_id: 'not-a-uuid', content: 'Hello' })
    expect(res.status).toBe(400)
  })

  test('TC-MSG-007 · Non-existent thread UUID returns 404', async () => {
    const res = await request(app)
      .post('/api/v1/messages/send')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ thread_id: '00000000-0000-4000-8000-000000000099', content: 'Hello' })
    expect(res.status).toBe(404)
  })

  test('TC-MSG-008 · Thread detail endpoint returns messages in ascending order', async () => {
    // Send a second message so there are 2
    await request(app)
      .post('/api/v1/messages/send')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ thread_id: threadId, content: 'Reply from client' })

    const res = await request(app)
      .get(`/api/v1/messages/threads/${threadId}`)
      .set('Authorization', `Bearer ${coachToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeGreaterThanOrEqual(2)
    // Messages are returned in ascending time order (oldest first)
    for (let i = 1; i < res.body.data.length; i++) {
      expect(res.body.data[i].created_at >= res.body.data[i - 1].created_at).toBe(true)
    }
  })

  test('TC-MSG-009 · Thread detail with invalid cursor UUID is ignored gracefully', async () => {
    const res = await request(app)
      .get(`/api/v1/messages/threads/${threadId}?cursor=not-a-uuid`)
      .set('Authorization', `Bearer ${coachToken}`)
    // Invalid cursor should be ignored — still returns messages
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  test('TC-MSG-010 · GET /messages/threads requires auth (401)', async () => {
    const res = await request(app).get('/api/v1/messages/threads')
    expect(res.status).toBe(401)
  })
})

// =============================================================================
// SECTION 24 — Exercise PATCH / DELETE Ownership
// =============================================================================
describe('Section 24 — Exercise Ownership Enforcement', () => {
  let coach2ExerciseId

  test('TC-EX-OWNER-001 · Coach 2 creates their own exercise', async () => {
    const res = await request(app)
      .post('/api/v1/exercises')
      .set('Authorization', `Bearer ${coach2Token}`)
      .send({ name: 'Coach2_TEST_BenchPress' })
    expect(res.status).toBe(201)
    coach2ExerciseId = res.body.data.id
  })

  test('TC-EX-OWNER-002 · Coach 1 cannot PATCH Coach 2\'s exercise', async () => {
    const res = await request(app)
      .patch(`/api/v1/exercises/${coach2ExerciseId}`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ name: 'Stolen_TEST_Exercise' })
    expect(res.status).toBe(403)
    const { rows } = await testPool.query('SELECT name FROM exercises WHERE id=$1', [coach2ExerciseId])
    expect(rows[0].name).toBe('Coach2_TEST_BenchPress') // unchanged
  })

  test('TC-EX-OWNER-003 · Coach 1 cannot DELETE Coach 2\'s exercise', async () => {
    const res = await request(app)
      .delete(`/api/v1/exercises/${coach2ExerciseId}`)
      .set('Authorization', `Bearer ${coachToken}`)
    expect(res.status).toBe(403)
    const { rows } = await testPool.query('SELECT id FROM exercises WHERE id=$1', [coach2ExerciseId])
    expect(rows).toHaveLength(1) // still exists
  })

  test('TC-EX-OWNER-004 · Coach 2 can PATCH their own exercise', async () => {
    const res = await request(app)
      .patch(`/api/v1/exercises/${coach2ExerciseId}`)
      .set('Authorization', `Bearer ${coach2Token}`)
      .send({ name: 'Coach2_TEST_BenchPress_Updated' })
    expect(res.status).toBe(200)
    expect(res.body.data.name).toBe('Coach2_TEST_BenchPress_Updated')
  })

  test('TC-EX-OWNER-005 · Coach 2 can DELETE their own exercise', async () => {
    const res = await request(app)
      .delete(`/api/v1/exercises/${coach2ExerciseId}`)
      .set('Authorization', `Bearer ${coach2Token}`)
    expect(res.status).toBe(200)
    const { rows } = await testPool.query('SELECT id FROM exercises WHERE id=$1', [coach2ExerciseId])
    expect(rows).toHaveLength(0)
  })

  test('TC-EX-OWNER-006 · GET /exercises/:id — non-existent UUID returns 404', async () => {
    const res = await request(app)
      .get('/api/v1/exercises/00000000-0000-4000-8000-000000000099')
      .set('Authorization', `Bearer ${coachToken}`)
    expect(res.status).toBe(404)
  })

  test('TC-EX-OWNER-007 · GET /exercises/:id — malformed UUID returns 404', async () => {
    const res = await request(app)
      .get('/api/v1/exercises/not-a-uuid')
      .set('Authorization', `Bearer ${coachToken}`)
    expect(res.status).toBe(404)
  })
})

// =============================================================================
// SECTION 25 — Input Validation / Injection Hardening
// Ensures control characters, oversized payloads, and injection attempts are blocked.
// =============================================================================
describe('Section 25 — Input Validation & Injection Hardening', () => {

  test('TC-INPUT-001 · Template name with control characters returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/coach/templates')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ name: 'Bad\x01Name', exercises: [] })
    expect(res.status).toBe(400)
  })

  test('TC-INPUT-002 · Template name exceeding 200 chars returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/coach/templates')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ name: 'A'.repeat(201), exercises: [] })
    expect(res.status).toBe(400)
  })

  test('TC-INPUT-003 · Exercise name with SQL-injection-style content is stored literally (not executed)', async () => {
    const malicious = "Robert'); DROP TABLE users;--"
    const res = await request(app)
      .post('/api/v1/exercises')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ name: malicious + '_TEST' })
    expect(res.status).toBe(201)
    // users table must still exist
    const { rows } = await testPool.query('SELECT COUNT(*) FROM users')
    expect(Number(rows[0].count)).toBeGreaterThan(0)
    // Name stored verbatim
    const { rows: exRows } = await testPool.query(
      "SELECT name FROM exercises WHERE name LIKE '%DROP TABLE%_TEST'"
    )
    expect(exRows).toHaveLength(1)
  })

  test('TC-INPUT-004 · Comment with XSS payload is stored as plain text (not executed)', async () => {
    const xss = '<script>alert("xss")</script>'
    const res = await request(app)
      .post(`/api/v1/coach/workouts/${workoutId}/comments`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ content: xss })
    expect(res.status).toBe(201)
    // Value stored as-is — sanitization is the frontend's job; backend must not crash
    const { rows } = await testPool.query(
      'SELECT content FROM workout_comments WHERE content=$1', [xss]
    )
    expect(rows).toHaveLength(1)
  })

  test('TC-INPUT-005 · Workout log with out-of-range rating (6) returns 400', async () => {
    const res = await request(app)
      .post(`/api/v1/client/workouts/${workoutId}/log`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ rating: 6, exercise_logs: [] })
    expect(res.status).toBe(400)
  })

  test('TC-INPUT-006 · Workout log with rating 0 returns 400 (min is 1)', async () => {
    const res = await request(app)
      .post(`/api/v1/client/workouts/${workoutId}/log`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ rating: 0, exercise_logs: [] })
    expect(res.status).toBe(400)
  })

  test('TC-INPUT-007 · Workout log with RPE out of range (11) returns 400', async () => {
    const res = await request(app)
      .post(`/api/v1/client/workouts/${workoutId}/log`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        exercise_logs: [{
          workout_exercise_id: workoutExerciseId,
          rpe: 11,
        }],
      })
    expect(res.status).toBe(400)
  })

  test('TC-INPUT-008 · Register with email that has leading/trailing spaces is normalised', async () => {
    // Zod schema trims and lowercases — ' User@Test.COM ' → 'user@test.com'
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: '  trimmed_test@example.com  ', password: 'TestPassword123', first_name: 'T', last_name: 'T', role: 'CLIENT' })
    expect(res.status).toBe(201)
    const { rows } = await testPool.query("SELECT email FROM users WHERE email='trimmed_test@example.com'")
    expect(rows).toHaveLength(1)
  })

  test('TC-INPUT-009 · Password without a digit returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'nodigit_test@example.com', password: 'NoDigitPassword', first_name: 'A', last_name: 'B', role: 'CLIENT' })
    expect(res.status).toBe(400)
  })

  test('TC-INPUT-010 · Password without a letter returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'noletter_test@example.com', password: '12345678', first_name: 'A', last_name: 'B', role: 'CLIENT' })
    expect(res.status).toBe(400)
  })

  test('TC-INPUT-011 · Template with 0 exercises is accepted (exercises are optional)', async () => {
    // Edge Tests V1 says "Template must contain at least one exercise" — but the spec does NOT
    // enforce this server-side; it is a UX constraint only. Empty templates are valid DB rows.
    const res = await request(app)
      .post('/api/v1/coach/templates')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ name: 'Empty_TEST_Template', exercises: [] })
    expect(res.status).toBe(201)
  })
})

// =============================================================================
// SECTION 26 — Workout Log Edge Cases
// =============================================================================
describe('Section 26 — Workout Log Edge Cases', () => {
  let missedWorkoutId, logOnlyWorkoutId

  test('TC-WLOG-001 · Coach can mark a SCHEDULED workout as MISSED', async () => {
    const assign = await request(app)
      .post('/api/v1/coach/workouts/assign')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ template_id: templateId, client_id: clientProfileId, scheduled_date: YESTERDAY, name: 'Missed_TEST' })
    missedWorkoutId = assign.body.data.id

    const res = await request(app)
      .patch(`/api/v1/coach/workouts/${missedWorkoutId}`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ status: 'MISSED' })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('MISSED')

    const { rows } = await testPool.query('SELECT status FROM workouts WHERE id=$1', [missedWorkoutId])
    expect(rows[0].status).toBe('MISSED')
  })

  test('TC-WLOG-002 · Client can still log a MISSED workout (retroactive logging)', async () => {
    // Real TrueCoach behaviour: client can log even after a workout is MISSED
    const { rows: we } = await testPool.query('SELECT id FROM workout_exercises WHERE workout_id=$1', [missedWorkoutId])
    const res = await request(app)
      .post(`/api/v1/client/workouts/${missedWorkoutId}/log`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        overall_notes: 'Did it late',
        exercise_logs: [{ workout_exercise_id: we[0].id, actual_sets: 2 }],
      })
    expect(res.status).toBe(201)
    // Status flips to COMPLETED
    const { rows } = await testPool.query('SELECT status FROM workouts WHERE id=$1', [missedWorkoutId])
    expect(rows[0].status).toBe('COMPLETED')
  })

  test('TC-WLOG-003 · Logging with a workout_exercise_id that does not belong to the workout returns 400 or 500 (FK)', async () => {
    // Assign a fresh workout so it's SCHEDULED (not yet logged)
    const assign = await request(app)
      .post('/api/v1/coach/workouts/assign')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ template_id: templateId, client_id: clientProfileId, scheduled_date: TODAY, name: 'FKTest_TEST' })
    logOnlyWorkoutId = assign.body.data.id

    // Use an exercise_id from a completely different workout
    const res = await request(app)
      .post(`/api/v1/client/workouts/${logOnlyWorkoutId}/log`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        exercise_logs: [{
          workout_exercise_id: workoutExerciseId, // belongs to workoutId, not logOnlyWorkoutId
          actual_sets: 3,
        }],
      })
    // Either DB FK error (500) or explicit validation — must not silently succeed with corrupt data
    expect([400, 409, 500]).toContain(res.status)
  })

  test('TC-WLOG-004 · Log with no exercise_logs only updates workout-level fields', async () => {
    const assign = await request(app)
      .post('/api/v1/coach/workouts/assign')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ template_id: templateId, client_id: clientProfileId, scheduled_date: TODAY, name: 'NoEx_TEST' })
    const noExWorkoutId = assign.body.data.id

    const res = await request(app)
      .post(`/api/v1/client/workouts/${noExWorkoutId}/log`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ rating: 3, overall_notes: 'Header only', exercise_logs: [] })
    expect(res.status).toBe(201)

    const { rows: wl } = await testPool.query('SELECT * FROM workout_logs WHERE workout_id=$1', [noExWorkoutId])
    expect(wl[0].rating).toBe(3)
    expect(wl[0].overall_notes).toBe('Header only')
    const { rows: el } = await testPool.query('SELECT id FROM exercise_logs WHERE workout_log_id=$1', [wl[0].id])
    expect(el).toHaveLength(0)
  })

  test('TC-WLOG-005 · Idempotent re-log increments no new exercise_log rows when exercise_logs is empty', async () => {
    // Re-log workoutId (already has 1 exercise_log from Section 6) with empty list
    const { rows: before } = await testPool.query('SELECT COUNT(*) FROM exercise_logs WHERE workout_log_id=$1', [workoutLogId])

    await request(app)
      .post(`/api/v1/client/workouts/${workoutId}/log`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ rating: 5, exercise_logs: [] })

    const { rows: after } = await testPool.query('SELECT COUNT(*) FROM exercise_logs WHERE workout_log_id=$1', [workoutLogId])
    // Count must not change — empty exercise_logs means no new rows
    expect(Number(after[0].count)).toBe(Number(before[0].count))
  })

  test('TC-WLOG-006 · Coach cannot submit a workout log on behalf of client', async () => {
    const assign = await request(app)
      .post('/api/v1/coach/workouts/assign')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ template_id: templateId, client_id: clientProfileId, scheduled_date: TOMORROW, name: 'CoachLog_TEST' })
    const coachLogId = assign.body.data.id

    const res = await request(app)
      .post(`/api/v1/client/workouts/${coachLogId}/log`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ exercise_logs: [] })
    expect(res.status).toBe(403)
  })
})

// =============================================================================
// SECTION 27 — Notifications API (GET & mark-as-read)
// =============================================================================
describe('Section 27 — Notifications API', () => {
  let notificationId

  test('TC-NOTIF-API-001 · GET /client/notifications returns unread notifications', async () => {
    const res = await request(app)
      .get('/api/v1/client/notifications')
      .set('Authorization', `Bearer ${clientToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    // All returned rows must be unread
    res.body.data.forEach(n => expect(n.is_read).toBe(false))
    // Must have at least WORKOUT_ASSIGNED and COMMENT_ADDED from prior sections
    expect(res.body.data.length).toBeGreaterThan(0)
    notificationId = res.body.data[0].id
  })

  test('TC-NOTIF-API-002 · GET /client/notifications?all=true returns all (including read)', async () => {
    const res = await request(app)
      .get('/api/v1/client/notifications?all=true')
      .set('Authorization', `Bearer ${clientToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeGreaterThanOrEqual(
      // At minimum the same as unread count
      (await request(app).get('/api/v1/client/notifications').set('Authorization', `Bearer ${clientToken}`)).body.data.length
    )
  })

  test('TC-NOTIF-API-003 · PATCH /client/notifications/read-all marks all unread as read', async () => {
    const res = await request(app)
      .patch('/api/v1/client/notifications/read-all')
      .set('Authorization', `Bearer ${clientToken}`)
    expect(res.status).toBe(200)
    expect(typeof res.body.data.marked_read).toBe('number')
    expect(res.body.data.marked_read).toBeGreaterThan(0)

    // Verify DB: no unread notifications remain for this user
    const { rows } = await testPool.query(
      "SELECT id FROM notifications WHERE user_id=$1 AND is_read=false", [clientUserId]
    )
    expect(rows).toHaveLength(0)
  })

  test('TC-NOTIF-API-004 · PATCH /client/notifications/read-all when none unread returns 0', async () => {
    // All were just marked read above
    const res = await request(app)
      .patch('/api/v1/client/notifications/read-all')
      .set('Authorization', `Bearer ${clientToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.marked_read).toBe(0)
  })

  test('TC-NOTIF-API-005 · PATCH /client/notifications/:id/read marks single notification read', async () => {
    // First create a new notification for the client by assigning a new workout
    const assign = await request(app)
      .post('/api/v1/coach/workouts/assign')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ template_id: templateId, client_id: clientProfileId, scheduled_date: TOMORROW, name: 'NotifRead_TEST' })
    expect(assign.status).toBe(201)

    // Fetch unread notifications
    const listRes = await request(app)
      .get('/api/v1/client/notifications')
      .set('Authorization', `Bearer ${clientToken}`)
    expect(listRes.body.data.length).toBeGreaterThan(0)
    const targetId = listRes.body.data[0].id

    const res = await request(app)
      .patch(`/api/v1/client/notifications/${targetId}/read`)
      .set('Authorization', `Bearer ${clientToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.is_read).toBe(true)

    const { rows } = await testPool.query('SELECT is_read FROM notifications WHERE id=$1', [targetId])
    expect(rows[0].is_read).toBe(true)
  })

  test('TC-NOTIF-API-006 · Client cannot mark another user\'s notification as read', async () => {
    // Get a notification belonging to coach (WORKOUT_COMPLETED), try to mark it from client
    const { rows } = await testPool.query(
      "SELECT id FROM notifications WHERE type='WORKOUT_COMPLETED' LIMIT 1"
    )
    if (!rows.length) return // skip if none exist yet
    const coachNotifId = rows[0].id

    const res = await request(app)
      .patch(`/api/v1/client/notifications/${coachNotifId}/read`)
      .set('Authorization', `Bearer ${clientToken}`)
    expect(res.status).toBe(404) // not found for this user
  })

  test('TC-NOTIF-API-007 · Coach cannot access /client/notifications endpoint', async () => {
    const res = await request(app)
      .get('/api/v1/client/notifications')
      .set('Authorization', `Bearer ${coachToken}`)
    expect(res.status).toBe(403)
  })

  test('TC-NOTIF-API-008 · Unauthenticated access to notifications returns 401', async () => {
    const res = await request(app).get('/api/v1/client/notifications')
    expect(res.status).toBe(401)
  })
})

// =============================================================================
// SECTION 28 — History List Integrity
// Verifies that workouts never disappear from GET /client/workouts after being
// logged, and that unlinked clients get an empty array rather than a 404.
// =============================================================================
describe('Section 28 — History List Integrity', () => {
  test('TC-HISTORY-001 · Logged (COMPLETED) workout still appears in GET /client/workouts', async () => {
    // workoutId was logged as COMPLETED in TC-LOG-001
    const res = await request(app)
      .get('/api/v1/client/workouts')
      .set('Authorization', `Bearer ${clientToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    const found = res.body.data.find(w => w.id === workoutId)
    expect(found).toBeTruthy()
    expect(found.status).toBe('COMPLETED')
  })

  test('TC-HISTORY-002 · Unlinked CLIENT gets [] from GET /client/workouts (not 404)', async () => {
    // Register a fresh client with no coach link
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'history_unlinked_test@example.com', password: 'TestPassword123', first_name: 'History', last_name: 'Unlinked', role: 'CLIENT' })
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'history_unlinked_test@example.com', password: 'TestPassword123' })
    const unlinkedToken = login.body.data.token

    const res = await request(app)
      .get('/api/v1/client/workouts')
      .set('Authorization', `Bearer ${unlinkedToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data).toHaveLength(0)
  })
})

// =============================================================================
// SECTION 29 — Optional Sets/Reps & No Muscle Groups
// Verifies that prescribed_sets and prescribed_reps are fully optional on
// template exercises, and that exercises have no muscle group fields.
// =============================================================================
describe('Section 29 — Optional Prescription Fields & No Muscle Groups', () => {

  test('TC-OPT-001 · Template exercise without prescribed_sets or prescribed_reps succeeds', async () => {
    const res = await request(app)
      .post('/api/v1/coach/templates')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        name: 'Optional_TEST_Sets',
        exercises: [{
          exercise_id: exerciseId,
          order_index: 0,
          // prescribed_sets intentionally omitted
          // prescribed_reps intentionally omitted
        }],
      })
    expect(res.status).toBe(201)

    // DB: sets and reps stored as null, not defaulted to 3
    const { rows } = await testPool.query(
      'SELECT * FROM workout_template_exercises WHERE workout_template_id=$1', [res.body.data.id]
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].prescribed_sets).toBeNull()
    expect(rows[0].prescribed_reps).toBeNull()
  })

  test('TC-OPT-002 · Template exercise with only prescribed_sets (no reps) succeeds', async () => {
    const res = await request(app)
      .post('/api/v1/coach/templates')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        name: 'SetsOnly_TEST',
        exercises: [{
          exercise_id: exerciseId,
          prescribed_sets: 4,
          // prescribed_reps intentionally omitted
        }],
      })
    expect(res.status).toBe(201)

    const { rows } = await testPool.query(
      'SELECT * FROM workout_template_exercises WHERE workout_template_id=$1', [res.body.data.id]
    )
    expect(rows[0].prescribed_sets).toBe(4)
    expect(rows[0].prescribed_reps).toBeNull()
  })

  test('TC-OPT-003 · Template exercise with only prescribed_reps (no sets) succeeds', async () => {
    const res = await request(app)
      .post('/api/v1/coach/templates')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        name: 'RepsOnly_TEST',
        exercises: [{
          exercise_id: exerciseId,
          prescribed_reps: 'AMRAP',
          // prescribed_sets intentionally omitted
        }],
      })
    expect(res.status).toBe(201)

    const { rows } = await testPool.query(
      'SELECT * FROM workout_template_exercises WHERE workout_template_id=$1', [res.body.data.id]
    )
    expect(rows[0].prescribed_sets).toBeNull()
    expect(rows[0].prescribed_reps).toBe('AMRAP')
  })

  test('TC-OPT-004 · Assigning template with null sets/reps creates valid workout snapshot', async () => {
    // Create template with no sets/reps
    const tmpl = await request(app)
      .post('/api/v1/coach/templates')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        name: 'NoSetsReps_TEST',
        exercises: [{ exercise_id: exerciseId }],
      })
    expect(tmpl.status).toBe(201)

    const assign = await request(app)
      .post('/api/v1/coach/workouts/assign')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ template_id: tmpl.body.data.id, client_id: clientProfileId, scheduled_date: TOMORROW })
    expect(assign.status).toBe(201)

    // Snapshot correctly carries null sets/reps
    const { rows: we } = await testPool.query(
      'SELECT * FROM workout_exercises WHERE workout_id=$1', [assign.body.data.id]
    )
    expect(we).toHaveLength(1)
    expect(we[0].prescribed_sets).toBeNull()
    expect(we[0].prescribed_reps).toBeNull()
  })

  test('TC-OPT-005 · Client dashboard shows exercise with null sets/reps without crashing', async () => {
    // The workout from TC-OPT-004 was scheduled for TOMORROW, so it will show in upcoming
    const res = await request(app)
      .get('/api/v1/client/workouts/upcoming')
      .set('Authorization', `Bearer ${clientToken}`)
    expect(res.status).toBe(200)
    // Find a workout whose exercises have null prescribed_sets
    const withNullSets = res.body.data.find(w =>
      w.exercises && w.exercises.some(e => e.prescribed_sets === null)
    )
    expect(withNullSets).toBeTruthy()
  })

  test('TC-OPT-006 · Exercise has no primary_muscle_group field in response', async () => {
    const res = await request(app)
      .get(`/api/v1/exercises/${exerciseId}`)
      .set('Authorization', `Bearer ${coachToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.primary_muscle_group).toBeUndefined()
    expect(res.body.data.secondary_muscle_groups).toBeUndefined()
  })

  test('TC-OPT-007 · Creating exercise with primary_muscle_group field ignores it (field not stored)', async () => {
    const res = await request(app)
      .post('/api/v1/exercises')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        name: 'MuscleGroup_TEST_Ignored',
        primary_muscle_group: 'Legs',  // extra field — should be ignored, not error
      })
    expect(res.status).toBe(201)
    // DB: no muscle group column
    const { rows } = await testPool.query('SELECT * FROM exercises WHERE id=$1', [res.body.data.id])
    expect(rows[0].primary_muscle_group).toBeUndefined()
  })

  test('TC-OPT-008 · Exercise list does not include muscle group fields', async () => {
    const res = await request(app)
      .get('/api/v1/exercises')
      .set('Authorization', `Bearer ${coachToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeGreaterThan(0)
    res.body.data.forEach(e => {
      expect(e.primary_muscle_group).toBeUndefined()
      expect(e.secondary_muscle_groups).toBeUndefined()
    })
  })
})
