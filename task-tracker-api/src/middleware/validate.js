const { ZodError } = require('zod');
const ApiError = require('../utils/ApiError');

/**
 * Returns an Express middleware that validates req.body / req.query / req.params
 * against the provided Zod schemas.
 *
 * On validation failure it forwards a 400 ApiError with the first meaningful
 * Zod message so the consumer gets one clear error at a time.
 *
 * @param {{ body?: ZodSchema, query?: ZodSchema, params?: ZodSchema }} schemas
 */
function validate(schemas) {
  return (req, _res, next) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query);
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const first = err.errors[0];
        const field = first.path.join('.');
        const message = field ? `${field}: ${first.message}` : first.message;
        return next(new ApiError(400, 'VALIDATION_ERROR', message));
      }
      next(err);
    }
  };
}

module.exports = validate;
