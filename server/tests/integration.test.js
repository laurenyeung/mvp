/**
 * FitTrack Integration Test Suite
 * Covers all test cases from the Notion "Test Cases" spec.
 *
 * Spec divergences noted inline where the spec references endpoints
 * that were refactored into the actual implementation.
 *
 * Run: cd server && npm test
 */

import 'dotenv/config'
import request from 'supertest'
import { cleanDatabase, closeDatabase, testPool } from './helpers/db.js'
import app from '../index.js'

// ── Shared state populated as the suite runs (order-dependent) ────────────────
let coachToken, clientToken
let coachUserId, clientUserId, clientProfileId
let exerciseId, templateId, workoutId, workoutExerciseId
let workoutLogId, exerciseLogId, threadId, progressId

const COACH_EMAIL  = 'coach_test@example.com'
const CLIENT_EMAIL = 'client_test@example.com'
const PASSWORD     = 'TestPassword123'
const TODAY        = new Date().toISOString().split('T')[0]

beforeAll(async () => { await cleanDatabase() })
afterAll(async () => { await cleanDatabase(); await closeDatabase() })

// =============================================================================
// SECTION 1 — Authentication
// =============================================================================
describe('Section 1 — Authentication', () => {

  test('TC-AUTH-001 · Coach registers successfully', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: COACH_EMAIL, password: PASSWORD, first_name: 'Test', last_name: 'Coach', role: 'COACH' })

    expect(res.status).toBe(201)
    expect(res.body.data.user.email).toBe(COACH_EMAIL)
    expect(res.body.data.user.role).toBe('COACH')
    expect(res.body.data.token).toBeTruthy()

    const { rows } = await testPool.query('SELECT * FROM users WHERE email=$1', [COACH_EMAIL])
    expect(rows).toHaveLength(1)
    expect(rows[0].role).toBe('COACH')
    expect(rows[0].is_active).toBe(true)

    const { rows: cp } = await testPool.query('SELECT * FROM coach_profiles WHERE user_id=$1', [rows[0].id])
    expect(cp).toHaveLength(1)

    coachUserId = rows[0].id
  })

  test('TC-AUTH-001b · Client registers successfully', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: CLIENT_EMAIL, password: PASSWORD, first_name: 'Test', last_name: 'Client', role: 'CLIENT' })

    expect(res.status).toBe(201)
    expect(res.body.data.user.role).toBe('CLIENT')

    const { rows } = await testPool.query('SELECT * FROM users WHERE email=$1', [CLIENT_EMAIL])
    clientUserId = rows[0].id

    // Manually link client to coach — invite flow is V2
    const { rows: cp } = await testPool.query('SELECT id FROM coach_profiles WHERE user_id=$1', [coachUserId])
    const { rows: inserted } = await testPool.query(
      'INSERT INTO client_profiles (user_id, coach_id) VALUES ($1,$2) RETURNING id',
      [clientUserId, cp[0].id]
    )
    clientProfileId = inserted[0].id
  })

  test('TC-AUTH-001c · Duplicate email returns 409', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: COACH_EMAIL, password: PASSWORD, first_name: 'X', last_name: 'Y', role: 'COACH' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('CONFLICT')
  })

  test('TC-AUTH-002 · Coach logs in and receives token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: COACH_EMAIL, password: PASSWORD })

    expect(res.status).toBe(200)
    expect(res.body.data.token).toBeTruthy()
    expect(res.body.data.user.role).toBe('COACH')
    expect(res.body.data.user.password_hash).toBeUndefined()

    coachToken = res.body.data.token
  })

  test('TC-AUTH-002b · Client logs in and receives token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: CLIENT_EMAIL, password: PASSWORD })

    expect(res.status).toBe(200)
    clientToken = res.body.data.token
  })

  test('TC-AUTH-002c · Wrong password returns 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: COACH_EMAIL, password: 'wrongpassword1' })
    expect(res.status).toBe(401)
  })

  test('TC-AUTH-002d · Unauthenticated request to protected route returns 401', async () => {
    const res = await request(app).get('/api/v1/auth/me')
    expect(res.status).toBe(401)
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
      .send({ name: 'Barbell_TEST_Squat', description: 'Compound lower body movement', primary_muscle_group: 'Legs' })

    expect(res.status).toBe(201)
    expect(res.body.data.name).toBe('Barbell_TEST_Squat')

    const { rows } = await testPool.query('SELECT * FROM exercises WHERE id=$1', [res.body.data.id])
    expect(rows[0].created_by).toBe(coachUserId)

    exerciseId = res.body.data.id
  })

  test('TC-EXERCISE-001b · Client cannot create exercise (403)', async () => {
    const res = await request(app)
      .post('/api/v1/exercises')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ name: 'Bench_TEST_Press', primary_muscle_group: 'Chest' })
    expect(res.status).toBe(403)
  })

  test('TC-EXERCISE-001c · Exercise list returns created exercise', async () => {
    const res = await request(app)
      .get('/api/v1/exercises')
      .set('Authorization', `Bearer ${coachToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.find(e => e.id === exerciseId)).toBeTruthy()
  })
})

// =============================================================================
// SECTION 3 — Workout Templates
// =============================================================================
describe('Section 3 — Workout Templates', () => {

  test('TC-TEMPLATE-001 · Coach creates template with exercise inline', async () => {
    const res = await request(app)
      .post('/api/v1/coach/templates')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        name: 'Lower Body Day',
        description: 'Strength workout',
        estimated_duration_minutes: 60,
        exercises: [{
          exercise_id: exerciseId,
          order_index: 0,
          prescribed_sets: 3,
          prescribed_reps: '8',
          prescribed_weight: '135',
          prescribed_rest_secs: 90,
        }],
      })

    expect(res.status).toBe(201)
    expect(res.body.data.name).toBe('Lower Body Day')

    const { rows: tmpl } = await testPool.query('SELECT * FROM workout_templates WHERE id=$1', [res.body.data.id])
    expect(tmpl[0].name).toBe('Lower Body Day')

    const { rows: cp } = await testPool.query('SELECT id FROM coach_profiles WHERE user_id=$1', [coachUserId])
    expect(tmpl[0].coach_id).toBe(cp[0].id)

    const { rows: te } = await testPool.query(
      'SELECT * FROM workout_template_exercises WHERE workout_template_id=$1', [res.body.data.id]
    )
    expect(te).toHaveLength(1)
    expect(te[0].prescribed_sets).toBe(3)
    expect(te[0].exercise_id).toBe(exerciseId)

    templateId = res.body.data.id
  })

  test('TC-TEMPLATE-001b · Client cannot create template (403)', async () => {
    const res = await request(app)
      .post('/api/v1/coach/templates')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ name: 'Hack attempt' })
    expect(res.status).toBe(403)
  })

  test('TC-TEMPLATE-001c · Template list returns created template', async () => {
    const res = await request(app)
      .get('/api/v1/coach/templates')
      .set('Authorization', `Bearer ${coachToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.find(t => t.id === templateId)).toBeTruthy()
  })
})

