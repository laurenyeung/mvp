# /package-research — Package Due Diligence

Use before adding or recommending any npm package, especially for security-sensitive categories (auth, CSRF, encryption, session, rate limiting, JWT).

---

## Checklist

### 1. Existence
```bash
npm info <package-name>
```
If 404, stop. Do not use or recommend.

### 2. Security-sensitive packages — static analysis compatibility
Before choosing any security library, check whether the static analysis tool in the repo recognizes it.

**CodeQL** — check the relevant `.ql` query for a hardcoded recognized list:
- CSRF: `csurf`, `tiny-csrf`, `lusca`, `fastify-csrf` — `csrf-csrf` is NOT on the list
- Auth middleware: `passport`, `express-jwt`, `jsonwebtoken`
- Session: `express-session`, `cookie-session`

Search pattern: look up `CWE-NNN` in CodeQL's JS/TS query library and grep for the library name.

If the package is not in the recognized list, use one that is — even if the unrecognized package is technically correct. CodeQL alerts will fire regardless of how correctly the middleware is wired up.

### 3. Maintenance health
- Last publish: `npm info <pkg> time.modified` — stale if > 18 months
- Weekly downloads: prefer packages with >10k/week for production security use
- Open CVEs: check `npm audit` output after install

### 4. API fit
Read the README and verify:
- The package's token delivery mechanism matches what you need (header vs body vs cookie)
- Required configuration (secret length, cookie options, etc.)
- Any env/framework constraints (e.g. requires signed cookieParser)

### 5. After install
```bash
npm audit
```
Must show 0 moderate+ vulnerabilities before proceeding.

---

## Common security library reference

| Category | Recognized / recommended | Notes |
|---|---|---|
| CSRF (Express) | `tiny-csrf`, `csurf`, `lusca` | `csrf-csrf` not in CodeQL list |
| JWT | `jsonwebtoken` | Verify with `jwt.verify`, never `decode` for auth |
| Sessions | `express-session` + `connect-pg-simple` | |
| Rate limiting | `express-rate-limit` | Set trust proxy in prod |
| Hashing | `bcrypt` | Cost factor ≥ 12 |
| Helmet | `helmet` | Never remove |
