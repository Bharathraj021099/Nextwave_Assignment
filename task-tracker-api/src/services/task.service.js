const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const cache = require('./cache.service');
const ApiError = require('../utils/ApiError');

// ─── Status transition graph ───────────────────────────────────────────────
//
//   TODO ──► IN_PROGRESS ──► IN_REVIEW ──► DONE
//     └──► BLOCKED ◄──┘             └──► BLOCKED
//
// Design decision: BLOCKED is an escape hatch reachable from any non-terminal
// state. From BLOCKED a task can return to IN_PROGRESS (or back to TODO if it
// was never started). DONE is a terminal state with no outbound transitions.
//
const VALID_TRANSITIONS = {
  TODO: ['IN_PROGRESS', 'BLOCKED'],
  IN_PROGRESS: ['IN_REVIEW', 'BLOCKED'],
  IN_REVIEW: ['DONE', 'BLOCKED'],
  BLOCKED: ['TODO', 'IN_PROGRESS'],
  DONE: [],
};

function assertValidTransition(from, to) {
  const allowed = VALID_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw ApiError.badRequest(
      `Invalid status transition: '${from}' → '${to}'. ` +
        `Allowed transitions from '${from}': [${allowed.join(', ') || 'none'}]`,
      'INVALID_TRANSITION',
    );
  }
}

// ─── List ──────────────────────────────────────────────────────────────────

