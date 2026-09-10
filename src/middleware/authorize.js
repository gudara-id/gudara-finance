const { HttpError } = require("../utils/httpError");

function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      next(new HttpError(401, "Authentication required"));
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(new HttpError(403, "You do not have permission to access this resource"));
      return;
    }

    next();
  };
}

module.exports = authorize;
