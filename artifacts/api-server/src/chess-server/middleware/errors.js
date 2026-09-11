export function errorResponse(res, status, message) {
  return res.status(status).json({ error: message });
}

export function handleRouteError(res, error, message) {
  console.error(message, error);
  return errorResponse(res, 500, message);
}
