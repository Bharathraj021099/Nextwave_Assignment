const projectService = require('../services/project.service');
const { sendSuccess, sendCreated, sendNoContent } = require('../utils/response');

async function listProjects(req, res, next) {
  try {
    const projects = await projectService.listProjects({ orgId: req.user.orgId });
    sendSuccess(res, projects);
  } catch (err) {
    next(err);
  }
}

async function createProject(req, res, next) {
  try {
    const project = await projectService.createProject({
      orgId: req.user.orgId,
      createdBy: req.user.id,
      ...req.body,
    });
    sendCreated(res, project);
  } catch (err) {
    next(err);
  }
}

async function getProjectById(req, res, next) {
  try {
    const project = await projectService.getProjectById({
      orgId: req.user.orgId,
      projectId: req.params.id,
    });
    sendSuccess(res, project);
  } catch (err) {
    next(err);
  }
}

async function updateProject(req, res, next) {
  try {
    const project = await projectService.updateProject({
      orgId: req.user.orgId,
      projectId: req.params.id,
      updates: req.body,
    });
    sendSuccess(res, project);
  } catch (err) {
    next(err);
  }
}

async function deleteProject(req, res, next) {
  try {
    await projectService.deleteProject({
      orgId: req.user.orgId,
      projectId: req.params.id,
    });
    sendNoContent(res);
  } catch (err) {
    next(err);
  }
}

module.exports = { listProjects, createProject, getProjectById, updateProject, deleteProject };
