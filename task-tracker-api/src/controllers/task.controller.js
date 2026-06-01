const taskService = require('../services/task.service');
const { sendSuccess, sendCreated, sendNoContent } = require('../utils/response');

async function listTasks(req, res, next) {
  try {
    const { page, limit, status, priority, assigneeId, projectId } = req.query;
    const result = await taskService.listTasks({
      orgId: req.user.orgId,
      callerId: req.user.id,
      callerRole: req.user.role,
      page,
      limit,
      status,
      priority,
      assigneeId,
      projectId,
    });
    const { tasks, pagination, fromCache } = result;
    const meta = { ...pagination, ...(fromCache && { cached: true }) };
    sendSuccess(res, tasks, 200, meta);
  } catch (err) {
    next(err);
  }
}

async function createTask(req, res, next) {
  try {
    const task = await taskService.createTask({
      orgId: req.user.orgId,
      createdBy: req.user.id,
      ...req.body,
    });
    sendCreated(res, task);
  } catch (err) {
    next(err);
  }
}

async function getTaskById(req, res, next) {
  try {
    const task = await taskService.getTaskById({
      orgId: req.user.orgId,
      taskId: req.params.id,
      callerId: req.user.id,
      callerRole: req.user.role,
    });
    sendSuccess(res, task);
  } catch (err) {
    next(err);
  }
}

async function updateTask(req, res, next) {
  try {
    const task = await taskService.updateTask({
      orgId: req.user.orgId,
      taskId: req.params.id,
      callerId: req.user.id,
      callerRole: req.user.role,
      updates: req.body,
    });
    sendSuccess(res, task);
  } catch (err) {
    next(err);
  }
}

async function updateStatus(req, res, next) {
  try {
    const task = await taskService.updateStatus({
      orgId: req.user.orgId,
      taskId: req.params.id,
      callerId: req.user.id,
      callerRole: req.user.role,
      newStatus: req.body.status,
    });
    sendSuccess(res, task);
  } catch (err) {
    next(err);
  }
}

async function deleteTask(req, res, next) {
  try {
    await taskService.deleteTask({ orgId: req.user.orgId, taskId: req.params.id });
    sendNoContent(res);
  } catch (err) {
    next(err);
  }
}

module.exports = { listTasks, createTask, getTaskById, updateTask, updateStatus, deleteTask };
