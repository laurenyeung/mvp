import { z } from 'zod'

export const registerSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Min 8 characters'),
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  role: z.enum(['COACH', 'CLIENT']),
})

export const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Required'),
})

export const exerciseSchema = z.object({
  name: z.string().min(1, 'Required'),
  description: z.string().optional(),
  equipment_required: z.array(z.string()).optional(),
  is_public: z.boolean().default(false),
  youtube_url: z.string().optional(),
})

export const templateSchema = z.object({
  name: z.string().min(1, 'Required'),
  description: z.string().optional(),
})

export const progressSchema = z.object({
  metric_type: z.enum(['WEIGHT', 'BODY_FAT', 'WAIST', 'CUSTOM']),
  metric_label: z.string().optional(),
  value: z.coerce.number().min(0),
  unit: z.string().min(1, 'Required'),
  recorded_at: z.string().min(1, 'Required'),
})
