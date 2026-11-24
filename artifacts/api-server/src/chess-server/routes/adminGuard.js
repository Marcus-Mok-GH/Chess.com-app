import { errorResponse, handleRouteError } from "../middleware/errors.js";
import { getSessionToken, validateSession } from "../auth.js";
import { isIntegrityReviewer } from "../services/antiCheatService.js";

/**
 * Express middleware that mounts the same admin gate the /api/admin and
 * /api/admin/bots routers have always used: a valid session owned by an
 * integrity reviewer. The authenticated id is exposed as `req.adminId`.
 */
export default function requireIntegrityReviewer() {
  return async (req, res, next) => {
    try {
      const userId = await validateSession(getSessionToken(req));
      if (!userId) return errorResponse(res, 401, "Authentication required");
      if (!isIntegrityReviewer(userId))
        return errorResponse(res, 403, "Admin access required");
      req.adminId = String(userId);
      return next();
    } catch (error) {
      return handleRouteError(res, error, "Admin authorization failed");
    }
  };
}
