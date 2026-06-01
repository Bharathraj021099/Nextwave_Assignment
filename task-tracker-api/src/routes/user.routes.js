const router = require('express').Router();
const controller = require('../controllers/user.controller');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const {
  inviteUserSchema,
  updateRoleSchema,
  userIdParamSchema,
  listUsersSchema,
} = require('../validators/user.validator');

// All user-management routes require authentication
router.use(authenticate);

/**
 * GET  /users       — list org members  (all roles)
 * POST /users       — invite new member (ADMIN only)
 */
router
  .route('/')
  .get(validate(listUsersSchema), controller.listUsers)
  .post(authorize('ADMIN'), validate(inviteUserSchema), controller.inviteUser);

/**
 * GET    /users/:id          — view any member in org (all roles)
 * PATCH  /users/:id/role     — change role             (ADMIN only)
 * DELETE /users/:id          — remove from org         (ADMIN only)
 */
router.get('/:id', validate(userIdParamSchema), controller.getUserById);

router.patch(
  '/:id/role',
  authorize('ADMIN'),
  validate(updateRoleSchema),
  controller.updateRole,
);

router.delete(
  '/:id',
  authorize('ADMIN'),
  validate(userIdParamSchema),
  controller.removeUser,
);

module.exports = router;
