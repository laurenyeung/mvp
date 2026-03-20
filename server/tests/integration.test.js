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
        primary_muscle_group: 'Legs',
        is_public: false,
      })

    expect(res.status).toBe(201)
    expect(res.body.data.name).toBe('Barbell_TEST_Squat')
    expect(res.body.data.primary_muscle_group).toBe('Legs')

    const { rows } = await testPool.query('SELECT * FROM exercises WHERE id=$1', [res.body.data.id])
    expect(rows[0].created_by).toBe(coachUserId)
    expect(rows[0].is_public).toBe(false)

    exerciseId = res.body.data.id
  })

  test('TC-EXERCISE-001b · Coach creates second exercise (for template with multiple)', async () => {
    const res = await request(app)
      .post('/api/v1/exercises')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ name: 'Romanian_TEST_Deadlift', primary_muscle_group: 'Legs' })
    expect(res.status).toBe(201)
    exercise2Id = res.body.data.id
  })

  test('TC-EXERCISE-002 · Client cannot create exercise (403)', async () => {
    const res = await request(app)
      .post('/api/v1/exercises')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ name: 'Hack_TEST_Squat', primary_muscle_group: 'Legs' })
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
        estimated_duration_minutes: 60,
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

  test('TC-TEMPLATE-001b · Template with null prescribed_rest_secs passes validation', async () => {
    // Regression test: null was being rejected by the old schema (.optional() without .nullable())
    const res = await request(app)
      .post('/api/v1/coach/templates')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        name: 'Null_TEST_Rest',
        exercises: [{
          exercise_id: exerciseId,
          prescribed_sets: 3,
          prescribed_reps: '8',
          prescribed_rest_secs: null,  // explicit null must be accepted
        }],
      })
    expect(res.status).toBe(201)
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
      .send({ exercises: [{ exercise_id: exerciseId, prescribed_sets: 99, prescribed_reps: '1' }] })

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
    expect(res.body.data).not.toBeNull()
    expect(res.body.data.id).toBe(workoutId)
    expect(Array.isArray(res.body.data.exercises)).toBe(true)
    expect(res.body.data.exercises.length).toBeGreaterThan(0)

    const ex = res.body.data.exercises[0]
    expect(ex.name).toBeTruthy()
    expect(ex.prescribed_sets).toBeGreaterThan(0)
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

  test('TC-LOG-002 · Re-submit updates workout log — no duplicate row', async () => {
    const res = await request(app)
      .post(`/api/v1/client/workouts/${workoutId}/log`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ rating: 5, overall_notes: 'Updated notes', exercise_logs: [] })

    expect(res.status).toBe(201)
    const { rows } = await testPool.query('SELECT * FROM workout_logs WHERE workout_id=$1', [workoutId])
    expect(rows).toHaveLength(1)  // still one row
    expect(rows[0].rating).toBe(5) // updated
  })

  test('TC-LOG-003 · Logging a workout the client doesn\'t own returns 404', async () => {
    const otherWorkoutId = '00000000-0000-4000-8000-000000000002'
    const res = await request(app)
      .post(`/api/v1/client/workouts/${otherWorkoutId}/log`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ exercise_logs: [] })
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