async function listTasks({ orgId, callerId, callerRole, page, limit, status, priority, assigneeId, projectId }) {
  // MEMBERs can only see tasks assigned to them
  const effectiveAssigneeId = callerRole === 'MEMBER' ? callerId : assigneeId;

  // Build the cache key with the effective query
  const cacheQuery = { page, limit, status, priority, assigneeId: effectiveAssigneeId, projectId };
  const cacheKey = cache.buildKey(orgId, effectiveAssigneeId, cacheQuery);

  const cached = await cache.getCache(cacheKey);
  if (cached) return { ...cached, fromCache: true };

  const conditions = ['t.org_id = $1'];
  const values = [orgId];
  let idx = 2;

  if (effectiveAssigneeId) { conditions.push(`t.assignee_id = $${idx++}`); values.push(effectiveAssigneeId); }
  if (status)               { conditions.push(`t.status = $${idx++}`);      values.push(status); }
  if (priority)             { conditions.push(`t.priority = $${idx++}`);    values.push(priority); }
  if (projectId)            { conditions.push(`t.project_id = $${idx++}`);  values.push(projectId); }

  const where = conditions.join(' AND ');
  const offset = (page - 1) * limit;

  const [tasksResult, countResult] = await Promise.all([
    db.query(
      `SELECT t.*,
              u.name  AS assignee_name,
              u.email AS assignee_email,
              p.name  AS project_name
       FROM tasks t
       LEFT JOIN users   u ON u.id = t.assignee_id
       LEFT JOIN projects p ON p.id = t.project_id
       WHERE ${where}
       ORDER BY
         CASE t.priority WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
         t.due_date ASC NULLS LAST,
         t.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      [...values, limit, offset],
    ),
    db.query(`SELECT COUNT(*) FROM tasks t WHERE ${where}`, values),
  ]);

  const payload = {
    tasks: tasksResult.rows,
    pagination: {
      total: parseInt(countResult.rows[0].count, 10),
      page,
      limit,
      totalPages: Math.ceil(countResult.rows[0].count / limit),
    },
  };

  await cache.setCache(cacheKey, payload);
  return payload;
}

// ─── Create ────────────────────────────────────────────────────────────────

async function createTask({ orgId, createdBy, title, description, priority, assigneeId, projectId, dueDate }) {
  if (assigneeId) await assertUserInOrg(assigneeId, orgId);
  if (projectId)  await assertProjectInOrg(projectId, orgId);

  const result = await db.query(
    `INSERT INTO tasks (id, org_id, project_id, title, description, priority, assignee_id, due_date, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [uuidv4(), orgId, projectId ?? null, title, description ?? null, priority ?? 'MEDIUM',
     assigneeId ?? null, dueDate ?? null, createdBy],
  );

  await cache.invalidateOnTaskMutation(orgId, null, assigneeId);
  return result.rows[0];
}

// ─── Get by ID ─────────────────────────────────────────────────────────────

async function getTaskById({ orgId, taskId, callerId, callerRole }) {
  const result = await db.query(
    `SELECT t.*,
            u.name  AS assignee_name,
            u.email AS assignee_email,
            p.name  AS project_name
     FROM tasks t
     LEFT JOIN users    u ON u.id = t.assignee_id
     LEFT JOIN projects p ON p.id = t.project_id
     WHERE t.id = $1 AND t.org_id = $2`,
    [taskId, orgId],
  );

  if (result.rows.length === 0) throw ApiError.notFound('Task');

  const task = result.rows[0];
  if (callerRole === 'MEMBER' && task.assignee_id !== callerId) {
    throw ApiError.forbidden('Members can only view tasks assigned to them');
  }
  return task;
}

// ─── Update ────────────────────────────────────────────────────────────────

async function updateTask({ orgId, taskId, callerId, callerRole, updates }) {
  const existing = await getTaskById({ orgId, taskId, callerId, callerRole });

  // MEMBERs may only update their own assigned tasks (and even then only
  // the allowed fields). Field restriction for MEMBER is enforced by
  // keeping the route's body schema minimal; the service just checks ownership.
  if (callerRole === 'MEMBER' && existing.assignee_id !== callerId) {
    throw ApiError.forbidden('Members can only update tasks assigned to them');
  }

  const prevAssigneeId = existing.assignee_id;
  const newAssigneeId  = updates.assigneeId !== undefined ? updates.assigneeId : prevAssigneeId;

  if (updates.assigneeId !== undefined && updates.assigneeId !== null) {
    await assertUserInOrg(updates.assigneeId, orgId);
  }

  const fields = [];
  const values = [];
  let idx = 1;

  if (updates.title       !== undefined) { fields.push(`title = $${idx++}`);       values.push(updates.title); }
  if (updates.description !== undefined) { fields.push(`description = $${idx++}`); values.push(updates.description); }
  if (updates.priority    !== undefined) { fields.push(`priority = $${idx++}`);    values.push(updates.priority); }
  if (updates.assigneeId  !== undefined) { fields.push(`assignee_id = $${idx++}`); values.push(updates.assigneeId); }
  if (updates.dueDate     !== undefined) { fields.push(`due_date = $${idx++}`);    values.push(updates.dueDate); }

  if (fields.length === 0) throw ApiError.badRequest('No valid fields to update');

  fields.push(`updated_at = NOW()`);
  values.push(taskId, orgId);

  const result = await db.query(
    `UPDATE tasks SET ${fields.join(', ')}
     WHERE id = $${idx++} AND org_id = $${idx} RETURNING *`,
    values,
  );

  await cache.invalidateOnTaskMutation(orgId, prevAssigneeId, newAssigneeId);
  return result.rows[0];
}

// ─── Update status ─────────────────────────────────────────────────────────

async function updateStatus({ orgId, taskId, callerId, callerRole, newStatus }) {
  const result = await db.query(
    'SELECT * FROM tasks WHERE id = $1 AND org_id = $2',
    [taskId, orgId],
  );
  if (result.rows.length === 0) throw ApiError.notFound('Task');

  const task = result.rows[0];

  // Only the assignee or a MANAGER/ADMIN may advance the status
  const isAssignee = task.assignee_id === callerId;
  const canAdvance = isAssignee || callerRole === 'MANAGER' || callerRole === 'ADMIN';
  if (!canAdvance) {
    throw ApiError.forbidden('Only the assignee or a Manager/Admin can change task status');
  }

  assertValidTransition(task.status, newStatus);

  const updated = await db.query(
    `UPDATE tasks SET status = $1, updated_at = NOW()
     WHERE id = $2 AND org_id = $3 RETURNING *`,
    [newStatus, taskId, orgId],
  );

  await cache.invalidateOnTaskMutation(orgId, task.assignee_id, task.assignee_id);
  return updated.rows[0];
}

// ─── Delete ────────────────────────────────────────────────────────────────

async function deleteTask({ orgId, taskId }) {
  const existing = await db.query(
    'SELECT assignee_id FROM tasks WHERE id = $1 AND org_id = $2',
    [taskId, orgId],
  );
  if (existing.rows.length === 0) throw ApiError.notFound('Task');

  const { assignee_id } = existing.rows[0];
  await db.query('DELETE FROM tasks WHERE id = $1 AND org_id = $2', [taskId, orgId]);
  await cache.invalidateOnTaskMutation(orgId, assignee_id, null);
}

// ─── Guard helpers ─────────────────────────────────────────────────────────

async function assertUserInOrg(userId, orgId) {
  const r = await db.query('SELECT id FROM users WHERE id = $1 AND org_id = $2', [userId, orgId]);
  if (r.rows.length === 0) throw ApiError.badRequest('Assignee does not belong to this organisation', 'INVALID_ASSIGNEE');
}

async function assertProjectInOrg(projectId, orgId) {
  const r = await db.query('SELECT id FROM projects WHERE id = $1 AND org_id = $2', [projectId, orgId]);
  if (r.rows.length === 0) throw ApiError.badRequest('Project does not belong to this organisation', 'INVALID_PROJECT');
}

module.exports = { listTasks, createTask, getTaskById, updateTask, updateStatus, deleteTask };
