const db = require("../config/database");

const ACCOUNT_TYPES = new Set(["asset", "liability", "equity", "revenue", "expense", "cogs"]);
const NORMAL_BALANCES = new Set(["debit", "credit"]);

function validateAccountPayload(payload, partial = false) {
  const errors = {};

  if (!partial || payload.account_code !== undefined) {
    if (!payload.account_code || String(payload.account_code).trim() === "") {
      errors.account_code = "account_code is required";
    }
  }

  if (!partial || payload.account_name !== undefined) {
    if (!payload.account_name || String(payload.account_name).trim() === "") {
      errors.account_name = "account_name is required";
    }
  }

  if (!partial || payload.account_type !== undefined) {
    if (!ACCOUNT_TYPES.has(payload.account_type)) {
      errors.account_type = "account_type must be one of asset, liability, equity, revenue, expense, cogs";
    }
  }

  if (!partial || payload.normal_balance !== undefined) {
    if (!NORMAL_BALANCES.has(payload.normal_balance)) {
      errors.normal_balance = "normal_balance must be debit or credit";
    }
  }

  if (Object.keys(errors).length > 0) {
    return errors;
  }

  return null;
}

async function listAccounts({ accountType, isActive } = {}) {
  const conditions = [];
  const params = [];

  if (accountType) {
    params.push(accountType);
    conditions.push(`account_type = $${params.length}`);
  }

  if (isActive !== undefined) {
    params.push(isActive);
    conditions.push(`is_active = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await db.query(
    `
      SELECT
        id,
        account_code,
        account_name,
        account_type,
        normal_balance,
        parent_account_id,
        is_active,
        created_at,
        updated_at
      FROM chart_of_accounts
      ${where}
      ORDER BY account_code ASC
    `,
    params
  );

  return result.rows;
}

async function getAccountById(id) {
  const result = await db.query(
    `
      SELECT
        id,
        account_code,
        account_name,
        account_type,
        normal_balance,
        parent_account_id,
        is_active,
        created_at,
        updated_at
      FROM chart_of_accounts
      WHERE id = $1
    `,
    [id]
  );

  return result.rows[0] || null;
}

async function createAccount(payload) {
  const result = await db.query(
    `
      INSERT INTO chart_of_accounts (
        account_code,
        account_name,
        account_type,
        normal_balance,
        parent_account_id,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, COALESCE($6, TRUE))
      RETURNING *
    `,
    [
      String(payload.account_code).trim(),
      String(payload.account_name).trim(),
      payload.account_type,
      payload.normal_balance,
      payload.parent_account_id || null,
      payload.is_active
    ]
  );

  return result.rows[0];
}

async function updateAccount(id, payload) {
  const current = await getAccountById(id);

  if (!current) {
    return null;
  }

  const result = await db.query(
    `
      UPDATE chart_of_accounts
      SET
        account_code = $1,
        account_name = $2,
        account_type = $3,
        normal_balance = $4,
        parent_account_id = $5,
        is_active = $6,
        updated_at = NOW()
      WHERE id = $7
      RETURNING *
    `,
    [
      payload.account_code !== undefined ? String(payload.account_code).trim() : current.account_code,
      payload.account_name !== undefined ? String(payload.account_name).trim() : current.account_name,
      payload.account_type !== undefined ? payload.account_type : current.account_type,
      payload.normal_balance !== undefined ? payload.normal_balance : current.normal_balance,
      payload.parent_account_id !== undefined ? payload.parent_account_id : current.parent_account_id,
      payload.is_active !== undefined ? payload.is_active : current.is_active,
      id
    ]
  );

  return result.rows[0];
}

async function deleteAccount(id) {
  const result = await db.query(
    `
      DELETE FROM chart_of_accounts
      WHERE id = $1
      RETURNING id
    `,
    [id]
  );

  return result.rowCount > 0;
}

module.exports = {
  ACCOUNT_TYPES,
  NORMAL_BALANCES,
  validateAccountPayload,
  listAccounts,
  getAccountById,
  createAccount,
  updateAccount,
  deleteAccount
};
