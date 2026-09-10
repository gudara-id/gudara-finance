const {
  validateAccountPayload,
  listAccounts,
  getAccountById,
  createAccount,
  updateAccount,
  deleteAccount
} = require("../models/chartOfAccountsModel");
const { HttpError } = require("../utils/httpError");

async function index(req, res, next) {
  try {
    const accounts = await listAccounts({
      accountType: req.query.account_type,
      isActive: req.query.is_active === undefined ? undefined : req.query.is_active === "true"
    });

    res.json({ data: accounts });
  } catch (error) {
    next(error);
  }
}

async function show(req, res, next) {
  try {
    const account = await getAccountById(req.params.id);

    if (!account) {
      throw new HttpError(404, "Chart of account not found");
    }

    res.json({ data: account });
  } catch (error) {
    next(error);
  }
}

async function store(req, res, next) {
  try {
    const errors = validateAccountPayload(req.body);

    if (errors) {
      throw new HttpError(422, "Invalid chart of account payload", errors);
    }

    const account = await createAccount(req.body);

    res.status(201).json({ data: account });
  } catch (error) {
    next(error);
  }
}

async function update(req, res, next) {
  try {
    const errors = validateAccountPayload(req.body, true);

    if (errors) {
      throw new HttpError(422, "Invalid chart of account payload", errors);
    }

    const account = await updateAccount(req.params.id, req.body);

    if (!account) {
      throw new HttpError(404, "Chart of account not found");
    }

    res.json({ data: account });
  } catch (error) {
    next(error);
  }
}

async function destroy(req, res, next) {
  try {
    const deleted = await deleteAccount(req.params.id);

    if (!deleted) {
      throw new HttpError(404, "Chart of account not found");
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  index,
  show,
  store,
  update,
  destroy
};
