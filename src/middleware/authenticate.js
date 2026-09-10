const jwt = require("jsonwebtoken");
const { jwtSecret } = require("../config/env");
const { findUserById } = require("../models/userModel");
const { HttpError } = require("../utils/httpError");

async function authenticate(req, res, next) {
  try {
    const authHeader = req.get("authorization") || "";
    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
      throw new HttpError(401, "Authentication required");
    }

    const payload = jwt.verify(token, jwtSecret, {
      issuer: "gudara-finance-api",
      audience: "gudara-finance-app"
    });

    const user = await findUserById(payload.sub);

    if (!user || !user.is_active) {
      throw new HttpError(401, "Authentication required");
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      next(new HttpError(401, "Invalid or expired token"));
      return;
    }

    next(error);
  }
}

module.exports = authenticate;
