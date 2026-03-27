# CLAUDE.md — LockedIn

Operating rules for Claude when working on this repository. Read this file at the start of every session. Update `tasks/lessons.md` after every correction.

---

## 1. Plan Mode Default

**Enter plan mode for any non-trivial task** — defined as 3+ steps, any architectural decision, or anything touching auth / DB schema / security.

- Write a numbered plan with expected outcomes before writing a single line of code
- Get implicit or explicit sign-off before executing (if the user says "do it", that's sign-off)
- **If something goes sideways mid-execution: STOP. Do not keep pushing forward.** Re-assess, update the plan, explain what happened, then ask how to proceed
- Use plan mode for **verification steps** too, not just building — e.g. "here's how I'll confirm this works before calling it done"
- Write detailed specs upfront to eliminate ambiguity — vague specs produce vague code

**Example triggers for plan mode:**
- Adding a new route or DB table
- Any change touching `server/middleware/`, `server/db/`, or `src/app/routes.jsx`
- Multi-file refactors
- Anything the user describes as "set up", "architect", or "redesign"

---

## 2. Subagent Strategy

Use subagents liberally to keep the main context window clean and focused.

- **One task per subagent** — focused execution, no context bleed
- Offload to subagents: research, package verification, exploration of unfamiliar APIs, parallel analysis of multiple files
- For complex problems, throw more compute at it via subagents rather than reasoning in one long chain
- Main context should only hold the active plan and immediate implementation — everything else is subagent territory
- After a subagent returns, synthesize its findings before acting — don't blindly copy its output

**When to spawn a subagent:**
- "Does this npm package exist and what's its API?" → subagent
- "What are the security implications of this approach?" → subagent
- "Scan all route files for a specific pattern" → subagent
- Anything that requires reading 5+ files before deciding what to do

---

## 3. Self-Improvement Loop

After **any correction from the user**, immediately:

1. Update `tasks/lessons.md` with the pattern using the standard format
2. Write a concrete rule that prevents the same mistake — not a vague intention, a specific rule
3. Review `tasks/lessons.md` at the start of every new session for patterns relevant to the current task

**Format for lessons.md entries:**
```
### [YYYY-MM-DD] — Short title
**What happened:** What went wrong.
**Root cause:** Why it happened.
**Rule:** The concrete, actionable rule going forward.
```

The goal is a falling mistake rate over time. If the same class of mistake recurs, the rule wasn't specific enough — rewrite it.

---

## 4. Demand Elegance (Balanced)

For non-trivial changes, pause and ask: *"Is there a more elegant solution?"*

- If a fix feels hacky or like duct tape: step back and implement the proper solution — *"knowing everything I know now, what's the right way to do this?"*
- Refactor toward the elegant solution rather than patching around it
- **Skip this for simple, obvious fixes** — don't over-engineer a one-liner or a config change
- Elegance means: fewer moving parts, clearer intent, easier to delete later

**Heuristics for "is this hacky?"**
- Would I be embarrassed to show this to a senior engineer?
- Am I working around a problem instead of solving it?
- Will this create confusion for the next person reading it?
- Am I duplicating logic that already exists somewhere?

---

## 5. Autonomous Bug Fixing

When given a bug report, error message, or failing test: **just fix it.**

- Point at logs, error output, or failing tests → diagnose → resolve, in one flow
- Zero context-switching required from the user — don't ask "what would you like me to do about this?" when the error is clear
- Fix failing CI tests without being told how
- If the fix requires a decision with real trade-offs, present the options concisely then pick the best one unless told otherwise
- After fixing, briefly state what the root cause was and what changed — one short paragraph, no essay

**Do not:**
- Ask for permission to look at a log file that was already shared
- Propose 3 options when 1 is clearly correct
- Stop midway through a fix to ask clarifying questions unless the error is genuinely ambiguous

---

## 6. Verification Before Done

**Never mark a task complete without proving it works.**

Before saying "done" or "that should fix it":

- Run the relevant command, test, or check and show the output
- For API changes: show a curl or the relevant response
- For DB changes: confirm the migration ran and the schema matches
- For frontend changes: confirm the component renders without console errors
- Run `npm audit` in `server/` — fix any moderate+ severity findings before calling done
- Ask yourself: *"Would a staff engineer approve this PR?"*
  - Tests pass ✓
  - No regressions ✓
  - `npm audit` clean (no moderate+ vulnerabilities) ✓
  - Edge cases considered ✓
  - Error handling present ✓

If verification is blocked (e.g. need a running server), say so explicitly and describe exactly what the user should run to confirm it works.

---

## 7. Feature Changes — Test-First Discipline

**Every feature change, bug fix, new endpoint, or UI change follows this loop without exception. No shortcuts.**

### The mandatory loop

```
Read tests → Update tests → Run tests (expect failure) → Implement → Run tests (must pass) → Done
```

1. **Read existing tests first** — before touching any code, open `integration.test.js` and read every test section relevant to what's changing. Understand what is currently asserted and why.

2. **Update tests to match the new behaviour** — for every change made to backend OR frontend:
   - If a field is removed from an API response → remove or update assertions about that field
   - If a field is made optional → add a test proving omitting it succeeds and stores null
   - If a UI component no longer sends a field → ensure no test expects that field in the request body
   - If an endpoint changes its shape → update every test that hits that endpoint
   - Add new test cases for any new code paths or edge cases

3. **Run `npm test`** — confirm the new/modified tests fail for the expected reason before implementing. **Seeing a test fail correctly proves the test is real.**

4. **Implement the change** — write the cleanest implementation that makes the failing tests pass.

5. **Run `npm test` again** — **ALL 160+ tests must be green. Zero regressions. No exceptions.**

6. **If any test fails** — fix the code (not the test) until it passes. Only change a test assertion if the spec itself changed (e.g. a deliberate feature decision).

7. **Do not respond with "done" until step 5 has been executed and confirmed green.**

> ⚠️ **Hard rule:** Writing tests and not running them is the same as not writing tests. `npm test` must be run and the output must show PASS. If the tools are unavailable and tests cannot be run, say so explicitly — do not silently skip this step.

### The frontend ↔ backend sync rule

**Whenever a field is removed, renamed, or made optional anywhere in the stack, every layer must be updated in the same task:**

| Layer touched | What must also be updated |
|---|---|
| DB schema (column removed) | Migration + validate.js + route handler + **tests** |
| API response (field removed) | Route handler + **frontend components** that display it + **tests** |
| Frontend form (field removed) | validationSchemas.js + the component + **tests** that assert it was required |
| Backend validation (field made optional) | DB schema + route fallback logic + **tests** for the null case |

This project has already been caught by this more than once. The pattern to avoid: removing `primary_muscle_group` from the backend but leaving it in the frontend form, validation schema, and filter UI — then not updating the tests. **Changes are not done until all layers and all tests are in sync.**

### Test quality standards

Tests must be **specific and meaningful** — not just "status 200". Every test must:
- Assert the exact HTTP status code
- Assert at least one field of the response body
- Assert the resulting DB state where relevant (query the DB directly, don't trust the response alone)
- Cover the boundary/negative case alongside the happy path
- Use descriptive names: `TC-FEATURE-NNN · What it proves`

Tests must be **isolated** — test data uses `%_test@example.com` email pattern so `cleanDatabase()` catches everything. Never hardcode UUIDs. Never depend on data from outside the test run.

Tests must be **ordered correctly** — shared state (tokens, IDs) flows top-to-bottom. Document cross-section dependencies with a comment.

### When a feature changes
- Read the existing tests for that feature first — understand what's currently being asserted
- Update assertions to match the new expected behaviour
- Add new test cases for new code paths (e.g. optional field → test omitting it stores null)
- Remove or update test cases that no longer apply — dead tests are worse than no tests
- **Run the full suite, not just the affected section** — a change in one route often breaks assumptions elsewhere

### Frontend changes
Frontend changes don't have automated tests in this repo, but they still trigger the test loop:

1. Identify the exact user-visible failure (blank UI, wrong data, 4xx in network tab)
2. Check whether the frontend change affects what the backend receives — if a field is removed from a form, check whether any backend test asserts it was required
3. **Before writing the fix:** read any components or pages the fix links to or depends on
4. Fix it
5. **Run `npm test`** — confirm no backend regressions. Even a pure UI change can invalidate a backend test expectation.
6. State what a manual verification looks like: e.g. "open `/exercises`, click New Exercise — confirm no Muscle Group field appears in the form"

---

## 8. Security and Authentication

Every piece of code written for this repo must pass this checklist before being considered done.

### Secrets and credentials
- **No secrets in code** — all credentials, tokens, and API keys live in `.env` only
- `.env` is always in `.gitignore` — use `**/.env` to catch nested files
- `.env.example` contains only placeholder values, no real secrets
- Before any `git commit`, mentally scan for: passwords, tokens, connection strings with credentials, private keys

### Input handling
- **All user input is validated with Zod** before touching the database or business logic
- Parameterised queries only — never string-interpolate user input into SQL
- Whitelist enum values (status, role, metric_type) rather than passing raw query params to DB
- Validate UUID format on all `:id` route params before querying
- Clamp all pagination `limit` params (max 100) — never allow unbounded queries
- When documenting a minimum input length (e.g. search requires ≥ 2 chars), enforce it with `if (value.length < MIN)`, not `if (!value)` — they are not equivalent

### Rate limiting
- Auth endpoints (`/auth/login`, `/auth/register`): `authLimiter` — 10 req / 15 min per IP
- Media/presign endpoints: `mediaLimiter` — 30 req / min per IP
- All other API routes: `apiLimiter` — 200 req / min per IP
- Any new route group must be assessed for which limiter applies

### Passwords and tokens
- Passwords hashed with `bcrypt` at cost factor 12 minimum
- Always run `bcrypt.compare` even when the user is not found — prevents timing attacks
- JWT secret must be ≥ 32 characters, validated at server startup
- Never log passwords, tokens, or full request bodies containing sensitive fields

### Dependencies
- Run `npm audit` after every `npm install`
- Fix moderate+ severity vulnerabilities before merging
- Use `overrides` in `package.json` to force safe versions of transitive dependencies
- Verify new packages exist on npm before adding them: `npm info <package-name>`

### General
- `helmet()` must remain on the Express app — do not remove it
- Request body size is capped at `64kb` — do not raise this without justification
- Never expose stack traces to clients in production
- S3 keys must be scoped per user ID to prevent users overwriting each other's files
- Path traversal checks on any user-supplied file path or S3 key

---

## 9. Proactive Suggestions — Ask Before Acting

When Claude identifies a concrete improvement to developer experience, tooling, or workflow that would require changes outside the current task (config files, new dependencies, system settings, MCP servers, etc.), the pattern is:

**Spot it → Explain it → Ask permission → Wait for yes → Do it.**

### The rule
- **Never silently skip** a meaningful improvement just because it wasn't asked for
- **Never apply it unilaterally** — changes to system config, global settings, or anything outside the project codebase require explicit approval
- Present the suggestion clearly: what it is, what problem it solves, what the change would be
- Ask a single yes/no question: *"Would you like me to apply this?"*
- Only proceed after an affirmative answer

### What triggers this
- A tool or MCP server that would remove a recurring manual step
- A config change that would improve the development loop
- A dependency upgrade that would fix a known vulnerability
- Any change to files outside `/Users/bigkekker/Documents/Coding/mvp/` — always ask-first

### What does NOT trigger this
- Writing project code, tests, or config files inside the repo — proceed as normal
- Bug fixes explicitly requested by the user
- Obvious follow-on work within the current task scope

---

## Project Quick Reference

```
mvp/
├── src/                    # React frontend (Vite)
│   ├── app/                # Router + QueryClient
│   ├── features/           # auth, exercises, workouts, clients, progress, messaging
│   ├── components/layout/  # AppShell, MobileNav, Sidebar, RequireAuth
│   └── lib/                # api.js, utils.js, validationSchemas.js
├── server/                 # Express backend
│   ├── routes/             # auth, exercises, coach, client, messages, media
│   ├── middleware/         # auth.js, rateLimiter.js, validate.js
│   └── db/                 # pool.js, migrate.js
└── tasks/
    └── lessons.md          # ← update after every correction
```

**Run tests:**
```bash
cd /Users/bigkekker/Documents/Coding/mvp/server && npm test
```

**Start the project:**
```bash
# Terminal 1
pgstart
cd server && npm run dev

# Terminal 2
cd /Users/bigkekker/Documents/Coding/mvp && npm run dev
```

**DB access:**
```bash
psql "postgresql://bigkekker@localhost:5432/fittrack?host=/usr/local/var/run/postgresql"
```
