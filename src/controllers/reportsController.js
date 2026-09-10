const { getIncomeStatement, getBalanceSheet, getCashFlowStatement } = require("../models/reportsModel");
const { HttpError } = require("../utils/httpError");
const {
  makeFileName,
  setDownloadHeaders,
  incomeStatementPdf,
  balanceSheetPdf,
  cashFlowPdf,
  incomeStatementXlsx,
  balanceSheetXlsx,
  cashFlowXlsx
} = require("../services/reportExportService");

function isValidDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function setNoStoreHeaders(res) {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    Pragma: "no-cache",
    Expires: "0"
  });
}

async function incomeStatement(req, res, next) {
  try {
    const { start_date: startDate, end_date: endDate } = req.query;

    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      throw new HttpError(422, "Invalid report date range", {
        start_date: "start_date is required in YYYY-MM-DD format",
        end_date: "end_date is required in YYYY-MM-DD format"
      });
    }

    if (startDate > endDate) {
      throw new HttpError(422, "Invalid report date range", {
        date_range: "start_date must be earlier than or equal to end_date"
      });
    }

    const report = await getIncomeStatement({ startDate, endDate });
    setNoStoreHeaders(res);

    res.json({
      data: {
        report_type: "income_statement",
        ...report
      }
    });
  } catch (error) {
    next(error);
  }
}

async function balanceSheet(req, res, next) {
  try {
    const { as_of_date: asOfDate } = req.query;

    if (!isValidDate(asOfDate)) {
      throw new HttpError(422, "Invalid report date", {
        as_of_date: "as_of_date is required in YYYY-MM-DD format"
      });
    }

    const report = await getBalanceSheet({ asOfDate });
    setNoStoreHeaders(res);

    res.json({
      data: {
        report_type: "balance_sheet",
        ...report
      }
    });
  } catch (error) {
    next(error);
  }
}

async function cashFlow(req, res, next) {
  try {
    const { start_date: startDate, end_date: endDate } = req.query;

    validatePeriod(startDate, endDate);

    const report = await getCashFlowStatement({ startDate, endDate });
    setNoStoreHeaders(res);

    res.json({
      data: {
        report_type: "cash_flow",
        ...report
      }
    });
  } catch (error) {
    next(error);
  }
}

async function exportIncomeStatement(req, res, next) {
  try {
    const { start_date: startDate, end_date: endDate, format = "pdf" } = req.query;

    validatePeriod(startDate, endDate);
    const report = await getIncomeStatement({ startDate, endDate });

    await sendReportExport(res, {
      format,
      reportType: "income-statement",
      pdfBuilder: () => incomeStatementPdf(report),
      xlsxBuilder: () => incomeStatementXlsx(report)
    });
  } catch (error) {
    next(error);
  }
}

async function exportBalanceSheet(req, res, next) {
  try {
    const { as_of_date: asOfDate, format = "pdf" } = req.query;

    if (!isValidDate(asOfDate)) {
      throw new HttpError(422, "Invalid report date", {
        as_of_date: "as_of_date is required in YYYY-MM-DD format"
      });
    }

    const report = await getBalanceSheet({ asOfDate });

    await sendReportExport(res, {
      format,
      reportType: "balance-sheet",
      pdfBuilder: () => balanceSheetPdf(report),
      xlsxBuilder: () => balanceSheetXlsx(report)
    });
  } catch (error) {
    next(error);
  }
}

async function exportCashFlow(req, res, next) {
  try {
    const { start_date: startDate, end_date: endDate, format = "pdf" } = req.query;

    validatePeriod(startDate, endDate);
    const report = await getCashFlowStatement({ startDate, endDate });

    await sendReportExport(res, {
      format,
      reportType: "cash-flow",
      pdfBuilder: () => cashFlowPdf(report),
      xlsxBuilder: () => cashFlowXlsx(report)
    });
  } catch (error) {
    next(error);
  }
}

function validatePeriod(startDate, endDate) {
  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    throw new HttpError(422, "Invalid report date range", {
      start_date: "start_date is required in YYYY-MM-DD format",
      end_date: "end_date is required in YYYY-MM-DD format"
    });
  }

  if (startDate > endDate) {
    throw new HttpError(422, "Invalid report date range", {
      date_range: "start_date must be earlier than or equal to end_date"
    });
  }
}

async function sendReportExport(res, { format, reportType, pdfBuilder, xlsxBuilder }) {
  if (format === "pdf") {
  const buffer = await pdfBuilder();
  setDownloadHeaders(res, {
    filename: makeFileName(reportType, "pdf"),
    contentType: "application/pdf"
  });
  res.send(Buffer.from(buffer));
  return;
  }

  if (format === "xlsx") {
    const buffer = await xlsxBuilder();
    setDownloadHeaders(res, {
      filename: makeFileName(reportType, "xlsx"),
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    res.send(Buffer.from(buffer));
    return;
  }

  throw new HttpError(422, "Invalid export format", {
    format: "format must be pdf or xlsx"
  });
}

module.exports = {
  incomeStatement,
  balanceSheet,
  cashFlow,
  exportIncomeStatement,
  exportBalanceSheet,
  exportCashFlow
};
