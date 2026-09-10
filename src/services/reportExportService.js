const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");

const COMPANY_NAME = "Gudara";
const COMPANY_SUBTITLE = "Laporan Keuangan Profesional";
const EXPORT_NOTE = "Dibuat otomatis oleh Gudara Finance";

function formatMoney(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function formatDateLabel(value) {
  return new Intl.DateTimeFormat("id-ID", {
    year: "numeric",
    month: "long",
    day: "2-digit"
  }).format(new Date(value));
}

function makeFileName(reportType, extension) {
  const stamp = new Date().toISOString().slice(0, 10);
  return `gudara-${reportType}-${stamp}.${extension}`;
}

function noStoreHeaders(res) {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    Pragma: "no-cache",
    Expires: "0"
  });
}

function setDownloadHeaders(res, { filename, contentType }) {
  noStoreHeaders(res);
  res.set({
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename}"`
  });
}

function createPdfBuffer(build) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 42, bufferPages: true });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    build(doc);
    addPdfFooter(doc);
    doc.end();
  });
}

function addPdfHeader(doc, title, subtitle) {
  doc.rect(24, 30, 547, 116).fill("#111827");
  doc.rect(42, 48, 34, 34).fill("#0f766e");
  doc.font("Helvetica-Bold").fontSize(16).fillColor("#ffffff").text("G", 53, 58);
  doc.font("Helvetica-Bold").fontSize(16).fillColor("#ffffff").text(COMPANY_NAME, 88, 51);
  doc.font("Helvetica").fontSize(8.5).fillColor("#cbd5e1").text(COMPANY_SUBTITLE, 88, 69);
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#cbd5e1").text("EXPORT", 488, 52);
  doc.font("Helvetica").fontSize(8).text(new Date().toISOString().slice(0, 10), 488, 66);
  doc.font("Helvetica-Bold").fontSize(20).fillColor("#ffffff").text(title, 42, 96, { width: 420 });
  doc.font("Helvetica").fontSize(9.5).fillColor("#cbd5e1").text(subtitle, 42, 121, { width: 430 });
  doc.y = 176;
}

function addPdfSection(doc, title, rows, amountKey = "amount") {
  ensurePdfSpace(doc, 72);
  doc.rect(42, doc.y + 1, 5, 14).fill("#0f766e");
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#17202a").text(title, 54, doc.y);
  doc.moveDown(0.7);
  drawPdfTableHeader(doc, ["Kode", "Nama Akun", "Tipe", "Jumlah"], [52, 242, 72, 110]);

  if (!rows.length) {
    doc.font("Helvetica").fontSize(9).fillColor("#64748b").text("Tidak ada data.");
    doc.moveDown(0.7);
    return;
  }

  rows.forEach((row, index) => {
    ensurePdfSpace(doc, 26);
    const y = doc.y;
    if (index % 2 === 0) doc.rect(42, y - 5, 490, 19).fill("#f8fafc");
    doc.font("Helvetica").fontSize(8).fillColor("#17202a").text(row.account_code || "-", 52, y, { width: 52 });
    doc.text(row.account_name || "-", 112, y, { width: 242, ellipsis: true });
    doc.fillColor("#64748b").text(row.account_type || "-", 360, y, { width: 72 });
    doc.fillColor("#17202a").text(formatMoney(row[amountKey]), 422, y, { width: 110, align: "right" });
    doc.y = y + 18;
  });

  doc.moveDown(0.6);
}

function addPdfTotalLine(doc, label, value, strong = false) {
  ensurePdfSpace(doc, 34);
  const y = doc.y;
  if (strong) {
    doc.rect(300, y - 7, 232, 24).fill("#f1f5f9");
  } else {
    doc.moveTo(330, y - 3).lineTo(532, y - 3).strokeColor("#d9e2ec").stroke();
  }
  doc.font(strong ? "Helvetica-Bold" : "Helvetica").fontSize(10).fillColor("#17202a");
  doc.text(label, strong ? 310 : 330, y, { width: strong ? 135 : 115 });
  doc.text(formatMoney(value), 410, y, { width: 120, align: "right" });
  doc.moveDown(0.8);
}

function ensurePdfSpace(doc, height) {
  if (doc.y + height > 760) doc.addPage();
}

function drawPdfTableHeader(doc, labels, widths) {
  const y = doc.y;
  doc.rect(42, y - 5, 490, 22).fill("#111827");
  let x = 52;
  labels.forEach((label, index) => {
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#ffffff").text(label, x, y, {
      width: widths[index],
      align: index === labels.length - 1 ? "right" : "left"
    });
    x += widths[index] + 8;
  });
  doc.y = y + 24;
}

