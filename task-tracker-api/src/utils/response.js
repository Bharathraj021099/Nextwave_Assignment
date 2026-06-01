/**
 * Send a successful JSON response.
 */
function sendSuccess(res, data, statusCode = 200, meta = undefined) {
  const body = { status: statusCode, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

/**
 * Send a 201 Created response.
 */
function sendCreated(res, data) {
  return sendSuccess(res, data, 201);
}

/**
 * Send a 204 No Content response.
 */
function sendNoContent(res) {
  return res.status(204).send();
}

module.exports = { sendSuccess, sendCreated, sendNoContent };
