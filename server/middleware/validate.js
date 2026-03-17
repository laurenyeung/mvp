import { z } from 'zod'

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Safe string: trims whitespace, rejects null bytes and control characters
const safeStr = (max = 255) =>
  z.string().trim()
    .max(max, `Must be ${max} characters or fewer`)
    .refine(s => !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(s), 'Invalid characters')

// UUID v4 validator
export const uuidSchema = z.string().uuid('Invalid ID format')

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const registerSchema = z.object({
  email:      z.string().trim().toLowerCase().email('Invalid email').max(255),
  // Min 8 chars, at least one letter and one number
  password:   z.string()
    .min(8,  'Password must be at least 8 characters')
    .max(72, 'Password too long') // bcrypt truncates at 72 bytes
    .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
    .regex(/[0-9]/,    'Password must contain at least one number'),
  role:       z.enum(['COACH', 'CLIENT']),
  first_name: safeStr(100),
  last_name:  safeStr(100),
})

export const loginSchema = z.object({
  email:    z.string().trim().toLowerCase().email('Invalid email').max(255),
  password: z.string().min(1).max(72),
})

// ─── Exercises ────────────────────────────────────────────────────────────────
export const createExerciseSchema = z.object({
  name:                    safeStr(200),
  description:             safeStr(2000).optional(),
  primary_muscle_group:    safeStr(100),
  secondary_muscle_groups: z.array(safeStr(100)).max(10).optional(),
  equipment_required:      z.array(safeStr(100)).max(20).optional(),
  is_public:               z.boolean().optional().default(false),
})

export const updateExerciseSchema = createExerciseSchema.partial()

// ─── Workout templates ────────────────────────────────────────────────────────
const prescribedExerciseSchema = z.object({
  exercise_id:          uuidSchema,
  order_index:          z.number().int().min(0).max(200).optional(),
  prescribed_sets:      z.number().int().min(1).max(20).optional(),
  prescribed_reps:      safeStr(50).optional(),
  prescribed_weight:    safeStr(50).optional(),
  prescribed_tempo:     safeStr(20).optional(),
  prescribed_rest_secs: z.number().int().min(0).max(600).optional(),
  notes:                safeStr(500).optional(),
})

export const createTemplateSchema = z.object({
  name:                       safeStr(200),
  description:                safeStr(2000).optional(),
  estimated_duration_minutes: z.number().int().min(1).max(300).optional(),
  exercises:                  z.array(prescribedExerciseSchema).max(50).optional().default([]),
})

export const updateTemplateSchema = createTemplateSchema.partial().extend({
  exercises: z.array(prescribedExerciseSchema).max(50).optional(),
})

// ─── Workout assignment ───────────────────────────────────────────────────────
export const assignWorkoutSchema = z.object({
  template_id:    uuidSchema,
  client_id:      uuidSchema,
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  name:           safeStr(200).optional(),
})

export const updateWorkoutSchema = z.object({
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  name:           safeStr(200).optional(),
  status:         z.enum(['SCHEDULED', 'COMPLETED', 'MISSED']).optional(),
})

// ─── Workout log ──────────────────────────────────────────────────────────────
const exerciseLogSchema = z.object({
  workout_exercise_id: uuidSchema,
  actual_sets:         z.number().int().min(0).max(100).nullable().optional(),
  actual_reps:         safeStr(100).nullable().optional(),   // e.g. "10,10,8"
  actual_weight:       safeStr(100).nullable().optional(),   // e.g. "60,65,65"
  rpe:                 z.number().min(1).max(10).nullable().optional(),
  notes:               safeStr(500).nullable().optional(),
})

export const workoutLogSchema = z.object({
  overall_notes:  safeStr(2000).nullable().optional(),
  rating:         z.number().int().min(1).max(5).nullable().optional(),
  exercise_logs:  z.array(exerciseLogSchema).max(50).optional().default([]),
})

// ─── Exercise media upload registration ───────────────────────────────────────
export const exerciseMediaSchema = z.object({
  s3_key:        safeStr(500),
  thumbnail_key: safeStr(500).optional(),
  mime_type:     z.string().regex(/^(video|image)\/.+$/, 'Must be a video or image MIME type').max(100),
  file_size_kb:  z.number().int().min(1).max(200_000).optional(), // max 200 MB
})

// ─── Progress metrics ─────────────────────────────────────────────────────────
export const progressSchema = z.object({
  metric_type:  z.enum(['WEIGHT', 'BODY_FAT', 'WAIST', 'CUSTOM']),
  metric_label: safeStr(100).optional(),
  value:        z.number().min(0).max(9999),
  unit:         safeStr(20),
  recorded_at:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
})

// ─── Messages ─────────────────────────────────────────────────────────────────
export const sendMessageSchema = z.object({
  thread_id: uuidSchema,
  content:   safeStr(4000).refine(s => s.trim().length > 0, 'Message cannot be empty'),
})

// ─── Media presign ────────────────────────────────────────────────────────────
// Allowed MIME types for upload
const ALLOWED_MIME_TYPES = [
  'video/mp4', 'video/quicktime', 'video/webm',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
]

// Safe filename: no path separators or null bytes
const safeFileName = z.string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[^/\\<>:"|?*\x00-\x1f]+$/, 'Invalid filename')

export const presignSchema = z.object({
  file_name: safeFileName,
  mime_type: z.enum(ALLOWED_MIME_TYPES, {
    errorMap: () => ({ message: `MIME type must be one of: ${ALLOWED_MIME_TYPES.join(', ')}` }),
  }),
  context: z.enum(['exercise_log', 'progress', 'message']),
})

// ─── Pagination helpers ───────────────────────────────────────────────────────
export const paginationSchema = z.object({
  limit:  z.coerce.number().int().min(1).max(100).optional().default(40),
  page:   z.coerce.number().int().min(1).optional().default(1),
  cursor: uuidSchema.optional(),
})