function addPdfSummaryCards(doc, cards) {
  const gap = 10;
  const width = (490 - gap * 2) / 3;
  const startY = doc.y;

  cards.forEach((card, index) => {
    const x = 42 + index * (width + gap);
    doc.rect(x, startY, width, 54).fill("#f8fafc");
    doc.rect(x, startY, width, 3).fill(card.color || "#0f766e");
    doc.font("Helvetica-Bold").fontSize(7.8).fillColor("#64748b").text(card.label, x + 12, startY + 14, { width: width - 24 });
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#17202a").text(card.value, x + 12, startY + 33, { width: width - 24, ellipsis: true });
  });

  doc.y = startY + 68;
}

function addPdfFooter(doc) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    doc.moveTo(42, 800).lineTo(553, 800).strokeColor("#d9e2ec").stroke();
    doc.font("Helvetica").fontSize(7.5).fillColor("#64748b").text(EXPORT_NOTE, 42, 810);
    doc.text(`Halaman ${i + 1} dari ${range.count}`, 476, 810);
  }
}

async function incomeStatementPdf(report) {
  return createPdfBuffer((doc) => {
    addPdfHeader(
      doc,
      "Laporan Laba Rugi",
      `Periode ${formatDateLabel(report.period.start_date)} sampai ${formatDateLabel(report.period.end_date)}`
    );
    addPdfSummaryCards(doc, [
      { label: "Total Pendapatan", value: formatMoney(report.totals.total_revenue), color: "#0f766e" },
      { label: "Laba Kotor", value: formatMoney(report.totals.gross_profit), color: "#0369a1" },
      { label: "Laba/Rugi Bersih", value: formatMoney(report.totals.net_income), color: report.totals.net_income >= 0 ? "#0f766e" : "#be123c" }
    ]);

    addPdfSection(doc, "Pendapatan", report.revenue);
    addPdfTotalLine(doc, "Total Pendapatan", report.totals.total_revenue);
    addPdfSection(doc, "Harga Pokok Penjualan", report.cogs);
    addPdfTotalLine(doc, "Total HPP", report.totals.total_cogs);
    addPdfTotalLine(doc, "Laba Kotor", report.totals.gross_profit, true);
    addPdfSection(doc, "Beban Operasional", report.expenses);
    addPdfTotalLine(doc, "Total Beban", report.totals.total_expenses);
    addPdfTotalLine(doc, "Laba/Rugi Bersih", report.totals.net_income, true);
  });
}

async function balanceSheetPdf(report) {
  return createPdfBuffer((doc) => {
    addPdfHeader(doc, "Neraca", `Per ${formatDateLabel(report.as_of_date)}`);
    addPdfSummaryCards(doc, [
      { label: "Total Aset", value: formatMoney(report.totals.total_assets), color: "#0f766e" },
      { label: "Liabilitas + Ekuitas", value: formatMoney(report.totals.total_liabilities_and_equity), color: "#0369a1" },
      { label: "Status Neraca", value: report.totals.is_balanced ? "Balance" : "Tidak Balance", color: report.totals.is_balanced ? "#0f766e" : "#be123c" }
    ]);

    addPdfSection(doc, "Aset", report.assets, "ending_balance");
    addPdfTotalLine(doc, "Total Aset", report.totals.total_assets, true);
    addPdfSection(doc, "Liabilitas", report.liabilities, "ending_balance");
    addPdfTotalLine(doc, "Total Liabilitas", report.totals.total_liabilities);
    addPdfSection(doc, "Ekuitas", report.equity, "ending_balance");
    addPdfTotalLine(doc, "Total Ekuitas", report.totals.total_equity);
    addPdfTotalLine(doc, "Liabilitas + Ekuitas", report.totals.total_liabilities_and_equity, true);
    addPdfTotalLine(doc, "Selisih", report.totals.difference, true);
  });
}

