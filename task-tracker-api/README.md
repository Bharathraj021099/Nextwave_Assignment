# Task Tracker API

A REST API for a team-based task tracker with authentication, RBAC, Redis caching, and containerised deployment.

---

## Quick Start

```bash
docker compose up
```

The API will be available at `http://localhost:3000` once all services are healthy (typically ~10 s).

> No manual configuration needed — the `docker-compose.yml` ships with sane defaults for local use. Change secrets before any real deployment.

---

## Stack

| Layer        | Technology                    |
|--------------|-------------------------------|
| Runtime      | Node.js 20 (LTS)              |
| Framework    | Express 4                     |
| Database     | PostgreSQL 16                 |
| Cache        | Redis 7                       |
| Auth         | JWT (jsonwebtoken)            |
| Validation   | Zod                           |
| Passwords    | bcryptjs (rounds = 12)        |
| Container    | Docker / docker compose v2    |

---

## API Overview

### Base URL
```
http://localhost:3000/api
```

### Authentication

All endpoints except `/auth/register`, `/auth/login`, `/auth/refresh`, and `/health` require a bearer token:

```
Authorization: Bearer <access_token>
```

Access tokens expire in **15 minutes**. Use `POST /api/auth/refresh` with your refresh token to rotate both tokens.

---

## Endpoints

### Auth

| Method | Path              | Description                          | Auth |
|--------|-------------------|--------------------------------------|------|
| POST   | /auth/register    | Create org + first ADMIN user        | ✗    |
| POST   | /auth/login       | Authenticate → token pair            | ✗    |
| POST   | /auth/refresh     | Rotate refresh token → new pair      | ✗    |
| POST   | /auth/logout      | Invalidate refresh token             | ✗    |

### Users

| Method | Path            | Description            | Roles           |
|--------|-----------------|------------------------|-----------------|
| GET    | /users          | List org members       | ALL             |
| POST   | /users          | Invite user            | ADMIN           |
| GET    | /users/:id      | Get user               | ALL             |
| PATCH  | /users/:id/role | Change role            | ADMIN           |
| DELETE | /users/:id      | Remove user            | ADMIN           |

### Projects

| Method | Path           | Description           | Roles           |
|--------|----------------|-----------------------|-----------------|
| GET    | /projects      | List org projects     | ALL             |
| POST   | /projects      | Create project        | ADMIN, MANAGER  |
| GET    | /projects/:id  | Get project           | ALL             |
| PATCH  | /projects/:id  | Update project        | ADMIN, MANAGER  |
| DELETE | /projects/:id  | Delete project        | ADMIN           |

### Tasks

| Method | Path               | Description            | Roles                      |
|--------|--------------------|------------------------|----------------------------|
| GET    | /tasks             | List tasks (paginated) | ALL (MEMBER sees own only) |
| POST   | /tasks             | Create task            | ADMIN, MANAGER             |
| GET    | /tasks/:id         | Get task               | ALL (MEMBER: own only)     |
| PATCH  | /tasks/:id         | Update task fields     | ADMIN, MANAGER, assignee   |
| PATCH  | /tasks/:id/status  | Transition status      | ADMIN, MANAGER, assignee   |
| DELETE | /tasks/:id         | Delete task            | ADMIN, MANAGER             |

#### List Tasks — query parameters

| Param       | Type   | Example              |
|-------------|--------|----------------------|
| page        | int    | `?page=2`            |
| limit       | int    | `?limit=25`          |
| status      | enum   | `?status=IN_PROGRESS`|
| priority    | enum   | `?priority=HIGH`     |
| assigneeId  | uuid   | `?assigneeId=<uuid>` |
| projectId   | uuid   | `?projectId=<uuid>`  |

---

## Roles & Permissions

```
ADMIN   — full access: users, projects, tasks within the org
MANAGER — projects + tasks; assign members; cannot manage users
MEMBER  — view and update only tasks assigned to them
```

RBAC is enforced **exclusively at the middleware layer** (`src/middleware/authorize.js`). Controllers never inspect `req.user.role`.

---

## Status Transitions

```
TODO ──► IN_PROGRESS ──► IN_REVIEW ──► DONE
  └──► BLOCKED ◄────┘           └──► BLOCKED
           └──► TODO / IN_PROGRESS
```

- `DONE` is a terminal state — no further transitions.
- `BLOCKED` is reachable from any non-terminal state.
- Only the **assignee** or a **MANAGER/ADMIN** may advance a task's status.

---

## Caching Strategy

**What is cached:** Task list query results, keyed per assignee.

