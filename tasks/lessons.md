# Lessons Learned

Updated after every user correction. Review at the start of each session for patterns relevant to the current task.

**Categories:** `db` `testing` `frontend` `backend` `security` `git` `deps` `dx`

---

## Database

### 2026-03-17 — ID mismatch between client roster and downstream coach queries `db`
**What happened:** Client roster loaded but workouts were empty.
**Root cause:** `GET /coach/clients` returned `u.id` (users.id) as the row id but `workouts.client_id` stores `client_profiles.id`.
**Rule:** For coach→client flows, always use `client_profiles.id` as the canonical client identifier in all URL params and FK joins. The roster must expose `cp.id` as `id` and `u.id` as `user_id`.

### 2026-03-18 — `ON CONFLICT DO NOTHING` without conflict target `db`
**What happened:** Every workout log POST crashed with a PostgreSQL syntax error.
**Root cause:** `exercise_logs` has no unique constraint. `ON CONFLICT DO NOTHING` requires a constraint target.
**Rule:** Before writing any `ON CONFLICT` clause, verify the table has a unique constraint in `db/migrate.js`. If not, either add one or remove the clause.

### 2026-03-18 — PostgreSQL DATE columns return as JS Date objects, not strings `db`
**What happened:** TC-DASHBOARD-002/003 failed — `w.scheduled_date === TOMORROW` (string) never matched because pg returned a Date object.
**Root cause:** The `pg` driver parses `DATE` columns (OID 1082) into JS Date objects by default.
**Rule:** Register a global type parser in `pool.js`: `pg.types.setTypeParser(1082, val => val)`. This makes all DATE columns return as plain `"YYYY-MM-DD"` strings throughout the entire app without needing to cast in every query.

### 2026-03-23 — Cross-coach client link hit DB unique constraint (500) instead of 409 `db` `backend`
**What happened:** Coach 2 tried to link a client already linked to Coach 1. The route only checked `WHERE user_id=$1 AND coach_id=$2`, so the all-coaches uniqueness was not caught — the DB constraint fired and produced a 500.
**Root cause:** The ownership check was scoped to the requesting coach's clients only. `client_profiles.user_id` is globally unique (one client, one coach), so the check must be global.
**Rule:** When inserting into a table with a global UNIQUE constraint, always check against the full constraint (not a scoped subset) before inserting. Use `WHERE user_id=$1` not `WHERE user_id=$1 AND coach_id=$2` to catch the constraint pre-emptively and return a clean 409.

---

## Backend

### 2026-03-17 — Missing dotenv import in migrate.js `backend` `dx`
**What happened:** `npm run migrate` failed with `DATABASE_URL is not set`.
**Root cause:** `migrate.js` imported `pool.js` without loading dotenv first.
**Rule:** Every standalone Node.js script must have `import 'dotenv/config'` as its first line.

### 2026-03-17 — Search route used `!q` instead of `q.length < 2` `backend`
**What happened:** TC-SEARCH-004 failed — 1-char query returned real results instead of empty array.
**Root cause:** `if (!q)` only short-circuits on empty string; `"a"` is truthy.
**Rule:** Enforce minimum query length with `if (q.length < MIN)`, never `if (!q)`.

### 2026-03-18 — Zod `.nullable().optional()` required for fields that can be null `backend`
**What happened:** Template creation failed when frontend sent `prescribed_rest_secs: null`.
**Root cause:** The schema had `.optional()` which accepts `undefined` but NOT `null`. The frontend sends `null` when a user clears a numeric input.
**Rule:** Any field that the frontend may send as `null` must use `.nullable().optional()` in Zod. `.optional()` alone only covers `undefined`. Cross-check with the frontend input handling when defining schemas.

### 2026-03-18 — `safeStr` helper had no minimum length — empty string passed validation `backend`
**What happened:** TC-TEMPLATE-005 failed — empty template name `""` returned 201 instead of 400.
**Root cause:** `safeStr` used `.trim().max(n).refine(...)` with no `.min()`. An empty string after trim passes all those checks.
**Rule:** Use a dedicated `requiredStr` helper for required fields: chain `.min(1)` BEFORE `.refine()` — `.refine()` returns `ZodEffects` which doesn't expose `.min()`. Signature: `z.string().trim().min(1).max(n).refine(...)`.