async function cashFlowPdf(report) {
  return createPdfBuffer((doc) => {
    addPdfHeader(
      doc,
      "Laporan Arus Kas",
      `Periode ${formatDateLabel(report.period.start_date)} sampai ${formatDateLabel(report.period.end_date)}`
    );
    addPdfSummaryCards(doc, [
      { label: "Kas Bersih Operasi", value: formatMoney(report.totals.net_operating_cash_flow), color: "#0f766e" },
      { label: "Kas Bersih Investasi", value: formatMoney(report.totals.net_investing_cash_flow), color: "#0369a1" },
      { label: "Kenaikan/Penurunan Kas", value: formatMoney(report.totals.net_cash_flow), color: report.totals.net_cash_flow >= 0 ? "#0f766e" : "#be123c" }
    ]);

    addPdfSection(doc, "Aktivitas Operasi", report.operating, "cash_flow_amount");
    addPdfTotalLine(doc, "Kas Bersih Operasi", report.totals.net_operating_cash_flow);
    addPdfSection(doc, "Aktivitas Investasi", report.investing, "cash_flow_amount");
    addPdfTotalLine(doc, "Kas Bersih Investasi", report.totals.net_investing_cash_flow);
    addPdfSection(doc, "Aktivitas Pendanaan", report.financing, "cash_flow_amount");
    addPdfTotalLine(doc, "Kas Bersih Pendanaan", report.totals.net_financing_cash_flow);
    addPdfTotalLine(doc, "Kenaikan/Penurunan Kas", report.totals.net_cash_flow, true);
  });
}

function styleWorksheet(worksheet) {
  worksheet.views = [{ state: "frozen", ySplit: 6 }];
  worksheet.columns.forEach((column) => {
    column.width = Math.min(Math.max(column.width || 14, 14), 42);
  });

  worksheet.eachRow((row) => {
    row.height = row.number <= 4 ? 22 : 19;
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle" };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } }
      };
    });
  });
}

function addWorkbookHeader(worksheet, title, subtitle, lastColumn = "E") {
  worksheet.mergeCells(`A1:${lastColumn}1`);
  worksheet.mergeCells(`A2:${lastColumn}2`);
  worksheet.mergeCells(`A3:${lastColumn}3`);
  worksheet.mergeCells(`A4:${lastColumn}4`);
  worksheet.getCell("A1").value = COMPANY_NAME;
  worksheet.getCell("A2").value = COMPANY_SUBTITLE;
  worksheet.getCell("A3").value = title;
  worksheet.getCell("A4").value = subtitle;
  for (let rowNumber = 1; rowNumber <= 4; rowNumber += 1) {
    worksheet.getRow(rowNumber).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
  }
  worksheet.getCell("A1").font = { bold: true, size: 18, color: { argb: "FFFFFFFF" } };
  worksheet.getCell("A2").font = { size: 10, color: { argb: "FFCBD5E1" } };
  worksheet.getCell("A3").font = { bold: true, size: 15, color: { argb: "FFFFFFFF" } };
  worksheet.getCell("A4").font = { size: 10, color: { argb: "FFCBD5E1" } };
}

function addWorkbookSummary(worksheet, items) {
  worksheet.addRow([]);
  const row = worksheet.addRow(items.flatMap((item) => [item.label, Number(item.value || 0)]));
  row.font = { bold: true, color: { argb: "FF17202A" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
}

function addExcelRows(worksheet, title, rows, amountKey) {
  worksheet.addRow([]);
  const section = worksheet.addRow([title]);
  section.font = { bold: true, color: { argb: "FF17202A" } };
  section.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };

  for (const row of rows) {
    worksheet.addRow([
      row.account_code,
      row.account_name,
      row.account_type,
      Number(row.total_debit || 0),
      Number(row.total_credit || 0),
      Number(row[amountKey] || 0)
    ]);
  }
}

async function incomeStatementXlsx(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = COMPANY_NAME;
  const worksheet = workbook.addWorksheet("Laba Rugi");

  addWorkbookHeader(
    worksheet,
    "Laporan Laba Rugi",
    `Periode ${report.period.start_date} sampai ${report.period.end_date}`,
    "F"
  );

  worksheet.addRow([]);
  const header = worksheet.addRow(["Kode Akun", "Nama Akun", "Tipe", "Debit", "Kredit", "Jumlah"]);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };

  addExcelRows(worksheet, "Pendapatan", report.revenue, "amount");
  addExcelRows(worksheet, "Harga Pokok Penjualan", report.cogs, "amount");
  addExcelRows(worksheet, "Beban Operasional", report.expenses, "amount");

  worksheet.addRow([]);
  worksheet.addRow(["", "", "Total Pendapatan", "", "", report.totals.total_revenue]);
  worksheet.addRow(["", "", "Total HPP", "", "", report.totals.total_cogs]);
  worksheet.addRow(["", "", "Laba Kotor", "", "", report.totals.gross_profit]);
  worksheet.addRow(["", "", "Total Beban", "", "", report.totals.total_expenses]);
  const netIncome = worksheet.addRow(["", "", "Laba/Rugi Bersih", "", "", report.totals.net_income]);
  netIncome.font = { bold: true };

  worksheet.columns = [
    { key: "code", width: 16 },
    { key: "name", width: 34 },
    { key: "type", width: 14 },
    { key: "debit", width: 18, style: { numFmt: '"Rp"#,##0.00' } },
    { key: "credit", width: 18, style: { numFmt: '"Rp"#,##0.00' } },
    { key: "amount", width: 18, style: { numFmt: '"Rp"#,##0.00' } }
  ];
  styleWorksheet(worksheet);

  return workbook.xlsx.writeBuffer();
}