// =============================================================================
// SECTION 4 — Workout Assignment
// =============================================================================
describe('Section 4 — Workout Assignment', () => {

  test('TC-WORKOUT-001 · Coach assigns workout to client', async () => {
    const res = await request(app)
      .post('/api/v1/coach/workouts/assign')
      .set('Authorization', `Bearer ${coachToken}`)
      // client_id must be client_profiles.id
      .send({ template_id: templateId, client_id: clientProfileId, scheduled_date: TODAY })

    expect(res.status).toBe(201)
    expect(res.body.data.status).toBe('SCHEDULED')

    const { rows: w } = await testPool.query('SELECT * FROM workouts WHERE id=$1', [res.body.data.id])
    expect(w[0].client_id).toBe(clientProfileId)
    expect(w[0].template_id).toBe(templateId)
    expect(w[0].status).toBe('SCHEDULED')

    const { rows: we } = await testPool.query('SELECT * FROM workout_exercises WHERE workout_id=$1', [res.body.data.id])
    expect(we.length).toBeGreaterThan(0)
    workoutExerciseId = we[0].id

    // TC-NOTIFY-001 — notification inserted in the assign transaction
    const { rows: notif } = await testPool.query(
      'SELECT * FROM notifications WHERE user_id=$1 AND type=$2',
      [clientUserId, 'WORKOUT_ASSIGNED']
    )
    expect(notif).toHaveLength(1)

    workoutId = res.body.data.id
  })

  test('TC-WORKOUT-001b · Invalid client_id returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/coach/workouts/assign')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ template_id: templateId, client_id: 'not-a-uuid', scheduled_date: TODAY })
    expect(res.status).toBe(400)
  })
})

