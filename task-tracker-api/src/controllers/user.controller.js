const userService = require('../services/user.service');
const { sendSuccess, sendCreated, sendNoContent } = require('../utils/response');

async function listUsers(req, res, next) {
  try {
    const { page, limit } = req.query;
    const result = await userService.listUsers({ orgId: req.user.orgId, page, limit });
    sendSuccess(res, result.users, 200, result.pagination);
  } catch (err) {
    next(err);
  }
}

async function inviteUser(req, res, next) {
  try {
    const user = await userService.inviteUser({ orgId: req.user.orgId, ...req.body });
    sendCreated(res, user);
  } catch (err) {
    next(err);
  }
}

async function getUserById(req, res, next) {
  try {
    const user = await userService.getUserById({ orgId: req.user.orgId, userId: req.params.id });
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
}

async function updateRole(req, res, next) {
  try {
    const user = await userService.updateRole({
      orgId: req.user.orgId,
      callerId: req.user.id,
      targetUserId: req.params.id,
      role: req.body.role,
    });
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
}

async function removeUser(req, res, next) {
  try {
    await userService.removeUser({
      orgId: req.user.orgId,
      callerId: req.user.id,
      targetUserId: req.params.id,
    });
    sendNoContent(res);
  } catch (err) {
    next(err);
  }
}

module.exports = { listUsers, inviteUser, getUserById, updateRole, removeUser };
