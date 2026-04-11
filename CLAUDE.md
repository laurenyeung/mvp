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

Read → test → implement → verify. No exceptions.

- Read existing tests before touching any code
- Write/update tests before implementing — see the new test fail first (proves it's real)
- Run `npm test` — all tests must be green before calling done
- Frontend-only changes still require `npm test` to catch backend regressions
- Cross-layer rule: if a field is removed/renamed anywhere in the stack, every layer (DB, route, frontend, tests) must be updated in the same task

> ⚠️ Writing tests and not running them is the same as not writing tests. If tools are unavailable, say so explicitly — never silently skip.

> Full runbook, quality standards, and cross-layer sync table: `/test`

---

## 8. Security

Every change must pass this baseline before merging:

- No secrets in code — `.env` only, never committed
- All user input validated with Zod before touching DB or business logic
- Parameterised queries only — never interpolate user input into SQL
- `helmet()` stays on, body cap stays at `64kb`
- Run `npm audit` after every `npm install` — fix moderate+ before merging

> Full audit checklist for a route, PR, or file: `/security`

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
