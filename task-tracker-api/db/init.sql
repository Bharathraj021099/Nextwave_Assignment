-- =============================================================================
-- Task Tracker — Database Schema
-- =============================================================================
-- Design decisions:
--   1. UUID primary keys (v4) chosen over serial integers to:
--        a) avoid sequential ID enumeration attacks
--        b) allow IDs to be generated client-side (useful for idempotent ops)
--   2. org_id is present on every table as a first-class column.
--      All queries are scoped by (id, org_id) to enforce multi-tenancy at the
--      DB layer — a single missed WHERE clause in application code cannot leak
--      data across organisations.
--   3. Composite indexes on (org_id, <filter column>) mirror the most common
--      query patterns. The leading org_id is intentional: scoping to an org
--      is always the first predicate applied.
--   4. status uses a TEXT column with a CHECK constraint rather than a custom
--      ENUM type. This avoids the pain of ALTER TYPE … ADD VALUE which requires
--      a full table rewrite in older Postgres versions and cannot be rolled back
--      inside a transaction.
-- =============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid() fallback

-- ─── organizations ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name          TEXT        NOT NULL,
    email         TEXT        NOT NULL,
    password_hash TEXT        NOT NULL,
    role          TEXT        NOT NULL DEFAULT 'MEMBER'
                              CHECK (role IN ('ADMIN', 'MANAGER', 'MEMBER')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users (email);

-- Index for fetching all users in an org (ADMIN user-management screen)
CREATE INDEX IF NOT EXISTS users_org_id_idx ON users (org_id);

-- ─── refresh_tokens ───────────────────────────────────────────────────────────
-- Stores hashed refresh tokens only — the raw token never persists to disk.
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT        NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS refresh_tokens_hash_idx ON refresh_tokens (token_hash);
CREATE        INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id);

-- ─── projects ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    description TEXT,
    created_by  UUID        NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS projects_org_id_idx ON projects (org_id);

-- ─── tasks ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id  UUID        REFERENCES projects(id) ON DELETE SET NULL,
    title       TEXT        NOT NULL,
    description TEXT,
    priority    TEXT        NOT NULL DEFAULT 'MEDIUM'
                            CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
    status      TEXT        NOT NULL DEFAULT 'TODO'
                            CHECK (status IN ('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'BLOCKED')),
    assignee_id UUID        REFERENCES users(id) ON DELETE SET NULL,
    due_date    TIMESTAMPTZ,
    created_by  UUID        NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary filter: all tasks for an assignee in an org (most common query,
-- also the axis along which we partition the Redis cache)
CREATE INDEX IF NOT EXISTS tasks_org_assignee_idx ON tasks (org_id, assignee_id);

-- Secondary filters used in list endpoint
CREATE INDEX IF NOT EXISTS tasks_org_status_idx   ON tasks (org_id, status);
CREATE INDEX IF NOT EXISTS tasks_org_priority_idx ON tasks (org_id, priority);
CREATE INDEX IF NOT EXISTS tasks_org_project_idx  ON tasks (org_id, project_id);

-- Due-date ordering and overdue detection
CREATE INDEX IF NOT EXISTS tasks_due_date_idx     ON tasks (due_date) WHERE due_date IS NOT NULL;

-- ─── Triggers: keep updated_at current ───────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['organizations', 'users', 'projects', 'tasks'] LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%s_updated_at
             BEFORE UPDATE ON %s
             FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
            t, t
        );
    END LOOP;
EXCEPTION WHEN duplicate_object THEN NULL;  -- idempotent
END;
$$;
