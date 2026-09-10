const db = require("../config/database");

function toNumber(value) {
  return Number(value || 0);
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function getIncomeStatement({ startDate, endDate }) {
  const result = await db.query(
    `
      WITH account_balances AS (
        SELECT
          coa.id AS account_id,
          coa.account_code,
          coa.account_name,
          coa.account_type,
          COALESCE(SUM(jl.debit), 0) AS total_debit,
          COALESCE(SUM(jl.credit), 0) AS total_credit,
          CASE
            WHEN coa.account_type = 'revenue'
              THEN COALESCE(SUM(jl.credit), 0) - COALESCE(SUM(jl.debit), 0)
            WHEN coa.account_type IN ('expense', 'cogs')
              THEN COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)
            ELSE 0
          END AS amount
        FROM chart_of_accounts coa
        JOIN journal_lines jl
          ON jl.account_id = coa.id
        JOIN journal_entries je
          ON je.id = jl.journal_entry_id
        WHERE
          je.status = 'posted'
          AND je.entry_date BETWEEN $1 AND $2
          AND coa.account_type IN ('revenue', 'expense', 'cogs')
        GROUP BY
          coa.id,
          coa.account_code,
          coa.account_name,
          coa.account_type
      )
      SELECT *
      FROM account_balances
      ORDER BY
        CASE account_type
          WHEN 'revenue' THEN 1
          WHEN 'cogs' THEN 2
          WHEN 'expense' THEN 3
          ELSE 4
        END,
        account_code ASC
    `,
    [startDate, endDate]
  );

  const revenue = [];
  const cogs = [];
  const expenses = [];
  let totalRevenue = 0;
  let totalCogs = 0;
  let totalExpenses = 0;

  for (const row of result.rows) {
    const item = {
      account_id: row.account_id,
      account_code: row.account_code,
      account_name: row.account_name,
      account_type: row.account_type,
      total_debit: toNumber(row.total_debit),
      total_credit: toNumber(row.total_credit),
      amount: toNumber(row.amount)
    };

    if (row.account_type === "revenue") {
      revenue.push(item);
      totalRevenue = roundMoney(totalRevenue + item.amount);
    } else if (row.account_type === "cogs") {
      cogs.push(item);
      totalCogs = roundMoney(totalCogs + item.amount);
    } else if (row.account_type === "expense") {
      expenses.push(item);
      totalExpenses = roundMoney(totalExpenses + item.amount);
    }
  }

  return {
    period: {
      start_date: startDate,
      end_date: endDate
    },
    revenue,
    cogs,
    expenses,
    totals: {
      total_revenue: totalRevenue,
      total_cogs: totalCogs,
      gross_profit: roundMoney(totalRevenue - totalCogs),
      total_expenses: totalExpenses,
      net_income: roundMoney(totalRevenue - totalCogs - totalExpenses)
    }
  };
}

async function getBalanceSheet({ asOfDate }) {
  const result = await db.query(
    `
      WITH posted_lines AS (
        SELECT
          jl.account_id,
          COALESCE(SUM(jl.debit), 0) AS total_debit,
          COALESCE(SUM(jl.credit), 0) AS total_credit
        FROM journal_lines jl
        JOIN journal_entries je
          ON je.id = jl.journal_entry_id
        WHERE
          je.status = 'posted'
          AND je.entry_date <= $1
        GROUP BY jl.account_id
      ),
      account_balances AS (
        SELECT
          coa.id AS account_id,
          coa.account_code,
          coa.account_name,
          coa.account_type,
          COALESCE(pl.total_debit, 0) AS total_debit,
          COALESCE(pl.total_credit, 0) AS total_credit,
          CASE
            WHEN coa.account_type = 'asset'
              THEN COALESCE(pl.total_debit, 0) - COALESCE(pl.total_credit, 0)
            WHEN coa.account_type IN ('liability', 'equity')
              THEN COALESCE(pl.total_credit, 0) - COALESCE(pl.total_debit, 0)
            ELSE 0
          END AS ending_balance
        FROM chart_of_accounts coa
        LEFT JOIN posted_lines pl
          ON pl.account_id = coa.id
        WHERE coa.account_type IN ('asset', 'liability', 'equity')
      )
      SELECT *
      FROM account_balances
      WHERE ending_balance <> 0
      ORDER BY
        CASE account_type
          WHEN 'asset' THEN 1
          WHEN 'liability' THEN 2
          WHEN 'equity' THEN 3
          ELSE 4
        END,
        account_code ASC
    `,
    [asOfDate]
  );

  // Current period earnings = akumulasi (Pendapatan - Beban - HPP) sejak awal
  // pembukuan sampai asOfDate. Kontribusi tiap baris jurnal ke laba selalu
  // dihitung sebagai (credit - debit) -- untuk akun revenue, kredit menambah
  // laba; untuk akun expense/cogs, debit (yang notabene mengurangi credit-debit)
  // otomatis MENGURANGI laba. Jangan dibalik tandanya per account_type, karena
  // itu akan membuat beban justru menambah laba alih-alih menguranginya.
  const earningsResult = await db.query(
    `
      SELECT
        COALESCE(SUM(jl.credit - jl.debit), 0) AS current_period_earnings
      FROM journal_lines jl
      JOIN journal_entries je
        ON je.id = jl.journal_entry_id
      JOIN chart_of_accounts coa
        ON coa.id = jl.account_id
      WHERE
        je.status = 'posted'
        AND je.entry_date <= $1
        AND coa.account_type IN ('revenue', 'expense', 'cogs')
    `,
    [asOfDate]
  );

  const assets = [];
  const liabilities = [];
  const equity = [];
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;
  const currentPeriodEarnings = toNumber(earningsResult.rows[0]?.current_period_earnings);

  for (const row of result.rows) {
    const item = {
      account_id: row.account_id,
      account_code: row.account_code,
      account_name: row.account_name,
      account_type: row.account_type,
      total_debit: toNumber(row.total_debit),
      total_credit: toNumber(row.total_credit),
      ending_balance: toNumber(row.ending_balance)
    };

    if (row.account_type === "asset") {
      assets.push(item);
      totalAssets = roundMoney(totalAssets + item.ending_balance);
    } else if (row.account_type === "liability") {
      liabilities.push(item);
      totalLiabilities = roundMoney(totalLiabilities + item.ending_balance);
    } else if (row.account_type === "equity") {
      equity.push(item);
      totalEquity = roundMoney(totalEquity + item.ending_balance);
    }
  }

  if (currentPeriodEarnings !== 0) {
    const earningsItem = {
      account_id: null,
      account_code: "CURRENT_EARNINGS",
      account_name: "Current Period Earnings",
      account_type: "equity",
      total_debit: 0,
      total_credit: 0,
      ending_balance: roundMoney(currentPeriodEarnings),
      is_system_generated: true
    };

    equity.push(earningsItem);
    totalEquity = roundMoney(totalEquity + earningsItem.ending_balance);
  }

  const totalLiabilitiesAndEquity = roundMoney(totalLiabilities + totalEquity);
  const difference = roundMoney(totalAssets - totalLiabilitiesAndEquity);

  return {
    as_of_date: asOfDate,
    assets,
    liabilities,
    equity,
    totals: {
      total_assets: totalAssets,
      total_liabilities: totalLiabilities,
      total_equity: totalEquity,
      total_liabilities_and_equity: totalLiabilitiesAndEquity,
      is_balanced: difference === 0,
      difference
    }
  };
}

async function getCashFlowStatement({ startDate, endDate }) {
  const result = await db.query(
    `
      WITH cash_accounts AS (
        SELECT id
        FROM chart_of_accounts
        WHERE
          account_type = 'asset'
          AND (
            account_name ILIKE '%kas%'
            OR account_name ILIKE '%bank%'
            OR account_code LIKE '10%'
          )
      ),
      cash_movements AS (
        SELECT
          coa.id AS account_id,
          coa.account_code,
          coa.account_name,
          coa.account_type,
          CASE
            WHEN coa.account_type IN ('revenue', 'expense', 'cogs') THEN 'operating'
            WHEN coa.account_type = 'asset' THEN 'investing'
            WHEN coa.account_type IN ('liability', 'equity') THEN 'financing'
            ELSE 'operating'
          END AS cash_flow_category,
          SUM(opposite_line.credit - opposite_line.debit) AS cash_flow_amount
        FROM journal_lines cash_line
        JOIN cash_accounts cash_account
          ON cash_account.id = cash_line.account_id
        JOIN journal_entries je
          ON je.id = cash_line.journal_entry_id
        JOIN journal_lines opposite_line
          ON opposite_line.journal_entry_id = je.id
          AND opposite_line.id <> cash_line.id
        JOIN chart_of_accounts coa
          ON coa.id = opposite_line.account_id
          AND coa.id NOT IN (SELECT id FROM cash_accounts)
        WHERE
          je.status = 'posted'
          AND je.entry_date BETWEEN $1 AND $2
        GROUP BY
          coa.id,
          coa.account_code,
          coa.account_name,
          coa.account_type,
          cash_flow_category
      )
      SELECT *
      FROM cash_movements
      ORDER BY
        CASE cash_flow_category
          WHEN 'operating' THEN 1
          WHEN 'investing' THEN 2
          WHEN 'financing' THEN 3
          ELSE 4
        END,
        account_code ASC
    `,
    [startDate, endDate]
  );

  const operating = [];
  const investing = [];
  const financing = [];
  let netOperatingCashFlow = 0;
  let netInvestingCashFlow = 0;
  let netFinancingCashFlow = 0;

  for (const row of result.rows) {
    const item = {
      account_id: row.account_id,
      account_code: row.account_code,
      account_name: row.account_name,
      account_type: row.account_type,
      cash_flow_category: row.cash_flow_category,
      cash_flow_amount: toNumber(row.cash_flow_amount)
    };

    if (row.cash_flow_category === "operating") {
      operating.push(item);
      netOperatingCashFlow = roundMoney(netOperatingCashFlow + item.cash_flow_amount);
    } else if (row.cash_flow_category === "investing") {
      investing.push(item);
      netInvestingCashFlow = roundMoney(netInvestingCashFlow + item.cash_flow_amount);
    } else if (row.cash_flow_category === "financing") {
      financing.push(item);
      netFinancingCashFlow = roundMoney(netFinancingCashFlow + item.cash_flow_amount);
    }
  }

  return {
    period: {
      start_date: startDate,
      end_date: endDate
    },
    method: "direct",
    operating,
    investing,
    financing,
    totals: {
      net_operating_cash_flow: netOperatingCashFlow,
      net_investing_cash_flow: netInvestingCashFlow,
      net_financing_cash_flow: netFinancingCashFlow,
      net_cash_flow: roundMoney(netOperatingCashFlow + netInvestingCashFlow + netFinancingCashFlow)
    },
    classification_note:
      "Cash accounts are inferred from asset accounts named Kas/Bank or account codes starting with 10."
  };
}

module.exports = {
  getIncomeStatement,
  getBalanceSheet,
  getCashFlowStatement
};