// =============================================================================
// SECTION 5 — Client Views Workout
// =============================================================================
describe('Section 5 — Client Views Workout', () => {

  test('TC-CLIENT-001 · Client fetches today\'s workout with exercises', async () => {
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
    expect(ex.prescribed_sets).toBeTruthy()
    expect(ex.prescribed_reps).toBeTruthy()
  })

  test('TC-CLIENT-001b · Coach cannot access client endpoint (403)', async () => {
    const res = await request(app)
      .get('/api/v1/client/workouts/today')
      .set('Authorization', `Bearer ${coachToken}`)
    expect(res.status).toBe(403)
  })
})

// =============================================================================
// SECTION 6 — Workout Logging
// =============================================================================
describe('Section 6 — Workout Logging', () => {

  test('TC-LOG-001 + TC-LOG-002 · Client logs workout with exercise sets', async () => {
    const res = await request(app)
      .post(`/api/v1/client/workouts/${workoutId}/log`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        rating: 4,
        overall_notes: 'Felt strong today',
        exercise_logs: [{
          workout_exercise_id: workoutExerciseId,
          actual_sets: 3,
          actual_reps: '8',
          actual_weight: '145',
          rpe: 8,
        }],
      })

    expect(res.status).toBe(201)

    const { rows: wl } = await testPool.query('SELECT * FROM workout_logs WHERE workout_id=$1', [workoutId])
    expect(wl).toHaveLength(1)
    expect(wl[0].client_id).toBe(clientProfileId)
    expect(wl[0].rating).toBe(4)
    workoutLogId = wl[0].id

    const { rows: el } = await testPool.query('SELECT * FROM exercise_logs WHERE workout_log_id=$1', [workoutLogId])
    expect(el).toHaveLength(1)
    expect(el[0].actual_sets).toBe(3)
    expect(el[0].actual_weight).toBe('145')
    exerciseLogId = el[0].id

    const { rows: w } = await testPool.query('SELECT status FROM workouts WHERE id=$1', [workoutId])
    expect(w[0].status).toBe('COMPLETED')
  })

  test('TC-LOG-001b · Log is idempotent — re-submit updates, no duplicate row', async () => {
    const res = await request(app)
      .post(`/api/v1/client/workouts/${workoutId}/log`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ rating: 5, overall_notes: 'Updated notes', exercise_logs: [] })

    expect(res.status).toBe(201)
    const { rows } = await testPool.query('SELECT * FROM workout_logs WHERE workout_id=$1', [workoutId])
    expect(rows).toHaveLength(1)   // still one row
    expect(rows[0].rating).toBe(5) // updated value
  })
})

// =============================================================================
// SECTION 7 — Media Upload
// =============================================================================
describe('Section 7 — Media Upload', () => {

  test('TC-MEDIA-001 · Client registers exercise video upload', async () => {
    const res = await request(app)
      .post(`/api/v1/client/exercise-logs/${exerciseLogId}/media`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        s3_key: `uploads/exercise_log/${clientUserId}/test-video.mp4`,
        mime_type: 'video/mp4',
        file_size_kb: 5000,
      })

    expect(res.status).toBe(201)

    const { rows } = await testPool.query(
      'SELECT * FROM media_uploads WHERE related_id=$1', [exerciseLogId]
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].related_type).toBe('EXERCISE_LOG')
    expect(rows[0].mime_type).toBe('video/mp4')
  })
})

