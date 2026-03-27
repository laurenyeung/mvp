import 'dotenv/config'
import { query } from './pool.js'

const SQL = `
-- ENUMS
DO $$ BEGIN
  CREATE TYPE user_role         AS ENUM ('COACH','CLIENT','ADMIN');
  CREATE TYPE workout_status    AS ENUM ('SCHEDULED','COMPLETED','MISSED');
  CREATE TYPE media_type_enum   AS ENUM ('VIDEO','IMAGE');
  CREATE TYPE media_rel_type    AS ENUM ('EXERCISE_LOG','PROGRESS','MESSAGE');
  CREATE TYPE metric_type_enum  AS ENUM ('WEIGHT','BODY_FAT','WAIST','CUSTOM');
  CREATE TYPE notif_type        AS ENUM ('WORKOUT_ASSIGNED','WORKOUT_REMINDER','WORKOUT_COMPLETED','NEW_MESSAGE','VIDEO_UPLOADED','COMMENT_ADDED');
  CREATE TYPE activity_type     AS ENUM ('WORKOUT_COMPLETED','COMMENT_ADDED','VIDEO_UPLOADED','WORKOUT_ASSIGNED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Safely add new enum values if they don't exist yet
DO $$ BEGIN
  ALTER TYPE notif_type ADD VALUE IF NOT EXISTS 'COMMENT_ADDED';
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE activity_type AS ENUM ('WORKOUT_COMPLETED','COMMENT_ADDED','VIDEO_UPLOADED','WORKOUT_ASSIGNED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- USERS
CREATE TABLE IF NOT EXISTS users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             VARCHAR(255) UNIQUE NOT NULL,
  password_hash     TEXT NOT NULL,
  role              user_role NOT NULL,
  first_name        VARCHAR(100) NOT NULL,
  last_name         VARCHAR(100) NOT NULL,
  profile_image_url TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);

-- COACH PROFILES
CREATE TABLE IF NOT EXISTS coach_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  bio           TEXT,
  business_name VARCHAR(200),
  timezone      VARCHAR(100) NOT NULL DEFAULT 'UTC',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_profiles_user ON coach_profiles(user_id);

-- CLIENT PROFILES
CREATE TABLE IF NOT EXISTS client_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  coach_id      UUID NOT NULL REFERENCES coach_profiles(id),
  date_of_birth DATE,
  height_cm     NUMERIC(5,1),
  weight_kg     NUMERIC(5,1),
  goals         TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_profiles_user  ON client_profiles(user_id);
CREATE INDEX        IF NOT EXISTS idx_client_profiles_coach ON client_profiles(coach_id);

-- EXERCISES
CREATE TABLE IF NOT EXISTS exercises (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               VARCHAR(200) NOT NULL,
  description        TEXT,
  equipment_required TEXT[],
  created_by         UUID NOT NULL REFERENCES users(id),
  is_public          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exercises_created_by ON exercises(created_by);
CREATE INDEX IF NOT EXISTS idx_exercises_public     ON exercises(is_public) WHERE is_public = TRUE;

-- Drop muscle group columns if they exist (idempotent migration)
ALTER TABLE exercises DROP COLUMN IF EXISTS primary_muscle_group;
ALTER TABLE exercises DROP COLUMN IF EXISTS secondary_muscle_groups;
DROP INDEX IF EXISTS idx_exercises_muscle;

-- EXERCISE MEDIA
CREATE TABLE IF NOT EXISTS exercise_media (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id   UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  media_type    media_type_enum NOT NULL,
  media_url     TEXT NOT NULL,
  thumbnail_url TEXT,
  uploaded_by   UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exercise_media_exercise ON exercise_media(exercise_id);

-- WORKOUT TEMPLATES
CREATE TABLE IF NOT EXISTS workout_templates (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id                   UUID NOT NULL REFERENCES coach_profiles(id),
  name                       VARCHAR(200) NOT NULL,
  description                TEXT,
  is_archived                BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workout_templates_coach ON workout_templates(coach_id);
ALTER TABLE workout_templates DROP COLUMN IF EXISTS estimated_duration_minutes;

-- WORKOUT TEMPLATE EXERCISES
CREATE TABLE IF NOT EXISTS workout_template_exercises (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_template_id  UUID NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
  exercise_id          UUID NOT NULL REFERENCES exercises(id),
  order_index          SMALLINT NOT NULL,
  superset_group       SMALLINT,
  prescribed_sets      SMALLINT,
  prescribed_reps      VARCHAR(50),
  prescribed_weight    VARCHAR(50),
  prescribed_tempo     VARCHAR(20),
  prescribed_rest_secs SMALLINT,
  notes                TEXT,
  UNIQUE (workout_template_id, order_index)
);

-- WORKOUTS (instantiated)
CREATE TABLE IF NOT EXISTS workouts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id    UUID REFERENCES workout_templates(id) ON DELETE SET NULL,
  coach_id       UUID NOT NULL REFERENCES coach_profiles(id),
  client_id      UUID NOT NULL REFERENCES client_profiles(id),
  name           VARCHAR(200) NOT NULL,
  scheduled_date DATE NOT NULL,
  status         workout_status NOT NULL DEFAULT 'SCHEDULED',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workouts_client_date ON workouts(client_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_workouts_coach       ON workouts(coach_id);
CREATE INDEX IF NOT EXISTS idx_workouts_status      ON workouts(status);

-- WORKOUT EXERCISES (snapshot)
CREATE TABLE IF NOT EXISTS workout_exercises (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id           UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id          UUID NOT NULL REFERENCES exercises(id),
  order_index          SMALLINT NOT NULL,
  superset_group       SMALLINT,
  prescribed_sets      SMALLINT,
  prescribed_reps      VARCHAR(50),
  prescribed_weight    VARCHAR(50),
  prescribed_tempo     VARCHAR(20),
  prescribed_rest_secs SMALLINT,
  notes                TEXT
);
CREATE INDEX IF NOT EXISTS idx_workout_exercises_workout ON workout_exercises(workout_id);


-- Make prescribed_sets nullable in existing tables (idempotent)
ALTER TABLE workout_template_exercises ALTER COLUMN prescribed_sets DROP NOT NULL;
ALTER TABLE workout_template_exercises ALTER COLUMN prescribed_sets DROP DEFAULT;
ALTER TABLE workout_exercises          ALTER COLUMN prescribed_sets DROP NOT NULL;
ALTER TABLE workout_exercises          ALTER COLUMN prescribed_sets DROP DEFAULT;

-- log_weight flag — coach controls whether client sees a weight column per exercise
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS log_weight BOOLEAN NOT NULL DEFAULT false;

-- WORKOUT LOGS
CREATE TABLE IF NOT EXISTS workout_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id    UUID NOT NULL REFERENCES workouts(id),
  client_id     UUID NOT NULL REFERENCES client_profiles(id),
  completed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  overall_notes TEXT,
  rating        SMALLINT CHECK (rating BETWEEN 1 AND 5),
  UNIQUE (workout_id)
);
CREATE INDEX IF NOT EXISTS idx_workout_logs_client ON workout_logs(client_id, completed_at);

-- EXERCISE LOGS
CREATE TABLE IF NOT EXISTS exercise_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_log_id      UUID NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
  workout_exercise_id UUID NOT NULL REFERENCES workout_exercises(id),
  actual_sets         SMALLINT,
  actual_reps         VARCHAR(50),
  actual_weight       VARCHAR(50),
  rpe                 NUMERIC(3,1),
  notes               TEXT
);
CREATE INDEX IF NOT EXISTS idx_exercise_logs_log ON exercise_logs(workout_log_id);

-- EXERCISE SET LOGS (V2) — per-set breakdown
CREATE TABLE IF NOT EXISTS exercise_set_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_log_id UUID NOT NULL REFERENCES exercise_logs(id) ON DELETE CASCADE,
  set_index       SMALLINT NOT NULL,
  reps            SMALLINT,
  weight          NUMERIC(7,2),
  rpe             NUMERIC(3,1),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_set_logs_exercise ON exercise_set_logs(exercise_log_id);

-- WORKOUT COMMENTS (V2)
CREATE TABLE IF NOT EXISTS workout_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workout_comments_workout ON workout_comments(workout_id, created_at);

-- EXERCISE COMMENTS (V2)
CREATE TABLE IF NOT EXISTS exercise_comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_log_id UUID NOT NULL REFERENCES exercise_logs(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id),
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exercise_comments_log ON exercise_comments(exercise_log_id, created_at);

-- ACTIVITY FEED (V2)
CREATE TABLE IF NOT EXISTS activity (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id),
  type       activity_type NOT NULL,
  related_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity(user_id, created_at DESC);

-- PROGRESS METRICS
CREATE TABLE IF NOT EXISTS progress_metrics (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES client_profiles(id),
  metric_type  metric_type_enum NOT NULL,
  metric_label VARCHAR(100),
  value        NUMERIC(8,2) NOT NULL,
  unit         VARCHAR(20) NOT NULL,
  recorded_at  DATE NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_progress_client_type ON progress_metrics(client_id, metric_type, recorded_at);

-- MEDIA UPLOADS
CREATE TABLE IF NOT EXISTS media_uploads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by   UUID NOT NULL REFERENCES users(id),
  related_type  media_rel_type NOT NULL,
  related_id    UUID NOT NULL,
  s3_key        TEXT NOT NULL,
  thumbnail_key TEXT,
  file_size_kb  INT,
  mime_type     VARCHAR(100),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_media_uploads_related ON media_uploads(related_type, related_id);

-- MESSAGE THREADS
CREATE TABLE IF NOT EXISTS message_threads (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id   UUID NOT NULL REFERENCES coach_profiles(id),
  client_id  UUID NOT NULL REFERENCES client_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (coach_id, client_id)
);

-- MESSAGES
CREATE TABLE IF NOT EXISTS messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  UUID NOT NULL REFERENCES message_threads(id),
  sender_id  UUID NOT NULL REFERENCES users(id),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, created_at);

-- NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id),
  type       notif_type NOT NULL,
  related_id UUID,
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
`

async function migrate() {
  console.log('Running migrations…')
  await query(SQL)
  console.log('✅  Migrations complete')
  process.exit(0)
}

migrate().catch(err => { console.error(err); process.exit(1) })
