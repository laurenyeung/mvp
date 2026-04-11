Perform a staff-engineer-level code review of the specified PR, diff, or files.

## Process

1. Read the full diff or listed files
2. Understand the intent before critiquing — what problem is this solving?
3. Run through each checklist below
4. Report findings grouped by severity: Critical → High → Medium → Low → Nit

## Correctness
- [ ] Does the implementation match the stated intent?
- [ ] Are there off-by-one errors, null dereferences, or unhandled edge cases?
- [ ] Are error paths handled (DB failure, unexpected input, missing records)?
- [ ] Does async code await correctly? Any unhandled promise rejections?

## Security (abbreviated — run `/security` for full audit)
- [ ] No secrets in code
- [ ] User input validated before hitting DB
- [ ] Ownership/auth checks present on mutating routes

## Test coverage
- [ ] New code paths have tests
- [ ] Tests assert DB state, not just response shape
- [ ] Removed/changed behaviour reflected in updated test assertions
- [ ] No dead tests left behind from the old behaviour

## Design and elegance
- [ ] Is there a simpler way to achieve the same result?
- [ ] Is logic duplicated that already exists elsewhere?
- [ ] Would a new engineer understand this without a comment?
- [ ] Does it follow existing project conventions (naming, error format, query patterns)?

## Cross-layer sync
- [ ] If a field was changed: is every layer (DB, route, frontend, tests) updated?
- [ ] If a route was added: is it wired into the router and assigned the correct rate limiter?

## Final verdict

**Approve / Request changes / Block** — with a one-line rationale.
