const { verifyAccessToken } = require('../utils/tokens');
const ApiError = require('../utils/ApiError');

/**
 * Extracts and verifies the JWT access token from the Authorization header.
 * Attaches the decoded payload to req.user on success.
 *
 * This runs on every protected route before any controller logic.
 */
function authenticate(req, _res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Missing or malformed Authorization header');
    }

    const token = authHeader.slice(7); // strip "Bearer "
    const decoded = verifyAccessToken(token);

    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      orgId: decoded.orgId,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(ApiError.unauthorized('Access token has expired'));
    }
    if (err.name === 'JsonWebTokenError') {
      return next(ApiError.unauthorized('Invalid access token'));
    }
    next(err);
  }
}

module.exports = authenticate;