**Cache key format:**
```
tasks:org:{orgId}:assignee:{assigneeId}:{queryFingerprint}
tasks:org:{orgId}:all:{queryFingerprint}      ← unfiltered queries
```
The `queryFingerprint` is the sorted JSON serialisation of the query parameters (page, limit, status, priority, projectId), ensuring different filter combinations never collide.

**TTL:** 5 minutes (configurable via `CACHE_TTL_SECONDS`).

**Invalidation strategy — targeted, not blanket:**

On any create / update / delete / status-change for a task:
1. All cache keys matching `tasks:org:{orgId}:all:*` are deleted (org-wide unfiltered lists).
2. Cache keys for the **previous assignee** (`tasks:org:{orgId}:assignee:{prevAssigneeId}:*`) are deleted.
3. If the assignee changed, cache keys for the **new assignee** are also deleted.

Deletion uses Redis `SCAN` + `DEL` in batches to avoid blocking Redis with a `KEYS` command.

This means a task update only busts the caches of the affected users, not the entire dataset — important when the org has many members.

If Redis is unavailable the application degrades gracefully: cache reads return `null` (miss), cache writes are no-ops. The API remains fully functional, just without caching.

---

## Database Design

### Schema

```
organizations  ─── users          (org_id FK)
           └──── projects        (org_id FK)
           └──── tasks           (org_id FK)

users ──────────── tasks.assignee_id (FK, ON DELETE SET NULL)
               └── tasks.created_by  (FK)
               └── refresh_tokens   (user_id FK)

projects ──────── tasks.project_id  (FK, ON DELETE SET NULL)
```

### Key Design Decision: `org_id` on every table

Every table carries `org_id` as a first-class column and every query is scoped by `(id, org_id)`. This enforces multi-tenancy at the database layer — a missing WHERE clause in application code cannot leak data across organisations. The performance cost (one extra column in indexes) is negligible compared to the security benefit.

### Indexes

| Index                         | Rationale                                              |
|-------------------------------|--------------------------------------------------------|
| `users(email)`                | Unique; login lookup                                   |
| `users(org_id)`               | Fetch all org members                                  |
| `tasks(org_id, assignee_id)`  | Primary list query; also the Redis cache axis          |
| `tasks(org_id, status)`       | Filter by status                                       |
| `tasks(org_id, priority)`     | Filter by priority                                     |
| `tasks(org_id, project_id)`   | Filter by project                                      |
| `tasks(due_date) WHERE NOT NULL` | Partial index for overdue / date-range queries      |
| `refresh_tokens(token_hash)`  | O(1) token lookup on every /refresh request            |

### Why TEXT + CHECK over a custom ENUM for status/priority?

PostgreSQL `ENUM` types require `ALTER TYPE … ADD VALUE` to extend, which in older Postgres versions cannot be executed inside a transaction and involves a full table rewrite. Using `TEXT + CHECK` keeps migrations simple and fully transactional.

---

## Error Response Format

All errors follow a consistent envelope:

```json
{
  "status": 400,
  "code": "VALIDATION_ERROR",
  "message": "due_date must be a future date"
}
```

Common codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INVALID_TRANSITION`, `INTERNAL_ERROR`.

---

## Security Notes

- Refresh tokens are stored **hashed** (SHA-256) — the raw token never persists to disk.
- Refresh-token rotation: consuming a token issues a new one and revokes the old. Detecting a reused token (theft signal) revokes **all** sessions for that user.
- Passwords use bcrypt with 12 rounds.
- Helmet sets security headers on all responses.
- Rate limiting: 20 req/15 min on auth routes, 300 req/15 min overall.
- The Docker container runs as a non-root user.

---

## Postman Collection

Import `postman_collection.json` into Postman. The Register and Login requests automatically store `accessToken` and `refreshToken` as collection variables.

---

## What I'd Improve Given More Time

1. **Integration tests** — at minimum: the full auth flow (register → refresh → logout), and a status-transition rejection test.
2. **Pagination cursor** — keyset pagination instead of OFFSET for large datasets where deep pages become slow.
3. **Audit log** — append-only table recording who changed what and when (useful for DONE task history).
4. **Email-based invite flow** — currently ADMIN creates accounts with a password; a real system would email a one-time invite link.
5. **Soft deletes** — `deleted_at` column instead of hard DELETE so task history is preserved.
6. **OpenAPI spec generation** — replace the hand-written Postman collection with auto-generated Swagger docs from route annotations.
7. **Connection pooling config** — externalise `Pool` settings (max, idle timeout) as env vars for tuning under load.