### 2026-03-23 — `GET /client/workouts/today` returned 404 for unlinked CLIENT users `backend`
**What happened:** TC-MULTIDAY-004 registered a fresh CLIENT user with no coach link and called `/client/workouts/today` — got 404 because `getClientProfileId` throws when no profile exists.
**Root cause:** The helper was designed to throw for any missing profile. But "no workouts today" for an unlinked client is a valid, expected state — not an error.
**Rule:** Dashboard read endpoints (today, upcoming, past) must treat missing client_profiles as "no data", not an error. Check the profile directly and return `[]` / `null` early, rather than delegating to the throwing helper.

### 2026-04-07 — New coach endpoint used req.user.id instead of coach_profiles.id `backend`
**What happened:** `GET /coach/workouts/:id` returned 404 for valid workouts because the ownership check used `req.user.id` directly.
**Root cause:** The `coach_id` column in `workouts` (and `workout_templates`, `client_profiles`) stores `coach_profiles.id`, not `users.id`. Every existing coach route resolves this via `getCoachProfileId(req.user.id)` — the new endpoint skipped that step.
**Rule:** Any new coach route that filters by `coach_id` must first call `const coachId = await getCoachProfileId(req.user.id)` and use `coachId` in the query — never `req.user.id` directly.

### 2026-03-23 — Cross-workout exercise_id in log endpoint allowed silently (data corruption) `backend` `security`
**What happened:** TC-WLOG-003 submitted a `workout_exercise_id` belonging to a different workout. The log was accepted (201) because the FK only validates existence, not ownership.
**Root cause:** No validation that submitted `workout_exercise_id`s belong to the target workout. FK constraints only enforce existence, not scope.
**Rule:** The log endpoint must validate that all submitted `workout_exercise_id`s belong to the workout being logged: `SELECT id FROM workout_exercises WHERE workout_id=$1 AND id=ANY($2::uuid[])` — reject with 400 if count doesn't match.

---

## Testing

### 2026-03-17 — Tests written but not run `testing`
**What happened:** TC-SEARCH-004 bug wasn't caught until user asked to run tests.
**Root cause:** Test-first loop skipped the "run tests" step.
**Rule:** `npm test` MUST be run after writing tests. Writing tests without running them = not writing tests.

### 2026-03-18 — `authLimiter` not skipped in test environment `testing` `backend`
**What happened:** TC-PERM-002 failed with 429 after multiple auth calls in the test suite.
**Root cause:** `authLimiter` was applied per-route in `auth.js`, bypassing the `NODE_ENV=test` check in `index.js` that only skipped `apiLimiter`.
**Rule:** All rate limiters must check `NODE_ENV=test` at module load in `rateLimiter.js`, not just in `index.js`.

