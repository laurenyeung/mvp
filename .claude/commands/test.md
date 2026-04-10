Run the full test-first discipline loop against the current changes.

## Loop

1. Read every test section in `integration.test.js` that touches the changed route/feature
2. Update test assertions to match the new behaviour before writing implementation code
3. Run `npm test` — confirm new/changed tests fail for the expected reason
4. Implement the change
5. Run `npm test` again — ALL tests must be green. Zero regressions.
6. If any test fails, fix the code (not the test) unless the spec deliberately changed

## Quality standards

Every test must:
- Assert the exact HTTP status code
- Assert at least one response body field
- Query the DB directly to assert state (don't trust the response alone)
- Cover the happy path AND at least one boundary/failure case
- Be named: `TC-FEATURE-NNN · What it proves`

## Isolation rules

- Test data emails follow `%_test@example.com` so `cleanDatabase()` catches them
- Never hardcode UUIDs
- Never depend on data from outside the test run
- Shared state (cookies, IDs) flows top-to-bottom within sections; document cross-section dependencies with a comment

## Cross-layer sync

If a field is removed, renamed, or made optional:

| Layer touched | Must also update |
|---|---|
| DB schema (column removed) | Migration + validate.js + route handler + tests |
| API response (field removed) | Route handler + frontend components + tests |
| Frontend form (field removed) | validationSchemas.js + component + tests |
| Backend validation (field optional) | DB schema + route fallback + null-case test |

## Frontend changes

No automated frontend tests exist, but still:

1. Identify the exact user-visible failure (blank UI, wrong data, 4xx in network tab)
2. Check if the frontend change affects what the backend receives — update any affected test assertions
3. Read all components the fix touches before writing the fix
4. Run `npm test` — confirm no backend regressions
5. State the manual verification step: e.g. "open /exercises → click New Exercise → confirm X"