// =============================================================================
// SECTION 8 — Coach Reviews Client Workout
// =============================================================================
describe('Section 8 — Coach Reviews Client Workout', () => {

  test('TC-COACH-001 · Coach views client workouts', async () => {
    // Use clientProfileId (client_profiles.id) — this is what workouts.client_id stores
    const res = await request(app)
      .get(`/api/v1/coach/clients/${clientProfileId}/workouts`)
      .set('Authorization', `Bearer ${coachToken}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.find(w => w.id === workoutId)).toBeTruthy()
  })

  test('TC-COACH-001b · Coach views client list', async () => {
    const res = await request(app)
      .get('/api/v1/coach/clients')
      .set('Authorization', `Bearer ${coachToken}`)

    expect(res.status).toBe(200)
    // Roster returns cp.id as id and u.id as user_id
    expect(res.body.data.find(c => c.user_id === clientUserId)).toBeTruthy()
  })
})

// =============================================================================
// SECTION 9 — Coach Modifies Workout Exercise
// =============================================================================
describe('Section 9 — Coach Modifies Workout Exercise', () => {

  test('TC-WORKOUT-002 · Coach updates workout exercise prescription', async () => {
    const res = await request(app)
      .patch(`/api/v1/coach/workout-exercises/${workoutExerciseId}`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ prescribed_sets: 4, prescribed_reps: '6' })

    expect(res.status).toBe(200)

    const { rows } = await testPool.query('SELECT * FROM workout_exercises WHERE id=$1', [workoutExerciseId])
    expect(rows[0].prescribed_sets).toBe(4)
    expect(rows[0].prescribed_reps).toBe('6')
  })
})

// =============================================================================
// SECTION 10 — Client Sees Updated Prescription
// =============================================================================
describe('Section 10 — Client Sees Updated Prescription', () => {

  test('TC-CLIENT-002 · Client workouts list reflects updated prescription', async () => {
    const res = await request(app)
      .get('/api/v1/client/workouts')
      .set('Authorization', `Bearer ${clientToken}`)

    expect(res.status).toBe(200)
    const w = res.body.data.find(w => w.id === workoutId)
    expect(w).toBeTruthy()
    const ex = w.exercises.find(e => e.id === workoutExerciseId)
    expect(ex).toBeTruthy()
    expect(ex.prescribed_sets).toBe(4)
  })
})

// =============================================================================
// SECTION 11 — Messaging
// =============================================================================
describe('Section 11 — Messaging', () => {

  test('TC-MESSAGE-001 setup · Create message thread', async () => {
    const { rows: cp } = await testPool.query('SELECT id FROM coach_profiles WHERE user_id=$1', [coachUserId])
    const { rows: inserted } = await testPool.query(
      'INSERT INTO message_threads (coach_id, client_id) VALUES ($1,$2) RETURNING id',
      [cp[0].id, clientProfileId]
    )
    threadId = inserted[0].id
    expect(threadId).toBeTruthy()
  })

  test('TC-MESSAGE-001 · Coach sends message', async () => {
    const res = await request(app)
      .post('/api/v1/messages/send')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ thread_id: threadId, content: 'Great job on your squat today' })

    expect(res.status).toBe(201)
    expect(res.body.data.content).toBe('Great job on your squat today')

    const { rows } = await testPool.query('SELECT * FROM messages WHERE thread_id=$1', [threadId])
    expect(rows).toHaveLength(1)
    expect(rows[0].sender_id).toBe(coachUserId)
  })

  test('TC-MESSAGE-001b · Non-participant cannot send to thread (403)', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'stranger_test@example.com', password: 'TestPassword123', first_name: 'X', last_name: 'Y', role: 'CLIENT' })
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'stranger_test@example.com', password: 'TestPassword123' })

    const res = await request(app)
      .post('/api/v1/messages/send')
      .set('Authorization', `Bearer ${loginRes.body.data.token}`)
      .send({ thread_id: threadId, content: 'Hacking in' })
    expect(res.status).toBe(403)
  })

  test('TC-MESSAGE-001c · Thread list returns thread for both participants', async () => {
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
// SECTION 12 — Progress Tracking
// =============================================================================
describe('Section 12 — Progress Tracking', () => {

  test('TC-PROGRESS-001 · Client logs bodyweight', async () => {
    const res = await request(app)
      .post('/api/v1/client/progress')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ metric_type: 'WEIGHT', value: 150, unit: 'lb', recorded_at: TODAY })

    expect(res.status).toBe(201)

    const { rows } = await testPool.query('SELECT * FROM progress_metrics WHERE id=$1', [res.body.data.id])
    expect(rows[0].metric_type).toBe('WEIGHT')
    expect(Number(rows[0].value)).toBe(150)
    progressId = res.body.data.id
  })

  test('TC-PROGRESS-001b · Missing recorded_at returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/client/progress')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ metric_type: 'WEIGHT', value: 150, unit: 'lb' })
    expect(res.status).toBe(400)
  })

  test('TC-PROGRESS-001c · Progress list returns entry', async () => {
    const res = await request(app)
      .get('/api/v1/client/progress?metric_type=WEIGHT')
      .set('Authorization', `Bearer ${clientToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.find(p => p.id === progressId)).toBeTruthy()
  })
})

// =============================================================================
// SECTION 13 — Permission Enforcement
// =============================================================================
describe('Section 13 — Permission Enforcement', () => {

  test('TC-PERM-001 · Client cannot access coach workout-exercise endpoint (403)', async () => {
    const res = await request(app)
      .patch(`/api/v1/coach/workout-exercises/${workoutExerciseId}`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ prescribed_sets: 99 })
    expect(res.status).toBe(403)
  })

  test('TC-PERM-002 · Coach 2 cannot access Coach 1\'s client (404)', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'coach2_test@example.com', password: 'TestPassword123', first_name: 'B', last_name: 'Coach', role: 'COACH' })
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'coach2_test@example.com', password: 'TestPassword123' })
    const coach2Token = loginRes.body.data.token

    // Use clientProfileId (client_profiles.id) — the canonical client ID in this API
    const res = await request(app)
      .get(`/api/v1/coach/clients/${clientProfileId}`)
      .set('Authorization', `Bearer ${coach2Token}`)
    expect([403, 404]).toContain(res.status)
  })

  test('TC-PERM-001b · Unauthenticated request returns 401', async () => {
    const res = await request(app).get('/api/v1/coach/templates')
    expect(res.status).toBe(401)
  })
})

