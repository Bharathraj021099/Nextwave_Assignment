const router = require('express').Router();
const controller = require('../controllers/project.controller');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const {
  createProjectSchema,
  updateProjectSchema,
  projectIdParamSchema,
} = require('../validators/project.validator');

router.use(authenticate);

/**
 * GET  /projects   — visible to all roles
 * POST /projects   — ADMIN or MANAGER only
 */
router
  .route('/')
  .get(controller.listProjects)
  .post(authorize('ADMIN', 'MANAGER'), validate(createProjectSchema), controller.createProject);

/**
 * GET    /projects/:id  — all roles
 * PATCH  /projects/:id  — ADMIN or MANAGER
 * DELETE /projects/:id  — ADMIN only
 */
router.get('/:id', validate(projectIdParamSchema), controller.getProjectById);

router.patch(
  '/:id',
  authorize('ADMIN', 'MANAGER'),
  validate(updateProjectSchema),
  controller.updateProject,
);

router.delete(
  '/:id',
  authorize('ADMIN'),
  validate(projectIdParamSchema),
  controller.deleteProject,
);

module.exports = router;
