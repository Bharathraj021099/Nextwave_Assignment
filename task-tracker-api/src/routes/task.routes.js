const router = require('express').Router();
const controller = require('../controllers/task.controller');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const {
  createTaskSchema,
  updateTaskSchema,
  updateStatusSchema,
  taskIdParamSchema,
  listTasksSchema,
} = require('../validators/task.validator');

router.use(authenticate);

/**
 * GET  /tasks   — all roles (MEMBERs scoped to their assigned tasks in service)
 * POST /tasks   — ADMIN or MANAGER only
 */
router
  .route('/')
  .get(validate(listTasksSchema), controller.listTasks)
  .post(authorize('ADMIN', 'MANAGER'), validate(createTaskSchema), controller.createTask);

/**
 * GET    /tasks/:id         — all roles (MEMBER ownership enforced in service)
 * PATCH  /tasks/:id         — ADMIN, MANAGER, or the assigned MEMBER
 * DELETE /tasks/:id         — ADMIN or MANAGER only
 */
router.get('/:id', validate(taskIdParamSchema), controller.getTaskById);

// MEMBER can patch their own task fields; ownership check is in the service.
// We intentionally do NOT use authorize() here so MEMBERs can reach the handler.
// The service rejects them if they try to edit a task they don't own.
router.patch('/:id', validate(updateTaskSchema), controller.updateTask);

router.delete(
  '/:id',
  authorize('ADMIN', 'MANAGER'),
  validate(taskIdParamSchema),
  controller.deleteTask,
);

/**
 * PATCH /tasks/:id/status
 * Separate endpoint to make the transition semantics explicit.
 * Auth: assignee OR MANAGER/ADMIN (checked in service layer since it depends
 *       on the task's current assignee_id — a value we can't know at route level).
 */
router.patch('/:id/status', validate(updateStatusSchema), controller.updateStatus);

module.exports = router;
