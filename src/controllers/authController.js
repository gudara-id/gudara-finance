const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { jwtSecret, jwtExpiresIn } = require("../config/env");
const { findUserByEmail, updateLastLogin } = require("../models/userModel");
const { HttpError } = require("../utils/httpError");

function publicUser(user) {
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    role: user.role
  };
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new HttpError(422, "Invalid login payload", {
        email: "email is required",
        password: "password is required"
      });
    }

    const user = await findUserByEmail(email);

    if (!user || !user.is_active) {
      throw new HttpError(401, "Invalid email or password");
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      throw new HttpError(401, "Invalid email or password");
    }

    await updateLastLogin(user.id);

    const token = jwt.sign(
      {
        sub: String(user.id),
        role: user.role,
        email: user.email
      },
      jwtSecret,
      {
        expiresIn: jwtExpiresIn,
        issuer: "gudara-finance-api",
        audience: "gudara-finance-app"
      }
    );

    res.json({
      data: {
        access_token: token,
        token_type: "Bearer",
        expires_in: jwtExpiresIn,
        user: publicUser(user)
      }
    });
  } catch (error) {
    next(error);
  }
}

async function me(req, res) {
  res.json({
    data: {
      user: publicUser(req.user)
    }
  });
}

async function logout(req, res) {
  res.json({
    data: {
      message: "Logout successful. Remove the access token from the client."
    }
  });
}

module.exports = {
  login,
  me,
  logout
};
