const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { env } = require('../config/env');
const ApiError = require('../utils/ApiError');

const SAFE_COLUMNS = 'id, org_id, name, email, role, created_at';

/**
 * List all users within the caller's organisation.
 */
async function listUsers({ orgId, page, limit }) {
  const offset = (page - 1) * limit;

  const [usersResult, countResult] = await Promise.all([
    db.query(
      `SELECT ${SAFE_COLUMNS} FROM users
       WHERE org_id = $1 ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [orgId, limit, offset],
    ),
    db.query('SELECT COUNT(*) FROM users WHERE org_id = $1', [orgId]),
  ]);

  return {
    users: usersResult.rows,
    pagination: {
      total: parseInt(countResult.rows[0].count, 10),
      page,
      limit,
      totalPages: Math.ceil(countResult.rows[0].count / limit),
    },
  };
}

/**
 * Add a new user to an existing organisation (ADMIN only).
 */
async function inviteUser({ orgId, name, email, password, role }) {
  const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    throw ApiError.conflict('An account with that email already exists', 'EMAIL_TAKEN');
  }

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  const result = await db.query(
    `INSERT INTO users (id, org_id, name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${SAFE_COLUMNS}`,
    [uuidv4(), orgId, name, email, passwordHash, role],
  );
  return result.rows[0];
}

/**
 * Change a user's role (ADMIN only; cannot demote yourself).
 */
async function updateRole({ orgId, callerId, targetUserId, role }) {
  if (callerId === targetUserId) {
    throw ApiError.badRequest('You cannot change your own role', 'SELF_ROLE_CHANGE');
  }

  const result = await db.query(
    `UPDATE users SET role = $1
     WHERE id = $2 AND org_id = $3
     RETURNING ${SAFE_COLUMNS}`,
    [role, targetUserId, orgId],
  );
  if (result.rows.length === 0) throw ApiError.notFound('User');
  return result.rows[0];
}

/**
 * Remove a user from the organisation (ADMIN only; cannot remove yourself).
 */
async function removeUser({ orgId, callerId, targetUserId }) {
  if (callerId === targetUserId) {
    throw ApiError.badRequest('You cannot remove yourself', 'SELF_REMOVAL');
  }

  const result = await db.query(
    'DELETE FROM users WHERE id = $1 AND org_id = $2 RETURNING id',
    [targetUserId, orgId],
  );
  if (result.rows.length === 0) throw ApiError.notFound('User');
}

/**
 * Fetch a single user by ID, scoped to the caller's org.
 */
async function getUserById({ orgId, userId }) {
  const result = await db.query(
    `SELECT ${SAFE_COLUMNS} FROM users WHERE id = $1 AND org_id = $2`,
    [userId, orgId],
  );
  if (result.rows.length === 0) throw ApiError.notFound('User');
  return result.rows[0];
}

module.exports = { listUsers, inviteUser, updateRole, removeUser, getUserById };
