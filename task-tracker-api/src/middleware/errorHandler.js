const { env } = require('../config/env');
const ApiError = require('../utils/ApiError');

/**
 * Central error handler. Produces the canonical error envelope:
 *   { status, code, message }
 *
 * Must be registered as the LAST middleware in app.js so all thrown /
 * next(err) errors funnel here.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  // Known operational errors
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      status: err.statusCode,
      code: err.code,
      message: err.message,
    });
  }

  // PostgreSQL unique-constraint violation
  if (err.code === '23505') {
    return res.status(409).json({
      status: 409,
      code: 'CONFLICT',
      message: 'A record with that value already exists',
    });
  }

  // PostgreSQL foreign-key violation
  if (err.code === '23503') {
    return res.status(400).json({
      status: 400,
      code: 'INVALID_REFERENCE',
      message: 'Referenced resource does not exist',
    });
  }

  // Unexpected error — log stack in non-production, hide details from client
  console.error('[ERROR]', err);

  return res.status(500).json({
    status: 500,
    code: 'INTERNAL_ERROR',
    message:
      env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : err.message,
    ...(env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}

module.exports = errorHandler;
