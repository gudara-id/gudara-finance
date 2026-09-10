const { createPostedJournalEntry, updateJournalEntry, getJournalEntryById } = require("../models/journalModel");
const { getAccountById } = require("../models/chartOfAccountsModel");
const { HttpError } = require("../utils/httpError");
const { toCents } = require("../utils/money");

function validateJournalPayload(payload) {
  const errors = {};

  if (!payload.entry_date) {
    errors.entry_date = "entry_date is required";
  }

  if (!payload.description || String(payload.description).trim() === "") {
    errors.description = "description is required";
  }

  if (!Array.isArray(payload.lines) || payload.lines.length < 2) {
    errors.lines = "journal entry must contain at least two lines";
    return {
      errors,
      normalizedLines: []
    };
  }

  let totalDebit = 0n;
  let totalCredit = 0n;
  const normalizedLines = [];

  payload.lines.forEach((line, index) => {
    const lineErrors = {};

    if (!line.account_id) {
      lineErrors.account_id = "account_id is required";
    }

    let debitCents = 0n;
    let creditCents = 0n;

    try {
      debitCents = toCents(line.debit ?? 0, `lines[${index}].debit`);
      creditCents = toCents(line.credit ?? 0, `lines[${index}].credit`);
    } catch (error) {
      lineErrors.amount = error.message;
    }

    if (debitCents < 0n || creditCents < 0n) {
      lineErrors.amount = "debit and credit must be zero or positive";
    }

    if (!((debitCents > 0n && creditCents === 0n) || (creditCents > 0n && debitCents === 0n))) {
      lineErrors.amount = "each line must contain either debit or credit, not both";
    }

    if (Object.keys(lineErrors).length > 0) {
      errors[`lines[${index}]`] = lineErrors;
    }

    totalDebit += debitCents;
    totalCredit += creditCents;
    normalizedLines.push({
      ...line,
      debit_cents: debitCents,
      credit_cents: creditCents
    });
  });

  if (totalDebit !== totalCredit) {
    errors.balance = "total debit must equal total credit";
    errors.total_debit_cents = totalDebit.toString();
    errors.total_credit_cents = totalCredit.toString();
  }

  return {
    errors: Object.keys(errors).length > 0 ? errors : null,
    normalizedLines
  };
}

async function store(req, res, next) {
  try {
    const { errors, normalizedLines } = validateJournalPayload(req.body);

    if (errors) {
      throw new HttpError(422, "Invalid journal entry payload", errors);
    }

    for (const line of normalizedLines) {
      const account = await getAccountById(line.account_id);

      if (!account || !account.is_active) {
        throw new HttpError(422, "Invalid journal entry payload", {
          account_id: `Account ${line.account_id} does not exist or is inactive`
        });
      }
    }

    const journalEntry = await createPostedJournalEntry({
      ...req.body,
      lines: normalizedLines
    });

    res.status(201).json({ data: journalEntry });
  } catch (error) {
    next(error);
  }
}

async function update(req, res, next) {
  try {
    const existing = await getJournalEntryById(req.params.id);

    if (!existing) {
      throw new HttpError(404, "Journal entry not found");
    }

    if (existing.status === "void") {
      throw new HttpError(422, "Jurnal yang berstatus void tidak dapat diedit");
    }

    const { errors, normalizedLines } = validateJournalPayload(req.body);

    if (errors) {
      throw new HttpError(422, "Invalid journal entry payload", errors);
    }

    for (const line of normalizedLines) {
      const account = await getAccountById(line.account_id);

      if (!account || !account.is_active) {
        throw new HttpError(422, "Invalid journal entry payload", {
          account_id: `Account ${line.account_id} does not exist or is inactive`
        });
      }
    }

    const journalEntry = await updateJournalEntry(req.params.id, {
      ...req.body,
      lines: normalizedLines
    });

    if (!journalEntry) {
      throw new HttpError(404, "Journal entry not found");
    }

    res.json({ data: journalEntry });
  } catch (error) {
    next(error);
  }
}

async function show(req, res, next) {
  try {
    const journalEntry = await getJournalEntryById(req.params.id);

    if (!journalEntry) {
      throw new HttpError(404, "Journal entry not found");
    }

    res.json({ data: journalEntry });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  store,
  update,
  show
};
