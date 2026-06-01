const ApiError = require('../utils/ApiError');

/**
 * RBAC is enforced exclusively at the middleware level — controllers never
 * check req.user.role directly.
 *
 * Usage:
 *   router.delete('/:id', authenticate, authorize('ADMIN'), deleteUser)
 *   router.patch('/:id', authenticate, authorize('ADMIN', 'MANAGER'), updateTask)
 */
function authorize(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized());
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(
        ApiError.forbidden(
          `Role '${req.user.role}' is not permitted to perform this action. ` +
            `Required: ${allowedRoles.join(' or ')}.`,
        ),
      );
    }
    next();
  };
}

/**
 * Checks that the authenticated user belongs to the same organisation
 * as the resource being accessed. Attach orgId to the resource first
 * via a prior middleware / service call if needed.
 *
 * For routes where the orgId is extracted from a body/param we rely on
 * the service layer to enforce the boundary instead.
 */
function sameOrg(req, _res, next) {
  if (!req.user) return next(ApiError.unauthorized());
  // Services always scope queries to req.user.orgId — this is a belt-and-
  // suspenders guard for any route that exposes an explicit orgId param.
  if (req.params.orgId && req.params.orgId !== req.user.orgId) {
    return next(ApiError.forbidden('Cross-organisation access is not allowed'));
  }
  next();
}

module.exports = { authorize, sameOrg };
