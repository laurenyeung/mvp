Perform a full security audit of the specified route, file, or PR diff.

## Secrets and credentials
- [ ] No secrets, tokens, API keys, or connection strings in source code
- [ ] `.env` is in `.gitignore`; `.env.example` has only placeholder values
- [ ] No sensitive values in git history (check recent commits if new files added)

## Input handling
- [ ] All user input validated with Zod before touching DB or business logic
- [ ] All SQL uses parameterised queries — no string interpolation of user input
- [ ] Enum values (status, role, metric_type) whitelisted, not passed raw to DB
- [ ] UUID format validated on all `:id` route params before querying
- [ ] Pagination `limit` params clamped to max 100
- [ ] Minimum-length checks use `value.length < MIN`, not `!value`

## Authentication and authorisation
- [ ] Every protected route uses `requireAuth` + appropriate `requireRole`
- [ ] Resource ownership verified before update/delete (e.g. coach owns workout)
- [ ] Cross-user access returns 404 (not 403) to avoid leaking existence

## Rate limiting
- [ ] Auth routes use `authLimiter` (10 req / 15 min per IP)
- [ ] Media/presign routes use `mediaLimiter` (30 req / min per IP)
- [ ] All other routes use `apiLimiter` (200 req / min per IP)
- [ ] Any new route group assigned the correct limiter

## Passwords and tokens
- [ ] Passwords hashed with bcrypt at cost ≥ 12
- [ ] `bcrypt.compare` runs even when user not found (timing attack prevention)
- [ ] JWT secret ≥ 32 chars, validated at startup
- [ ] No passwords, tokens, or sensitive request fields logged

## Dependencies
- [ ] `npm audit` run after every `npm install`
- [ ] No moderate+ severity vulnerabilities unresolved
- [ ] New packages verified on npm before adding

## General hardening
- [ ] `helmet()` present on the Express app
- [ ] Body size capped at `64kb`
- [ ] Stack traces not exposed in production error responses
- [ ] S3 keys scoped per user ID
- [ ] No path traversal risk on user-supplied file paths or S3 keys

Report each finding as: **[SEVERITY] Finding — file:line — Recommendation**
