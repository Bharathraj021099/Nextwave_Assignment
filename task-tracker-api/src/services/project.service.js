const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const ApiError = require('../utils/ApiError');

async function listProjects({ orgId }) {
  const result = await db.query(
    'SELECT * FROM projects WHERE org_id = $1 ORDER BY created_at DESC',
    [orgId],
  );
  return result.rows;
}

async function createProject({ orgId, name, description, createdBy }) {
  const result = await db.query(
    `INSERT INTO projects (id, org_id, name, description, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [uuidv4(), orgId, name, description ?? null, createdBy],
  );
  return result.rows[0];
}

async function getProjectById({ orgId, projectId }) {
  const result = await db.query(
    'SELECT * FROM projects WHERE id = $1 AND org_id = $2',
    [projectId, orgId],
  );
  if (result.rows.length === 0) throw ApiError.notFound('Project');
  return result.rows[0];
}

async function updateProject({ orgId, projectId, updates }) {
  const fields = [];
  const values = [];
  let idx = 1;

  if (updates.name !== undefined) { fields.push(`name = $${idx++}`); values.push(updates.name); }
  if (updates.description !== undefined) { fields.push(`description = $${idx++}`); values.push(updates.description); }

  if (fields.length === 0) throw ApiError.badRequest('No valid fields to update');

  fields.push(`updated_at = NOW()`);
  values.push(projectId, orgId);

  const result = await db.query(
    `UPDATE projects SET ${fields.join(', ')}
     WHERE id = $${idx++} AND org_id = $${idx} RETURNING *`,
    values,
  );
  if (result.rows.length === 0) throw ApiError.notFound('Project');
  return result.rows[0];
}

async function deleteProject({ orgId, projectId }) {
  const result = await db.query(
    'DELETE FROM projects WHERE id = $1 AND org_id = $2 RETURNING id',
    [projectId, orgId],
  );
  if (result.rows.length === 0) throw ApiError.notFound('Project');
}

module.exports = { listProjects, createProject, getProjectById, updateProject, deleteProject };
