import { Router } from 'express'
import { query } from '../db/pool.js'
import { requireAuth } from '../middleware/auth.js'
import { mediaLimiter } from '../middleware/rateLimiter.js'
import { presignSchema } from '../middleware/validate.js'

const router = Router()
router.use(requireAuth)

// POST /media/presign
// Tighter rate limit — 30/min — prevents S3 presigned URL farming
router.post('/presign', mediaLimiter, async (req, res, next) => {
  try {
    const parsed = presignSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message },
      })
    }
    const { file_name, mime_type, context } = parsed.data
    // file_name is validated by presignSchema — no path separators, no null bytes

    // ── Production (uncomment + install @aws-sdk/client-s3) ──────────────────
    // import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
    // import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
    // const s3 = new S3Client({ region: process.env.AWS_REGION })
    // const key = `uploads/${context}/${req.user.id}/${Date.now()}-${file_name}`
    // const cmd = new PutObjectCommand({
    //   Bucket: process.env.AWS_BUCKET,
    //   Key: key,
    //   ContentType: mime_type,
    //   // Enforce max size server-side via policy condition
    //   Conditions: [['content-length-range', 1, 200_000_000]],
    // })
    // const upload_url = await getSignedUrl(s3, cmd, { expiresIn: 300 })
    // return res.json({ data: { upload_url, s3_key: key, expires_in_seconds: 300 } })

    // ── Stub for local dev ────────────────────────────────────────────────────
    // Note: user ID is scoped into the key so users can't overwrite each other's files
    const s3_key = `uploads/${context}/${req.user.id}/${Date.now()}-${file_name}`
    res.json({
      data: {
        upload_url: `https://your-bucket.s3.amazonaws.com/${s3_key}?presigned=true`,
        s3_key,
        expires_in_seconds: 300,
      },
    })
  } catch (err) { next(err) }
})

// GET /media/:s3Key/signed-url
router.get('/:s3Key/signed-url', mediaLimiter, async (req, res, next) => {
  try {
    const key = decodeURIComponent(req.params.s3Key)

    // Prevent path traversal — reject any key with ../ sequences or absolute paths
    if (key.includes('..') || key.startsWith('/')) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid key' } })
    }

    // Ownership check — only return a signed URL for keys this user uploaded
    const { rows } = await query(
      'SELECT id FROM media_uploads WHERE s3_key=$1 AND uploaded_by=$2',
      [key, req.user.id]
    )
    if (!rows.length) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } })
    }

    // ── Production ────────────────────────────────────────────────────────────
    // const s3 = new S3Client({ region: process.env.AWS_REGION })
    // const cmd = new GetObjectCommand({ Bucket: process.env.AWS_BUCKET, Key: key })
    // const url = await getSignedUrl(s3, cmd, { expiresIn: 3600 })
    // return res.json({ data: { url, expires_in_seconds: 3600 } })

    res.json({
      data: {
        url: `https://your-bucket.s3.amazonaws.com/${key}?signed=true`,
        expires_in_seconds: 3600,
      },
    })
  } catch (err) { next(err) }
})

export default router
