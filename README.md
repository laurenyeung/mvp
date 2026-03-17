# FitTrack MVP

A mobile-first personal trainer web app. Coaches build workout templates and assign them to clients. Clients log sessions, upload form videos, and track progress metrics. Built with React + Vite on the frontend and Express + PostgreSQL on the backend.

---

## Prerequisites

- Node.js 20+
- PostgreSQL 15+

---

## 1 — Database

```bash
# Create the database
createdb fittrack

# Copy and fill in env vars
cp server/.env.example server/.env
# Edit server/.env — set DATABASE_URL and JWT_SECRET at minimum

# Run migrations (creates all 16 tables)
cd server
npm install
npm run migrate
```

---

## 2 — Backend

```bash
cd server
npm run dev
# API running at http://localhost:4000
```

---

## 3 — Frontend

```bash
# From the project root
npm install
npm run dev
# App running at http://localhost:3000
```

The Vite dev server proxies `/api` requests to `http://localhost:4000` automatically.

---

## Project Structure

```
mvp/
├── index.html
├── package.json            # Frontend deps
├── vite.config.js
├── tailwind.config.js
├── src/
│   ├── app/
│   │   ├── routes.jsx      # All role-based routes
│   │   └── queryClient.js
│   ├── lib/
│   │   ├── api.js          # Axios + all API modules
│   │   ├── utils.js
│   │   ├── validationSchemas.js
│   │   └── useMediaQuery.js
│   ├── components/
│   │   └── layout/
│   │       ├── AppShell.jsx      # Responsive shell
│   │       ├── MobileNav.jsx     # Bottom tab bar
│   │       ├── Sidebar.jsx       # Desktop left nav
│   │       ├── RequireAuth.jsx
│   │       └── RoleRedirect.jsx
│   └── features/
│       ├── auth/           # Login, Register, Zustand store
│       ├── exercises/      # Library + create modal
│       ├── workouts/       # Builder, logger, today, history, assign
│       ├── clients/        # Roster + detail
│       ├── progress/       # Metrics + Recharts line chart
│       └── messaging/      # Split-pane thread + composer
└── server/
    ├── index.js            # Express app entry
    ├── package.json
    ├── .env.example
    ├── db/
    │   ├── pool.js         # pg Pool + transaction helper
    │   └── migrate.js      # Full schema (all 16 tables)
    ├── middleware/
    │   └── auth.js         # JWT requireAuth + requireRole
    └── routes/
        ├── auth.js         # register, login, me
        ├── exercises.js    # Full CRUD
        ├── coach.js        # Templates, assignment, client roster
        ├── client.js       # Today, log, progress
        ├── messages.js     # Threads + send
        └── media.js        # S3 presign stubs
```

---

## Roles & Routing

| Role   | Landing page       | Key flows |
|--------|--------------------|-----------|
| COACH  | `/coach/clients`   | Build templates → assign to client → review logs |
| CLIENT | `/client/today`    | View today's workout → log sets → track progress |

---

## API Overview

All endpoints live at `/api/v1/`. Auth uses `Authorization: Bearer <jwt>`.

| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | /auth/register | — | Create account |
| POST | /auth/login | — | Get JWT |
| GET | /auth/me | any | Current user |
| GET | /exercises | any | List (public + own) |
| POST | /exercises | COACH | Create exercise |
| GET | /coach/templates | COACH | List templates |
| POST | /coach/templates | COACH | Create template |
| PUT | /coach/templates/:id | COACH | Update + replace exercises |
| DELETE | /coach/templates/:id | COACH | Soft delete |
| GET | /coach/clients | COACH | Client roster |
| GET | /coach/clients/:id | COACH | Client detail |
| GET | /coach/clients/:id/workouts | COACH | Client's workouts |
| POST | /coach/workouts/assign | COACH | Assign template → client |
| PATCH | /coach/workouts/:id | COACH | Update scheduled workout |
| DELETE | /coach/workouts/:id | COACH | Delete (SCHEDULED only) |
| GET | /client/workouts/today | CLIENT | Today's workout |
| GET | /client/workouts | CLIENT | Workout history |
| POST | /client/workouts/:id/log | CLIENT | Log session (idempotent) |
| GET | /client/progress | CLIENT | Progress metrics |
| POST | /client/progress | CLIENT | Add metric entry |
| GET | /messages/threads | any | Thread list |
| GET | /messages/threads/:id | any | Messages (cursor paged) |
| POST | /messages/send | any | Send message |
| POST | /media/presign | any | Get S3 presigned upload URL |

---

## Media Uploads (S3)

The presign flow keeps video files off your API server:

1. `POST /media/presign` → get `{ upload_url, s3_key }`
2. `PUT {upload_url}` with raw file bytes (direct to S3)
3. Register: `POST /client/exercise-logs/:id/media` with `{ s3_key }`

For local dev the presign route returns mock URLs. To activate real S3, fill in `AWS_*` vars in `server/.env` and uncomment the AWS SDK block in `server/routes/media.js`.

---

## Implementation Roadmap (from PRD)

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Auth, DB schema, JWT middleware | ✅ Done |
| 2 | Exercise library, workout templates | ✅ Done |
| 3 | Assignment, client today view, logging | ✅ Done |
| 4 | Progress tracking, client history | ✅ Done |
| 5 | Messaging, notifications, PWA polish | ✅ Done (notifications wired to DB, push pending) |
| 6+ | Recurring assignments, AI form feedback, billing | V2 |