// =============================================================================
// SECTION 14 — Notifications
// =============================================================================
describe('Section 14 — Notifications', () => {

  test('TC-NOTIFY-001 · WORKOUT_ASSIGNED notification exists in DB', async () => {
    const { rows } = await testPool.query(
      'SELECT * FROM notifications WHERE user_id=$1 AND type=$2',
      [clientUserId, 'WORKOUT_ASSIGNED']
    )
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0].is_read).toBe(false)
  })
})

// =============================================================================
// SECTION 15 — End-to-End coherence
// =============================================================================
describe('Section 15 — End-to-End Flow', () => {

  test('TC-E2E-001 · Full lifecycle DB state is coherent', async () => {
    const checks = await Promise.all([
      testPool.query('SELECT id FROM users WHERE email=$1',              [COACH_EMAIL]),
      testPool.query('SELECT id FROM users WHERE email=$1',              [CLIENT_EMAIL]),
      testPool.query('SELECT id FROM exercises WHERE id=$1',             [exerciseId]),
      testPool.query('SELECT id FROM workout_templates WHERE id=$1',     [templateId]),
      testPool.query('SELECT id FROM workouts WHERE id=$1',              [workoutId]),
      testPool.query('SELECT id FROM workout_logs WHERE id=$1',          [workoutLogId]),
      testPool.query('SELECT id FROM exercise_logs WHERE id=$1',         [exerciseLogId]),
      testPool.query('SELECT id FROM media_uploads WHERE related_id=$1', [exerciseLogId]),
      testPool.query(
        `SELECT id FROM notifications WHERE user_id=$1 AND type='WORKOUT_ASSIGNED'`,
        [clientUserId]
      ),
    ])

    const labels = [
      'users(coach)', 'users(client)', 'exercises', 'workout_templates',
      'workouts', 'workout_logs', 'exercise_logs', 'media_uploads', 'notifications',
    ]

    checks.forEach((result, i) => {
      expect(result.rows.length).toBeGreaterThan(0)
    })
  })
})
