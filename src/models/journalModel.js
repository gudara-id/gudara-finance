const db = require("../config/database");
const { centsToSqlAmount } = require("../utils/money");

const REFERENCE_PREFIX = "JV";

/**
 * Menghasilkan nomor referensi jurnal otomatis dengan format JV-YYYY-0001,
 * berurutan per tahun berdasarkan entry_date. Menggunakan advisory lock
 * per tahun di dalam transaksi supaya aman dari race condition ketika
 * beberapa jurnal disimpan bersamaan.
 */
async function generateReferenceNo(client, entryDate) {
  const year = new Date(entryDate).getFullYear();

  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`journal_reference_${year}`]);

  const lastResult = await client.query(
    `
      SELECT reference_no
      FROM journal_entries
      WHERE reference_no LIKE $1
      ORDER BY reference_no DESC
      LIMIT 1
    `,
    [`${REFERENCE_PREFIX}-${year}-%`]
  );

  let nextSequence = 1;
  const lastReference = lastResult.rows[0]?.reference_no;

  if (lastReference) {
    const match = lastReference.match(new RegExp(`^${REFERENCE_PREFIX}-${year}-(\\d+)$`));
    if (match) {
      nextSequence = parseInt(match[1], 10) + 1;
    }
  }

  return `${REFERENCE_PREFIX}-${year}-${String(nextSequence).padStart(4, "0")}`;
}

async function createPostedJournalEntry(payload) {
  return db.transaction(async (client) => {
    const referenceNo =
      payload.reference_no && String(payload.reference_no).trim() !== ""
        ? String(payload.reference_no).trim()
        : await generateReferenceNo(client, payload.entry_date);

    const headerResult = await client.query(
      `
        INSERT INTO journal_entries (
          entry_date,
          reference_no,
          description,
          status,
          posted_at,
          created_by,
          posted_by
        )
        VALUES ($1, $2, $3, 'posted', NOW(), $4, $4)
        RETURNING *
      `,
      [
        payload.entry_date,
        referenceNo,
        String(payload.description).trim(),
        payload.created_by || null
      ]
    );

    const journalEntry = headerResult.rows[0];
    const lines = [];

    for (let index = 0; index < payload.lines.length; index += 1) {
      const line = payload.lines[index];

      const lineResult = await client.query(
        `
          INSERT INTO journal_lines (
            journal_entry_id,
            account_id,
            line_no,
            memo,
            debit,
            credit
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `,
        [
          journalEntry.id,
          line.account_id,
          index + 1,
          line.memo || null,
          centsToSqlAmount(line.debit_cents),
          centsToSqlAmount(line.credit_cents)
        ]
      );

      lines.push(lineResult.rows[0]);
    }

    return {
      ...journalEntry,
      lines
    };
  });
}

async function updateJournalEntry(id, payload) {
  return db.transaction(async (client) => {
    const headerResult = await client.query(
      `
        UPDATE journal_entries
        SET entry_date = $1,
            reference_no = $2,
            description = $3,
            updated_at = NOW()
        WHERE id = $4
        RETURNING *
      `,
      [
        payload.entry_date,
        payload.reference_no && String(payload.reference_no).trim() !== ""
          ? String(payload.reference_no).trim()
          : null,
        String(payload.description).trim(),
        id
      ]
    );

    const journalEntry = headerResult.rows[0];

    if (!journalEntry) {
      return null;
    }

    await client.query("DELETE FROM journal_lines WHERE journal_entry_id = $1", [id]);

    const lines = [];

    for (let index = 0; index < payload.lines.length; index += 1) {
      const line = payload.lines[index];

      const lineResult = await client.query(
        `
          INSERT INTO journal_lines (
            journal_entry_id,
            account_id,
            line_no,
            memo,
            debit,
            credit
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `,
        [
          journalEntry.id,
          line.account_id,
          index + 1,
          line.memo || null,
          centsToSqlAmount(line.debit_cents),
          centsToSqlAmount(line.credit_cents)
        ]
      );

      lines.push(lineResult.rows[0]);
    }

    return {
      ...journalEntry,
      lines
    };
  });
}

async function getJournalEntryById(id) {
  const headerResult = await db.query(
    `
      SELECT *
      FROM journal_entries
      WHERE id = $1
    `,
    [id]
  );

  if (!headerResult.rows[0]) {
    return null;
  }

  const lineResult = await db.query(
    `
      SELECT
        jl.*,
        coa.account_code,
        coa.account_name,
        coa.account_type
      FROM journal_lines jl
      JOIN chart_of_accounts coa
        ON coa.id = jl.account_id
      WHERE jl.journal_entry_id = $1
      ORDER BY jl.line_no ASC
    `,
    [id]
  );

  return {
    ...headerResult.rows[0],
    lines: lineResult.rows
  };
}

module.exports = {
  createPostedJournalEntry,
  updateJournalEntry,
  getJournalEntryById
};
