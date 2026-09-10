const db = require("../config/database");

async function findUserByEmail(email) {
  const result = await db.query(
    `
      SELECT
        id,
        full_name,
        email,
        password_hash,
        role,
        is_active,
        last_login_at,
        created_at,
        updated_at
      FROM users
      WHERE lower(email) = lower($1)
      LIMIT 1
    `,
    [email]
  );

  return result.rows[0] || null;
}

async function findUserById(id) {
  const result = await db.query(
    `
      SELECT
        id,
        full_name,
        email,
        role,
        is_active,
        last_login_at,
        created_at,
        updated_at
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );

  return result.rows[0] || null;
}

async function updateLastLogin(id) {
  await db.query(
    `
      UPDATE users
      SET last_login_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `,
    [id]
  );
}

module.exports = {
  findUserByEmail,
  findUserById,
  updateLastLogin
};
