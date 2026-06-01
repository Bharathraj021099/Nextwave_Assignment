const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { env } = require('../config/env');

/**
 * Sign a short-lived access token.
 */
function signAccessToken(payload) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    issuer: 'task-tracker',
  });
}

/**
 * Sign a long-lived refresh token.
 */
function signRefreshToken(payload) {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    issuer: 'task-tracker',
  });
}

/**
 * Verify and decode an access token.
 */
function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'task-tracker' });
}

/**
 * Verify and decode a refresh token.
 */
function verifyRefreshToken(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, { issuer: 'task-tracker' });
}

/**
 * SHA-256 hash a token string for safe DB storage.
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Build the token pair (access + refresh) for a user.
 */
function buildTokenPair(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    orgId: user.org_id,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken({ sub: user.id });
  return { accessToken, refreshToken };
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
  buildTokenPair,
};
