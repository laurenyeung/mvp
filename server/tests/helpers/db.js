import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg

export const testPool = new Pool({ connectionString: process.env.DATABASE_URL })

export async function cleanDatabase() {
  // Delete in reverse FK order
  await testPool.query('DELETE FROM notifications')
  await testPool.query('DELETE FROM activity')
  await testPool.query('DELETE FROM exercise_comments')
  await testPool.query('DELETE FROM workout_comments')
  await testPool.query('DELETE FROM messages')
  await testPool.query('DELETE FROM message_threads')
  await testPool.query('DELETE FROM media_uploads')
  await testPool.query('DELETE FROM exercise_set_logs')
  await testPool.query('DELETE FROM exercise_logs')
  await testPool.query('DELETE FROM workout_logs')
  await testPool.query('DELETE FROM workout_exercises')
  await testPool.query('DELETE FROM workouts')
  await testPool.query('DELETE FROM workout_template_exercises')
  await testPool.query('DELETE FROM workout_templates')
  await testPool.query('DELETE FROM exercise_media')
  await testPool.query(`DELETE FROM exercises WHERE name LIKE '%_TEST_%'`)
  await testPool.query('DELETE FROM progress_metrics')
  await testPool.query(`
    DELETE FROM client_profiles
    WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%_test@example.com')
  `)
  await testPool.query(`
    DELETE FROM coach_profiles
    WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%_test@example.com')
  `)
  await testPool.query(`DELETE FROM users WHERE email LIKE '%_test@example.com'`)
}

export async function closeDatabase() {
  await testPool.end()
}