async function balanceSheetXlsx(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = COMPANY_NAME;
  const worksheet = workbook.addWorksheet("Neraca");

  addWorkbookHeader(worksheet, "Neraca", `Per ${report.as_of_date}`, "F");
  worksheet.addRow([]);
  const header = worksheet.addRow(["Kode Akun", "Nama Akun", "Tipe", "Debit", "Kredit", "Saldo Akhir"]);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };

  addExcelRows(worksheet, "Aset", report.assets, "ending_balance");
  addExcelRows(worksheet, "Liabilitas", report.liabilities, "ending_balance");
  addExcelRows(worksheet, "Ekuitas", report.equity, "ending_balance");

  worksheet.addRow([]);
  worksheet.addRow(["", "", "Total Aset", "", "", report.totals.total_assets]);
  worksheet.addRow(["", "", "Total Liabilitas", "", "", report.totals.total_liabilities]);
  worksheet.addRow(["", "", "Total Ekuitas", "", "", report.totals.total_equity]);
  worksheet.addRow(["", "", "Liabilitas + Ekuitas", "", "", report.totals.total_liabilities_and_equity]);
  const difference = worksheet.addRow(["", "", "Selisih", "", "", report.totals.difference]);
  difference.font = { bold: true };

  worksheet.columns = [
    { key: "code", width: 18 },
    { key: "name", width: 34 },
    { key: "type", width: 14 },
    { key: "debit", width: 18, style: { numFmt: '"Rp"#,##0.00' } },
    { key: "credit", width: 18, style: { numFmt: '"Rp"#,##0.00' } },
    { key: "balance", width: 18, style: { numFmt: '"Rp"#,##0.00' } }
  ];
  styleWorksheet(worksheet);

  return workbook.xlsx.writeBuffer();
}

async function cashFlowXlsx(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = COMPANY_NAME;
  const worksheet = workbook.addWorksheet("Arus Kas");

  addWorkbookHeader(
    worksheet,
    "Laporan Arus Kas",
    `Periode ${report.period.start_date} sampai ${report.period.end_date}`,
    "D"
  );

  worksheet.addRow([]);
  const header = worksheet.addRow(["Kategori", "Kode Akun", "Nama Akun", "Jumlah"]);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };

  for (const [category, rows] of [
    ["Operasi", report.operating],
    ["Investasi", report.investing],
    ["Pendanaan", report.financing]
  ]) {
    for (const row of rows) {
      worksheet.addRow([category, row.account_code, row.account_name, Number(row.cash_flow_amount || 0)]);
    }
  }

  worksheet.addRow([]);
  worksheet.addRow(["", "", "Kas Bersih Operasi", report.totals.net_operating_cash_flow]);
  worksheet.addRow(["", "", "Kas Bersih Investasi", report.totals.net_investing_cash_flow]);
  worksheet.addRow(["", "", "Kas Bersih Pendanaan", report.totals.net_financing_cash_flow]);
  const netCash = worksheet.addRow(["", "", "Kenaikan/Penurunan Kas", report.totals.net_cash_flow]);
  netCash.font = { bold: true };

  worksheet.columns = [
    { key: "category", width: 16 },
    { key: "code", width: 18 },
    { key: "name", width: 36 },
    { key: "amount", width: 20, style: { numFmt: '"Rp"#,##0.00' } }
  ];
  styleWorksheet(worksheet);

  return workbook.xlsx.writeBuffer();
}

module.exports = {
  makeFileName,
  setDownloadHeaders,
  incomeStatementPdf,
  balanceSheetPdf,
  cashFlowPdf,
  incomeStatementXlsx,
  balanceSheetXlsx,
  cashFlowXlsx
};