### 2026-03-18 — Search exclusion was scoped to current coach only `testing` `backend`
**What happened:** TC-PERM-002b failed — Coach 2 could see clients already linked to Coach 1.
**Root cause:** The search query excluded `WHERE cp.coach_id = $2` (current coach's clients only). Since `client_profiles` has `UNIQUE(user_id)`, a linked client belongs to exactly one coach and should be invisible to all others.
**Rule:** The client search query should exclude anyone who has ANY `client_profiles` row, not just rows belonging to the current coach.

### 2026-03-23 — cleanDatabase() left FK-blocking exercises behind `testing`
**What happened:** Re-running tests after a timeout left test users in the DB with exercises referencing them. `DELETE FROM users` failed with a FK violation.
**Root cause:** `cleanDatabase()` only deleted exercises `WHERE name LIKE '%_TEST_%'`, missing exercises created with other names.
**Rule:** `cleanDatabase()` must delete exercises by creator before deleting users: `DELETE FROM exercises WHERE created_by IN (SELECT id FROM users WHERE email LIKE '%_test@example.com')`. This must come before the users delete.

### 2026-03-23 — Zod validation fires before ownership check — obscures real permission error `testing` `backend`
**What happened:** TC-CROSS-001 sent `prescribed_sets: 99` which exceeded `max(20)`. Zod returned 400 before the ownership check ran, so the test expected 403 but got 400.
**Root cause:** Schema max values must be set intentionally. Tests probing ownership enforcement must use valid field values.
**Rule:** Any test verifying ownership/auth (403/404) must send payloads that pass Zod validation. Confirm the schema's max bounds before writing the assertion.

---

## Frontend

### 2026-03-17 — TanStack Query v5 blank search results in AddClientModal `frontend`
**What happened:** Search input accepted text but dropdown was blank.
**Root cause:** TanStack Query v5 leaves `data=undefined` during the first fetch; the component relied on `results?.length` which silently rendered nothing. Also `staleTime: 10_000` prevented re-fetches on new keystrokes.
**Rule:** Always default `data` in destructuring: `const { data: results = [] } = useQuery(...)`. Use `placeholderData: keepPreviousData` and `staleTime: 2_000` for live search.

### 2026-03-22 — Frontend feature added without verifying target component logic `frontend`
**What happened:** Added navigation from WorkoutHistoryPage to WorkoutLogPage without reading WorkoutLogPage first to confirm it handles history items correctly.
**Root cause:** Treated the fix as purely a "add onClick + navigate" task, skipping logic verification of the destination component.
**Rule:** Before wiring any navigation or link to a page/component, read that target component first. Verify it doesn't guard against the new entry path, the data shape it expects matches the caller, and re-entry is handled gracefully.

---

## Security

### 2026-04-10 — Chose CSRF library not recognized by CodeQL `security` `deps`
**What happened:** Implemented CSRF protection with `csrf-csrf`. CodeQL kept firing `CWE-352/MissingCsrfMiddleware` even after the middleware was wired up. Root cause: CodeQL's query has a hardcoded recognized library list (`csurf`, `tiny-csrf`, `lusca`, `fastify-csrf`). `csrf-csrf` is not on it.
**Root cause:** Picked the most popular-sounding package without checking whether static analysis tools (CodeQL, Snyk, etc.) explicitly recognize it.
**Rule:** Before choosing a security library (CSRF, auth, encryption), check whether the static analysis tool in use (CodeQL, Snyk, etc.) explicitly recognizes it. Search the tool's source for the library name. If not recognized, use one that is — regardless of npm popularity. For CodeQL CSRF: use `csurf`, `tiny-csrf`, `lusca`, or `fastify-csrf`.

### 2026-03-29 — Skipped fixing moderate severity npm vulnerability `security` `deps`
**What happened:** During a security audit, a moderate severity `brace-expansion` vulnerability was going to be deferred.
**Root cause:** Mentally categorised "moderate" as acceptable to defer.
**Rule:** Fix ALL moderate+ severity vulnerabilities before any task is called complete. Run `npm audit fix` and verify `0 vulnerabilities`. There is no acceptable threshold above zero for moderate or higher.

---

## Git

### 2026-03-27 — Committing to git without being asked `git`
**What happened:** After fixing a bug, automatically ran `git commit` and `git push` without the user requesting it.
**Root cause:** Treated "task complete" as equivalent to "commit and push".
**Rule:** Never run `git commit` or `git push` unless the user explicitly says so. Stop at the code change and wait.

### 2026-04-07 — Push rejected because remote had new commits `git`
**What happened:** `git push` failed with "fetch first" because the remote branch had commits not present locally.
**Root cause:** Pushed without pulling first.
**Rule:** Always run `git pull` (merge) immediately before `git push`. Full sequence: `git pull && git push -u origin HEAD`.

---

## Dependencies / DX

### 2026-03-17 — Non-existent npm package in package.json `deps`
**What happened:** `npm install` failed with 404 on `@radix-ui/react-badge`.
**Root cause:** Package added speculatively without verifying on npm.
**Rule:** Always run `npm info <package-name>` before adding any package.

### 2026-03-17 — .gitignore only covered root .env `dx`
**What happened:** `server/.env` would have been committed.
**Root cause:** `.gitignore` had `.env` which doesn't match subdirectories.
**Rule:** Always use `**/.env` in `.gitignore`.

### 2026-03-17 — Broken Homebrew formula (postgresql@18) `dx`
**What happened:** `initdb` failed with `postgres.bki does not exist`.
**Root cause:** `postgresql@18` is not an official Homebrew formula.
**Rule:** Always use `postgresql@16` or `postgresql@17`. Verify with `brew info`.

### 2026-03-18 — Recommended non-existent npm package for MCP shell server `deps`
**What happened:** User got 404 trying to install `@modelcontextprotocol/server-shell`.
**Root cause:** Package name invented from naming patterns without verifying.
**Rule:** Always verify npm packages exist before recommending them. Real MCP shell packages: `bash-mcp`, `mcp-cli-exec`.

---

## Code Quality

### 2026-04-07 — Dead code left in place after removing a feature `dx`
**What happened:** After removing `MISSED` status, the `MISSED` key was left in STATUS objects across three frontend files.
**Root cause:** Treated "stop using the value" as sufficient cleanup.
**Rule:** When a value is removed from a system (enum, status, feature flag), delete every reference to it in the same task — status maps, switch cases, filter arrays, test assertions, type definitions. Dead code is not neutral; it lies about what the system supports.
