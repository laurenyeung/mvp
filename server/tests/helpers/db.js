import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg

export const testPool = new Pool({ connectionString: process.env.DATABASE_URL })

export async function cleanDatabase() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('cleanDatabase() must only run in NODE_ENV=test — refusing to wipe a non-test database')
  }

  // All deletes are scoped to rows owned by test accounts (email LIKE '%_test@example.com').
  // Never use unconditional DELETE FROM — that wipes production data when tests share a DB.
  const TEST_USERS     = `SELECT id FROM users WHERE email LIKE '%_test@example.com'`
  const TEST_COACHES   = `SELECT id FROM coach_profiles WHERE user_id IN (${TEST_USERS})`
  const TEST_CLIENTS   = `SELECT id FROM client_profiles WHERE user_id IN (${TEST_USERS})`
  const TEST_WORKOUTS  = `SELECT id FROM workouts WHERE coach_id IN (${TEST_COACHES}) OR client_id IN (${TEST_CLIENTS})`
  const TEST_TEMPLATES = `SELECT id FROM workout_templates WHERE coach_id IN (${TEST_COACHES})`
  const TEST_WK_LOGS   = `SELECT id FROM workout_logs WHERE workout_id IN (${TEST_WORKOUTS})`
  const TEST_EX_LOGS   = `SELECT id FROM exercise_logs WHERE workout_log_id IN (${TEST_WK_LOGS})`
  const TEST_THREADS   = `SELECT id FROM message_threads WHERE coach_id IN (${TEST_COACHES}) OR client_id IN (${TEST_CLIENTS})`

  await testPool.query(`DELETE FROM notifications                WHERE user_id       IN (${TEST_USERS})`)
  await testPool.query(`DELETE FROM activity                     WHERE user_id       IN (${TEST_USERS})`)
  await testPool.query(`DELETE FROM exercise_comments            WHERE user_id       IN (${TEST_USERS})`)
  await testPool.query(`DELETE FROM workout_comments             WHERE user_id       IN (${TEST_USERS})`)
  await testPool.query(`DELETE FROM messages                     WHERE thread_id     IN (${TEST_THREADS})`)
  await testPool.query(`DELETE FROM message_threads              WHERE coach_id      IN (${TEST_COACHES}) OR client_id IN (${TEST_CLIENTS})`)
  await testPool.query(`DELETE FROM media_uploads                WHERE uploaded_by   IN (${TEST_USERS})`)
  await testPool.query(`DELETE FROM exercise_set_logs            WHERE exercise_log_id IN (${TEST_EX_LOGS})`)
  await testPool.query(`DELETE FROM exercise_logs                WHERE workout_log_id  IN (${TEST_WK_LOGS})`)
  await testPool.query(`DELETE FROM workout_logs                 WHERE workout_id    IN (${TEST_WORKOUTS})`)
  await testPool.query(`DELETE FROM workout_exercises            WHERE workout_id    IN (${TEST_WORKOUTS})`)
  await testPool.query(`DELETE FROM workouts                     WHERE coach_id      IN (${TEST_COACHES}) OR client_id IN (${TEST_CLIENTS})`)
  await testPool.query(`DELETE FROM workout_template_exercises   WHERE workout_template_id IN (${TEST_TEMPLATES})`)
  await testPool.query(`DELETE FROM workout_templates            WHERE coach_id      IN (${TEST_COACHES})`)
  await testPool.query(`DELETE FROM exercise_media               WHERE exercise_id   IN (SELECT id FROM exercises WHERE created_by IN (${TEST_USERS}))`)
  await testPool.query(`DELETE FROM exercises                    WHERE created_by    IN (${TEST_USERS})`)
  await testPool.query(`DELETE FROM exercises                    WHERE name LIKE '%_TEST_%'`)
  await testPool.query(`DELETE FROM progress_metrics             WHERE client_id     IN (${TEST_CLIENTS})`)
  await testPool.query(`DELETE FROM client_profiles              WHERE user_id       IN (${TEST_USERS})`)
  await testPool.query(`DELETE FROM coach_profiles               WHERE user_id       IN (${TEST_USERS})`)
  await testPool.query(`DELETE FROM users                        WHERE email         LIKE '%_test@example.com'`)
}

export async function closeDatabase() {
  await testPool.end()
}
