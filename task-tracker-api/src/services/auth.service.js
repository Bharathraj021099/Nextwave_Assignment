const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { env } = require('../config/env');
const { buildTokenPair, verifyRefreshToken, hashToken } = require('../utils/tokens');
const ApiError = require('../utils/ApiError');

/**
 * Register the first user in a new organisation.
 * The first user is always granted the ADMIN role.
 */
async function register({ name, email, password, orgName }) {
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  const orgId = uuidv4();
  const userId = uuidv4();

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const orgResult = await client.query(
      'INSERT INTO organizations (id, name) VALUES ($1, $2) RETURNING *',
      [orgId, orgName],
    );

    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      throw ApiError.conflict('An account with that email already exists', 'EMAIL_TAKEN');
    }

    const userResult = await client.query(
      `INSERT INTO users (id, org_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5, 'ADMIN') RETURNING id, org_id, name, email, role`,
      [userId, orgId, name, email, passwordHash],
    );

    await client.query('COMMIT');

    const user = userResult.rows[0];
    const { accessToken, refreshToken } = buildTokenPair(user);
    await storeRefreshToken(userId, refreshToken);

    return {
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      organization: { id: orgResult.rows[0].id, name: orgResult.rows[0].name },
      accessToken,
      refreshToken,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Authenticate a user and return a fresh token pair.
 */
async function login({ email, password }) {
  const result = await db.query(
    'SELECT id, org_id, name, email, password_hash, role FROM users WHERE email = $1',
    [email],
  );
  const user = result.rows[0];

  // Use constant-time comparison even on "not found" to resist timing attacks
  const hash = user?.password_hash ?? '$2b$12$invalidHashToPreventTimingAttack';
  const valid = await bcrypt.compare(password, hash);

  if (!user || !valid) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const { accessToken, refreshToken } = buildTokenPair(user);
  await storeRefreshToken(user.id, refreshToken);

  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role, orgId: user.org_id },
    accessToken,
    refreshToken,
  };
}

/**
 * Rotate refresh tokens: validate the incoming token, revoke it,
 * and issue a fresh pair. This is the standard refresh-token-rotation
 * pattern that limits the window of a stolen token.
 */
async function refreshTokens(incomingRefreshToken) {
  let decoded;
  try {
    decoded = verifyRefreshToken(incomingRefreshToken);
  } catch {
    throw ApiError.unauthorized('Refresh token is invalid or expired');
  }

  const tokenHash = hashToken(incomingRefreshToken);
  const stored = await db.query(
    `SELECT rt.id, u.id AS user_id, u.org_id, u.email, u.role
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = $1 AND rt.expires_at > NOW()`,
    [tokenHash],
  );

  if (stored.rows.length === 0) {
    // Token reuse detected — revoke ALL tokens for this user (breach response)
    await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [decoded.sub]);
    throw ApiError.unauthorized('Refresh token has already been used or revoked');
  }

  const { user_id, org_id, email, role } = stored.rows[0];

  // Revoke the consumed token
  await db.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);

  const user = { id: user_id, org_id, email, role };
  const { accessToken, refreshToken: newRefreshToken } = buildTokenPair(user);
  await storeRefreshToken(user_id, newRefreshToken);

  return { accessToken, refreshToken: newRefreshToken };
}

/**
 * Invalidate a refresh token on explicit logout.
 */
async function logout(refreshToken) {
  const tokenHash = hashToken(refreshToken);
  await db.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function storeRefreshToken(userId, token) {
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_EXPIRES_IN_MS);
  await db.query(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [uuidv4(), userId, tokenHash, expiresAt],
  );
}

module.exports = { register, login, refreshTokens, logout };
