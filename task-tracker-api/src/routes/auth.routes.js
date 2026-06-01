const router = require('express').Router();
const controller = require('../controllers/auth.controller');
const validate = require('../middleware/validate');
const {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
} = require('../validators/auth.validator');

/**
 * @openapi
 * /auth/register:
 *   post:
 *     summary: Register a new user and organisation
 */
router.post('/register', validate(registerSchema), controller.register);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Authenticate and receive a token pair
 */
router.post('/login', validate(loginSchema), controller.login);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     summary: Rotate refresh token and receive a new token pair
 */
router.post('/refresh', validate(refreshSchema), controller.refresh);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     summary: Invalidate a refresh token
 */
router.post('/logout', validate(logoutSchema), controller.logout);

module.exports = router;
