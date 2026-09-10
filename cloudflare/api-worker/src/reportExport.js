// Report export helpers built for the Cloudflare Workers runtime.
//
// The old Express backend used `exceljs` + `pdfkit`, both of which depend on
// Node's `fs`/`stream` internals and don't run in Workers. This module uses:
//   - `xlsx` (SheetJS community build) for XLSX generation — pure JS, no fs.
//   - `pdf-lib` for PDF generation — pure JS, built for serverless/edge use.
//
// NOTE: `xlsx`@0.18.x has known advisories (prototype pollution / ReDoS) that
// apply to *parsing* untrusted spreadsheet input. We never parse user-supplied
// files here — we only build workbooks from our own report data and write
// them out — so that attack surface does not apply to this usage.

import * as XLSX from "xlsx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const COMPANY_NAME = "Gudara";
const COMPANY_SUBTITLE = "Move Faster";
const MONEY_FORMAT = '"Rp"#,##0.00';
const GENERATED_LABEL = "Dibuat otomatis oleh Gudara Finance";

export function makeFileName(reportType, extension) {
  const stamp = new Date().toISOString().slice(0, 10);
  return `gudara-${reportType}-${stamp}.${extension}`;
}

export function contentTypeFor(format) {
  return format === "pdf"
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

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

// Build a cell that carries its own number format instead of relying on a
// "this column index is money" rule applied across a whole sheet. The old
// column-based approach mis-formatted plain counts (e.g. "Jumlah Jurnal",
// "Jumlah Transaksi") as currency whenever they happened to share a column
// index with a money value elsewhere in the sheet. SheetJS accepts a
// pre-built cell object anywhere in an aoa_to_sheet row, so each value now
// declares its own formatting and there's nothing left to misalign.
function moneyCell(value) {
  return { t: "n", v: Number(value || 0), z: MONEY_FORMAT };
}

function countCell(value) {
  return { t: "n", v: Number(value || 0), z: "#,##0" };
}

/* ------------------------------------------------------------------ */
/* XLSX                                                                */
/* ------------------------------------------------------------------ */

function baseRows(title, subtitle, summaryRows = []) {
  return [
    [COMPANY_NAME, "", "", GENERATED_LABEL],
    [COMPANY_SUBTITLE],
    [],
    [title],
    [subtitle],
    [],
    ...summaryRows,
    []
  ];
}

function pushAccountSection(rows, sectionTitle, items, amountKey, headerRow = ["Kode Akun", "Nama Akun", "Tipe", "Debit", "Kredit", "Jumlah"]) {
  rows.push([sectionTitle]);
  rows.push(headerRow);

  if (!items.length) {
    rows.push(["Tidak ada data."]);
  } else {
    for (const item of items) {
      rows.push([
        item.account_code,
        item.account_name,
        item.account_type,
        moneyCell(item.total_debit),
        moneyCell(item.total_credit),
        moneyCell(item[amountKey])
      ]);
    }
  }

  rows.push([]);
}

function pushTotalBlock(rows, totals) {
  rows.push(["Ringkasan Total"]);
  for (const [label, value] of totals) {
    rows.push(["", "", label, "", "", moneyCell(value)]);
  }
}

function finalizeSheet(rows, colWidths, sheetName, metadata = []) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = colWidths.map((wch) => ({ wch }));
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(1, colWidths.length - 2) } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: Math.max(1, colWidths.length - 1) } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: Math.max(1, colWidths.length - 1) } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: Math.max(1, colWidths.length - 1) } }
  ];
  ws["!freeze"] = { xSplit: 0, ySplit: 6 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["Metadata"],
      ["Perusahaan", COMPANY_NAME],
      ["Subtitle", COMPANY_SUBTITLE],
      ["Dibuat Pada", new Date().toISOString()],
      ...metadata
    ]),
    "Info"
  );

  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}

export function incomeStatementXlsx(report) {
  const rows = baseRows(
    "Laporan Laba Rugi",
    `Periode ${report.period.start_date} sampai ${report.period.end_date}`,
    [
      ["Total Pendapatan", moneyCell(report.totals.total_revenue), "Laba Kotor", moneyCell(report.totals.gross_profit), "Laba/Rugi Bersih", moneyCell(report.totals.net_income)],
      ["Total HPP", moneyCell(report.totals.total_cogs), "Total Beban", moneyCell(report.totals.total_expenses)]
    ]
  );

  pushAccountSection(rows, "Pendapatan", report.revenue, "amount");
  pushAccountSection(rows, "Harga Pokok Penjualan", report.cogs, "amount");
  pushAccountSection(rows, "Beban Operasional", report.expenses, "amount");

  pushTotalBlock(rows, [
    ["Total Pendapatan", report.totals.total_revenue],
    ["Total HPP", report.totals.total_cogs],
    ["Laba Kotor", report.totals.gross_profit],
    ["Total Beban", report.totals.total_expenses],
    ["Laba/Rugi Bersih", report.totals.net_income]
  ]);

  return finalizeSheet(rows, [18, 36, 16, 18, 18, 20], "Laba Rugi", [
    ["Jenis Laporan", "Laba Rugi"],
    ["Periode Mulai", report.period.start_date],
    ["Periode Selesai", report.period.end_date]
  ]);
}

export function balanceSheetXlsx(report) {
  const rows = baseRows("Neraca", `Per ${report.as_of_date}`, [
    ["Total Aset", moneyCell(report.totals.total_assets), "Total Liabilitas", moneyCell(report.totals.total_liabilities), "Total Ekuitas", moneyCell(report.totals.total_equity)],
    ["Liabilitas + Ekuitas", moneyCell(report.totals.total_liabilities_and_equity), "Selisih", moneyCell(report.totals.difference)]
  ]);

  pushAccountSection(rows, "Aset", report.assets, "ending_balance", ["Kode Akun", "Nama Akun", "Tipe", "Debit", "Kredit", "Saldo Akhir"]);
  pushAccountSection(rows, "Liabilitas", report.liabilities, "ending_balance", ["Kode Akun", "Nama Akun", "Tipe", "Debit", "Kredit", "Saldo Akhir"]);
  pushAccountSection(rows, "Ekuitas", report.equity, "ending_balance", ["Kode Akun", "Nama Akun", "Tipe", "Debit", "Kredit", "Saldo Akhir"]);

  pushTotalBlock(rows, [
    ["Total Aset", report.totals.total_assets],
    ["Total Liabilitas", report.totals.total_liabilities],
    ["Total Ekuitas", report.totals.total_equity],
    ["Liabilitas + Ekuitas", report.totals.total_liabilities_and_equity],
    ["Selisih", report.totals.difference]
  ]);

  return finalizeSheet(rows, [18, 36, 16, 18, 18, 20], "Neraca", [
    ["Jenis Laporan", "Neraca"],
    ["Tanggal", report.as_of_date],
    ["Status Balance", report.totals.is_balanced ? "Balance" : "Tidak Balance"]
  ]);
}

export function cashFlowXlsx(report) {
  const rows = baseRows(
    "Laporan Arus Kas",
    `Periode ${report.period.start_date} sampai ${report.period.end_date}`,
    [
      ["Kas Bersih Operasi", moneyCell(report.totals.net_operating_cash_flow), "Kas Bersih Investasi", moneyCell(report.totals.net_investing_cash_flow)],
      ["Kas Bersih Pendanaan", moneyCell(report.totals.net_financing_cash_flow), "Kenaikan/Penurunan Kas", moneyCell(report.totals.net_cash_flow)]
    ]
  );

  rows.push(["Aktivitas Arus Kas"]);
  rows.push(["Kategori", "Kode Akun", "Nama Akun", "Jumlah"]);

  for (const [category, items] of [
    ["Operasi", report.operating],
    ["Investasi", report.investing],
    ["Pendanaan", report.financing]
  ]) {
    for (const item of items) {
      rows.push([category, item.account_code, item.account_name, moneyCell(item.cash_flow_amount)]);
    }
  }

  rows.push([]);
  rows.push(["Ringkasan Total"]);
  rows.push(["", "", "Kas Bersih Operasi", moneyCell(report.totals.net_operating_cash_flow)]);
  rows.push(["", "", "Kas Bersih Investasi", moneyCell(report.totals.net_investing_cash_flow)]);
  rows.push(["", "", "Kas Bersih Pendanaan", moneyCell(report.totals.net_financing_cash_flow)]);
  rows.push(["", "", "Kenaikan/Penurunan Kas", moneyCell(report.totals.net_cash_flow)]);

  return finalizeSheet(rows, [18, 20, 40, 22], "Arus Kas", [
    ["Jenis Laporan", "Arus Kas"],
    ["Periode Mulai", report.period.start_date],
    ["Periode Selesai", report.period.end_date]
  ]);
}

export function journalXlsx(entries, meta) {
  const rows = baseRows(
    "Jurnal Harian",
    meta.subtitle,
    [
      ["Jumlah Jurnal", countCell(entries.length), "Total Nominal", moneyCell(entries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0))]
    ]
  );
  rows.push(["Daftar Jurnal"]);
  rows.push(["Tanggal", "No. Referensi", "Deskripsi", "Akun Debit", "Akun Kredit", "Nominal", "Status"]);

  const statusLabel = { posted: "Posted", draft: "Draft", void: "Void" };

  if (!entries.length) {
    rows.push(["Tidak ada data."]);
  } else {
    for (const entry of entries) {
      rows.push([
        entry.entry_date,
        entry.reference_no || "",
        entry.description,
        entry.debit_accounts,
        entry.credit_accounts,
        moneyCell(entry.amount),
        statusLabel[entry.status] || entry.status
      ]);
    }
  }

  rows.push([]);
  rows.push(["", "", "", "", "Total", moneyCell(entries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0)), ""]);

  return finalizeSheet(rows, [16, 18, 38, 28, 28, 20, 14], "Jurnal Harian", [
    ["Jenis Laporan", "Jurnal Harian"],
    ["Filter", meta.subtitle]
  ]);
}

export async function journalPdf(entries, meta) {
  return buildPdf((ctx) => {
    drawHeader(ctx, "Jurnal Harian", meta.subtitle);
    const statusLabel = { posted: "Posted", draft: "Draft", void: "Void" };
    const total = entries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    drawSummaryCards(ctx, [
      { label: "Jumlah Jurnal", value: String(entries.length) },
      { label: "Total Nominal", value: formatMoney(total) },
      { label: "Status", value: "Export Siap Audit" }
    ]);
    drawSimpleTable(
      ctx,
      "Daftar Jurnal",
      [
        { label: "Tanggal", x: MARGIN + 8, width: 72 },
        { label: "Referensi", x: MARGIN + 86, width: 50 },
        { label: "Deskripsi", x: MARGIN + 142, width: 143 },
        { label: "Debit", x: MARGIN + 291, width: 64, muted: true },
        { label: "Kredit", x: MARGIN + 361, width: 64, muted: true },
        { label: "Nominal", x: MARGIN + 431, width: 72, align: "right" }
      ],
      entries.map((entry) => [
        formatDateLabel(entry.entry_date),
        entry.reference_no || "-",
        `${entry.description} (${statusLabel[entry.status] || entry.status})`,
        entry.debit_accounts,
        entry.credit_accounts,
        formatMoney(entry.amount)
      ]),
      24
    );
    drawTotalLine(ctx, "Total Nominal", total, true);
  });
}

export function accountLedgerXlsx(transactions, meta) {
  const rows = baseRows(
    `Buku Besar - ${meta.account_code} ${meta.account_name}`,
    `Periode ${meta.period.start_date} sampai ${meta.period.end_date}`,
    [
      ["Total Debit", moneyCell(meta.total_debit), "Total Kredit", moneyCell(meta.total_credit), "Saldo Akhir", moneyCell(meta.ending_balance)],
      ["Jumlah Transaksi", countCell(transactions.length)]
    ]
  );
  rows.push(["Mutasi Akun"]);
  rows.push(["Tanggal", "No. Referensi", "Deskripsi", "Memo", "Debit", "Kredit", "Saldo Berjalan"]);

  if (!transactions.length) {
    rows.push(["Tidak ada data."]);
  } else {
    for (const trx of transactions) {
      rows.push([
        trx.entry_date,
        trx.reference_no || "",
        trx.description,
        trx.memo || "",
        moneyCell(trx.debit),
        moneyCell(trx.credit),
        moneyCell(trx.running_balance)
      ]);
    }
  }

  rows.push([]);
  rows.push(["", "", "", "Total", moneyCell(meta.total_debit), moneyCell(meta.total_credit), moneyCell(meta.ending_balance)]);

  return finalizeSheet(rows, [16, 18, 38, 26, 20, 20, 20], "Buku Besar", [
    ["Jenis Laporan", "Buku Besar"],
    ["Kode Akun", meta.account_code],
    ["Nama Akun", meta.account_name]
  ]);
}

/* ------------------------------------------------------------------ */
/* PDF                                                                 */
/* ------------------------------------------------------------------ */

const PAGE_WIDTH = 595.28; // A4 in points
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const TEXT_COLOR = rgb(0.09, 0.13, 0.16);
const MUTED_COLOR = rgb(0.42, 0.45, 0.5);
const LINE_COLOR = rgb(0.8, 0.82, 0.85);
const RULE_COLOR = rgb(0.15, 0.17, 0.2);

// Deliberately restrained palette: near-black ink for headings/emphasis and
// one dark bar for table headers, plus a single light-gray highlight for the
// document's one most-important figure (grand total / sisa tagihan). No
// brand blue, no gold, no zebra striping, no bordered panels — the goal is
// a plain, typography-led invoice/report instead of a "blocky" colored one.
const INK = rgb(0.1, 0.1, 0.12); // headings, table header bar, emphasis text
const HIGHLIGHT_BG = rgb(0.945, 0.947, 0.952); // the one shaded row (grand total)
const WHITE = rgb(1, 1, 1);

// Every table column and every total-line value lines up on this single
// right edge so tables and the totals beneath them read as one connected
// block instead of a table with a loose total floating somewhere near it.
const CONTENT_RIGHT = MARGIN + 503; // = 545, i.e. PAGE_WIDTH - MARGIN - 8 padding

async function buildPdf(draw) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(COMPANY_NAME);
  pdfDoc.setProducer(COMPANY_NAME);

  const ctx = {
    pdfDoc,
    helv: await pdfDoc.embedFont(StandardFonts.Helvetica),
    helvBold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    page: null,
    y: PAGE_HEIGHT - MARGIN
  };

  ctx.addPage = () => {
    ctx.page = ctx.pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    ctx.y = PAGE_HEIGHT - MARGIN;
  };

  ctx.addPage();

  ctx.ensureSpace = (needed = 20) => {
    if (ctx.y - needed < MARGIN) {
      ctx.addPage();
    }
  };

  await draw(ctx);
  drawFooters(ctx);

  return ctx.pdfDoc.save();
}

// pdf-lib's built-in StandardFonts (Helvetica etc.) only support WinAnsi
// (Windows-1252) encoding. Any character outside that set — emoji, most
// non-Latin scripts, some smart punctuation — makes drawText() throw and
// crashes the whole export with an uncaught error. Journal descriptions,
// reference numbers, and account names come from free-text user input, so
// we can't assume they're WinAnsi-safe. Sanitize before every draw call.
function sanitizeText(font, value) {
  const str = String(value ?? "");

  try {
    // Fast path: whole string encodes fine, no per-character work needed.
    font.widthOfTextAtSize(str, 10);
    return str;
  } catch {
    let out = "";
    for (const ch of str) {
      try {
        font.widthOfTextAtSize(ch, 10);
        out += ch;
      } catch {
        out += "?";
      }
    }
    return out;
  }
}

function drawLeft(ctx, text, x, opts = {}) {
  const font = opts.font || ctx.helv;
  const size = opts.size || 10;
  const str = sanitizeText(font, text);
  ctx.page.drawText(str, { x, y: ctx.y, size, font, color: opts.color || TEXT_COLOR });
}

function drawRight(ctx, text, rightX, opts = {}) {
  const font = opts.font || ctx.helv;
  const size = opts.size || 10;
  const str = sanitizeText(font, text);
  const width = font.widthOfTextAtSize(str, size);
  ctx.page.drawText(str, { x: rightX - width, y: ctx.y, size, font, color: opts.color || TEXT_COLOR });
}

function truncateText(font, text, size, maxWidth) {
  const str = sanitizeText(font, text);
  if (font.widthOfTextAtSize(str, size) <= maxWidth) return str;

  let out = str;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}...`;
}

function drawBoxText(ctx, text, x, y, width, opts = {}) {
  const font = opts.font || ctx.helv;
  const size = opts.size || 9;
  ctx.page.drawText(truncateText(font, text, size, width), {
    x,
    y,
    size,
    font,
    color: opts.color || TEXT_COLOR
  });
}

function drawHeader(ctx, title, subtitle) {
  const top = PAGE_HEIGHT - 40;

  ctx.page.drawText(sanitizeText(ctx.helvBold, COMPANY_NAME), { x: MARGIN, y: top - 3, size: 15, font: ctx.helvBold, color: INK });
  ctx.page.drawText(sanitizeText(ctx.helv, COMPANY_SUBTITLE), { x: MARGIN, y: top - 15, size: 8.5, font: ctx.helv, color: MUTED_COLOR });

  const rightLabel = "EXPORT";
  const rightDate = new Date().toISOString().slice(0, 10);
  const labelWidth = ctx.helvBold.widthOfTextAtSize(rightLabel, 8);
  const dateWidth = ctx.helv.widthOfTextAtSize(rightDate, 8);
  ctx.page.drawText(rightLabel, { x: PAGE_WIDTH - MARGIN - labelWidth, y: top, size: 8, font: ctx.helvBold, color: MUTED_COLOR });
  ctx.page.drawText(rightDate, { x: PAGE_WIDTH - MARGIN - dateWidth, y: top - 14, size: 8, font: ctx.helv, color: MUTED_COLOR });

  ctx.page.drawLine({ start: { x: MARGIN, y: top - 28 }, end: { x: PAGE_WIDTH - MARGIN, y: top - 28 }, thickness: 0.75, color: LINE_COLOR });

  ctx.page.drawText(sanitizeText(ctx.helvBold, title), { x: MARGIN, y: top - 54, size: 19, font: ctx.helvBold, color: INK });
  ctx.page.drawText(truncateText(ctx.helv, subtitle, 9.5, PAGE_WIDTH - MARGIN * 2), {
    x: MARGIN,
    y: top - 71,
    size: 9.5,
    font: ctx.helv,
    color: MUTED_COLOR
  });

  ctx.page.drawLine({ start: { x: MARGIN, y: top - 86 }, end: { x: PAGE_WIDTH - MARGIN, y: top - 86 }, thickness: 0.5, color: LINE_COLOR });

  ctx.y = top - 106;
}

// Plain label/value columns (no borders, no fills) — a quick at-a-glance
// summary without turning the page into a row of colored cards.
function drawSummaryCards(ctx, cards) {
  const gap = 10;
  const cardWidth = (PAGE_WIDTH - MARGIN * 2 - gap * 2) / 3;
  const cardHeight = 40;

  cards.forEach((card, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = MARGIN + col * (cardWidth + gap);
    const y = ctx.y - row * (cardHeight + gap) - cardHeight;

    drawBoxText(ctx, card.label, x, y + 22, cardWidth - 12, { size: 7.8, font: ctx.helvBold, color: MUTED_COLOR });
    drawBoxText(ctx, card.value, x, y + 4, cardWidth - 12, { size: 12.5, font: ctx.helvBold, color: INK });
  });

  const rows = Math.ceil(cards.length / 3);
  const bottom = ctx.y - rows * (cardHeight + gap) + gap - 6;
  ctx.page.drawLine({ start: { x: MARGIN, y: bottom }, end: { x: PAGE_WIDTH - MARGIN, y: bottom }, thickness: 0.75, color: LINE_COLOR });
  ctx.y = bottom - 16;
}

// Filled dark bar with white column labels — the one deliberate block of
// color in the document, used consistently for every table header instead
// of scattering color across panels, cards, and totals too.
function drawTableHeader(ctx, columns, boxLeft = MARGIN, boxWidth = PAGE_WIDTH - MARGIN * 2) {
  const barHeight = 20;
  ctx.ensureSpace(barHeight + 4);
  ctx.page.drawRectangle({ x: boxLeft, y: ctx.y - 14, width: boxWidth, height: barHeight, color: INK });
  const headerBaselineY = ctx.y - 8.5;
  for (const column of columns) {
    if (column.align === "right") {
      const savedY = ctx.y;
      ctx.y = headerBaselineY;
      drawRight(ctx, column.label, column.x + column.width, { font: ctx.helvBold, size: 7.5, color: WHITE });
      ctx.y = savedY;
    } else {
      drawBoxText(ctx, column.label, column.x, headerBaselineY, column.width, { font: ctx.helvBold, size: 7.5, color: WHITE });
    }
  }
  ctx.y -= barHeight + 4;
}

function drawFinancialSection(ctx, title, rows, amountKey, extraSpace = 0) {
  // Reserve enough space for the title + header row so we don't start a
  // section right at the bottom of a page with nothing under it.
  ctx.ensureSpace(54);
  drawLeft(ctx, title, MARGIN, { font: ctx.helvBold, size: 11, color: INK });
  ctx.y -= 20;

  const columns = [
    { label: "Kode", x: MARGIN + 10, width: 54 },
    { label: "Nama Akun", x: MARGIN + 70, width: 250 },
    { label: "Tipe", x: MARGIN + 326, width: 70 },
    { label: "Jumlah", x: MARGIN + 404, width: 99, align: "right" }
  ];
  drawTableHeader(ctx, columns);

  if (!rows.length) {
    drawBoxText(ctx, "Tidak ada data.", MARGIN + 10, ctx.y, 260, { size: 8.5, color: MUTED_COLOR });
    ctx.y -= 20;
    return;
  }

  rows.forEach((row, index) => {
    // On the last row, also make sure the total line(s) that immediately
    // follow this section have room — otherwise they'd be stranded alone
    // at the top of the next page. Earlier rows only need their own space.
    const isLastRow = index === rows.length - 1;
    ctx.ensureSpace(isLastRow ? 20 + extraSpace : 20);
    drawBoxText(ctx, row.account_code || "-", MARGIN + 10, ctx.y, 54, { size: 8 });
    drawBoxText(ctx, row.account_name || "-", MARGIN + 70, ctx.y, 250, { size: 8 });
    drawBoxText(ctx, row.account_type || "-", MARGIN + 326, ctx.y, 70, { size: 8, color: MUTED_COLOR });
    drawRight(ctx, formatMoney(row[amountKey]), CONTENT_RIGHT, { size: 8 });
    ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y - 7 }, end: { x: PAGE_WIDTH - MARGIN, y: ctx.y - 7 }, thickness: 0.5, color: LINE_COLOR });
    ctx.y -= 18;
  });

  ctx.y -= 8;
}

function drawSimpleTable(ctx, title, columns, rows, extraSpace = 0, footer = null) {
  ctx.ensureSpace(54);
  drawLeft(ctx, title, MARGIN, { font: ctx.helvBold, size: 11, color: INK });
  ctx.y -= 20;
  drawTableHeader(ctx, columns);

  // Totals (e.g. "Jumlah Invoice" / "Sisa Tagihan") drawn as the closing
  // rows of this same table instead of a separate floating box below it —
  // so an invoice's item list and its totals read as one continuous card,
  // right-aligned to the same column the item amounts already use.
  const drawFooter = () => {
    if (!footer || !footer.length) return;
    ctx.ensureSpace(footer.length * 24 + 14);
    ctx.y -= 2;
    ctx.page.drawLine({ start: { x: MARGIN + 8, y: ctx.y + 12 }, end: { x: CONTENT_RIGHT, y: ctx.y + 12 }, thickness: 0.5, color: LINE_COLOR });
    ctx.y -= 8;
    footer.forEach(({ label, value, strong }) => {
      if (strong) {
        // The one shaded row in the table: a plain light-gray highlight
        // behind the closing total (e.g. "Sisa Tagihan"), instead of a
        // filled color bar — enough emphasis without adding another block
        // of brand color.
        const barWidth = 220;
        const barX = CONTENT_RIGHT - barWidth;
        ctx.page.drawRectangle({ x: barX, y: ctx.y - 4, width: barWidth, height: 20, color: HIGHLIGHT_BG });
        drawLeft(ctx, label, barX + 10, { font: ctx.helvBold, size: 9.5, color: INK });
        drawRight(ctx, value, CONTENT_RIGHT - 10, { font: ctx.helvBold, size: 10.5, color: INK });
        ctx.y -= 24;
        return;
      }
      drawRight(ctx, label, CONTENT_RIGHT - 130, { font: ctx.helv, size: 8.5, color: MUTED_COLOR });
      drawRight(ctx, value, CONTENT_RIGHT, { font: ctx.helv, size: 8.5 });
      ctx.y -= 20;
    });
  };

  if (!rows.length) {
    drawBoxText(ctx, "Tidak ada data.", MARGIN + 10, ctx.y, 260, { size: 8.5, color: MUTED_COLOR });
    ctx.y -= 20;
    drawFooter();
    return;
  }

  rows.forEach((row, index) => {
    const isLastRow = index === rows.length - 1;
    ctx.ensureSpace(isLastRow ? 21 + extraSpace : 21);
    columns.forEach((column, colIndex) => {
      const value = row[colIndex] ?? "";
      if (column.align === "right") {
        drawRight(ctx, value, column.x + column.width, { size: 7.7 });
      } else {
        drawBoxText(ctx, value, column.x, ctx.y, column.width, { size: 7.7, color: column.muted ? MUTED_COLOR : TEXT_COLOR });
      }
    });
    ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y - 7 }, end: { x: PAGE_WIDTH - MARGIN, y: ctx.y - 7 }, thickness: 0.5, color: LINE_COLOR });
    ctx.y -= 18;
  });

  drawFooter();

  ctx.y -= 8;
}

function drawTotalLine(ctx, label, value, strong = false) {
  ctx.ensureSpace(30);
  const width = strong ? 260 : 230;
  const x = CONTENT_RIGHT - width;

  if (strong) {
    // The single shaded highlight in the document, reserved for its most
    // important figure (e.g. net income / ending balance) — a plain rule
    // above plus bold ink text reads as "final total" without another
    // block of color.
    const barHeight = 22;
    ctx.page.drawRectangle({ x, y: ctx.y - 5, width, height: barHeight, color: HIGHLIGHT_BG });
    drawLeft(ctx, label, x + 10, { font: ctx.helvBold, size: 10, color: INK });
    drawRight(ctx, formatMoney(value), CONTENT_RIGHT - 10, { font: ctx.helvBold, size: 11, color: INK });
    ctx.y -= 26;
    return;
  }

  ctx.page.drawLine({ start: { x, y: ctx.y + 11 }, end: { x: CONTENT_RIGHT, y: ctx.y + 11 }, thickness: 0.5, color: LINE_COLOR });
  drawLeft(ctx, label, x + 10, { font: ctx.helv, size: 10, color: MUTED_COLOR });
  drawRight(ctx, formatMoney(value), CONTENT_RIGHT, { font: ctx.helv, size: 10 });
  ctx.y -= 20;
}

function drawFooters(ctx) {
  const pages = ctx.pdfDoc.getPages();
  pages.forEach((page, index) => {
    page.drawLine({ start: { x: MARGIN, y: 30 }, end: { x: PAGE_WIDTH - MARGIN, y: 30 }, thickness: 0.4, color: LINE_COLOR });
    page.drawText(GENERATED_LABEL, { x: MARGIN, y: 18, size: 7.5, font: ctx.helv, color: MUTED_COLOR });
    page.drawText(`Halaman ${index + 1} dari ${pages.length}`, {
      x: PAGE_WIDTH - MARGIN - 70,
      y: 18,
      size: 7.5,
      font: ctx.helv,
      color: MUTED_COLOR
    });
  });
}

// A plain, small-caps section label — used above the "Ditagihkan Kepada" /
// "Detail Invoice" blocks on the invoice. No fill, no bar: just a muted
// label, matching the reference invoice's plain "Bill To:" style.
function drawSectionLabel(ctx, text, x, topY) {
  drawBoxText(ctx, text, x, topY - 10, 260, { font: ctx.helvBold, size: 7.5, color: MUTED_COLOR });
}

export async function accountLedgerPdf(transactions, meta) {
  return buildPdf((ctx) => {
    drawHeader(
      ctx,
      `Buku Besar - ${meta.account_code} ${meta.account_name}`,
      `Periode ${formatDateLabel(meta.period.start_date)} sampai ${formatDateLabel(meta.period.end_date)}`
    );

    drawSummaryCards(ctx, [
      { label: "Total Debit", value: formatMoney(meta.total_debit) },
      { label: "Total Kredit", value: formatMoney(meta.total_credit) },
      { label: "Saldo Akhir", value: formatMoney(meta.ending_balance) }
    ]);
    drawSimpleTable(
      ctx,
      "Mutasi Akun",
      [
        { label: "Tanggal", x: MARGIN + 8, width: 72 },
        { label: "Referensi", x: MARGIN + 86, width: 50 },
        { label: "Deskripsi", x: MARGIN + 142, width: 137 },
        { label: "Debit", x: MARGIN + 285, width: 66, align: "right" },
        { label: "Kredit", x: MARGIN + 357, width: 66, align: "right" },
        { label: "Saldo", x: MARGIN + 429, width: 74, align: "right" }
      ],
      transactions.map((trx) => [
        formatDateLabel(trx.entry_date),
        trx.reference_no || "-",
        trx.memo ? `${trx.description} - ${trx.memo}` : trx.description,
        trx.debit > 0 ? formatMoney(trx.debit) : "-",
        trx.credit > 0 ? formatMoney(trx.credit) : "-",
        formatMoney(trx.running_balance)
      ]),
      72
    );

    drawTotalLine(ctx, "Total Debit", meta.total_debit);
    drawTotalLine(ctx, "Total Kredit", meta.total_credit);
    drawTotalLine(ctx, "Saldo Akhir", meta.ending_balance, true);
  });
}

export async function incomeStatementPdf(report) {
  return buildPdf((ctx) => {
    drawHeader(
      ctx,
      "Laporan Laba Rugi",
      `Periode ${formatDateLabel(report.period.start_date)} sampai ${formatDateLabel(report.period.end_date)}`
    );

    drawSummaryCards(ctx, [
      { label: "Total Pendapatan", value: formatMoney(report.totals.total_revenue) },
      { label: "Laba Kotor", value: formatMoney(report.totals.gross_profit) },
      { label: "Laba/Rugi Bersih", value: formatMoney(report.totals.net_income) }
    ]);
    drawFinancialSection(ctx, "Pendapatan", report.revenue, "amount", 24);
    drawTotalLine(ctx, "Total Pendapatan", report.totals.total_revenue);
    drawFinancialSection(ctx, "Harga Pokok Penjualan", report.cogs, "amount", 48);
    drawTotalLine(ctx, "Total HPP", report.totals.total_cogs);
    drawTotalLine(ctx, "Laba Kotor", report.totals.gross_profit, true);
    drawFinancialSection(ctx, "Beban Operasional", report.expenses, "amount", 48);
    drawTotalLine(ctx, "Total Beban", report.totals.total_expenses);
    drawTotalLine(ctx, "Laba/Rugi Bersih", report.totals.net_income, true);
  });
}

export async function balanceSheetPdf(report) {
  return buildPdf((ctx) => {
    drawHeader(ctx, "Neraca", `Per ${formatDateLabel(report.as_of_date)}`);

    drawSummaryCards(ctx, [
      { label: "Total Aset", value: formatMoney(report.totals.total_assets) },
      { label: "Liabilitas + Ekuitas", value: formatMoney(report.totals.total_liabilities_and_equity) },
      { label: "Status Neraca", value: report.totals.is_balanced ? "Balance" : "Tidak Balance" }
    ]);
    drawFinancialSection(ctx, "Aset", report.assets, "ending_balance", 26);
    drawTotalLine(ctx, "Total Aset", report.totals.total_assets, true);
    drawFinancialSection(ctx, "Liabilitas", report.liabilities, "ending_balance", 24);
    drawTotalLine(ctx, "Total Liabilitas", report.totals.total_liabilities);
    drawFinancialSection(ctx, "Ekuitas", report.equity, "ending_balance", 72);
    drawTotalLine(ctx, "Total Ekuitas", report.totals.total_equity);
    drawTotalLine(ctx, "Liabilitas + Ekuitas", report.totals.total_liabilities_and_equity, true);
    drawTotalLine(ctx, "Selisih", report.totals.difference, true);
  });
}

export async function cashFlowPdf(report) {
  return buildPdf((ctx) => {
    drawHeader(
      ctx,
      "Laporan Arus Kas",
      `Periode ${formatDateLabel(report.period.start_date)} sampai ${formatDateLabel(report.period.end_date)}`
    );

    drawSummaryCards(ctx, [
      { label: "Kas Bersih Operasi", value: formatMoney(report.totals.net_operating_cash_flow) },
      { label: "Kas Bersih Investasi", value: formatMoney(report.totals.net_investing_cash_flow) },
      { label: "Kenaikan/Penurunan Kas", value: formatMoney(report.totals.net_cash_flow) }
    ]);
    drawFinancialSection(ctx, "Aktivitas Operasi", report.operating, "cash_flow_amount", 24);
    drawTotalLine(ctx, "Kas Bersih Operasi", report.totals.net_operating_cash_flow);
    drawFinancialSection(ctx, "Aktivitas Investasi", report.investing, "cash_flow_amount", 24);
    drawTotalLine(ctx, "Kas Bersih Investasi", report.totals.net_investing_cash_flow);
    drawFinancialSection(ctx, "Aktivitas Pendanaan", report.financing, "cash_flow_amount", 48);
    drawTotalLine(ctx, "Kas Bersih Pendanaan", report.totals.net_financing_cash_flow);
    drawTotalLine(ctx, "Kenaikan/Penurunan Kas", report.totals.net_cash_flow, true);
  });
}

/* ------------------------------------------------------------------ */
/* Invoice (Piutang) -- dokumen untuk dikirim ke konsumen              */
/* ------------------------------------------------------------------ */

const AR_STATUS_LABELS = {
  belum_lunas: "Belum Lunas",
  sebagian: "Dibayar Sebagian",
  lunas: "Lunas",
  jatuh_tempo: "Jatuh Tempo",
  void: "Dibatalkan"
};

export async function arInvoicePdf(invoice) {
  const statusLabel = AR_STATUS_LABELS[invoice.payment_status] || invoice.payment_status || "";

  return buildPdf((ctx) => {
    drawHeader(ctx, `Invoice ${invoice.invoice_no}`, `Ditagihkan kepada ${invoice.contact_name}`);

    drawSummaryCards(ctx, [
      { label: "Jumlah Invoice", value: formatMoney(invoice.amount) },
      { label: "Sudah Dibayar", value: formatMoney(invoice.paid_amount) },
      { label: "Sisa Tagihan", value: formatMoney(invoice.balance) }
    ]);

    // "Bill To" / invoice detail, side by side as plain text — a muted
    // small-caps label above each, no bars, no borders, no fill. Matches a
    // plain letterhead-style invoice rather than a card-heavy dashboard.
    const leftX = MARGIN;
    const rightX = MARGIN + 262;
    const panelWidth = 251;
    ctx.ensureSpace(90);
    const panelTop = ctx.y;

    drawSectionLabel(ctx, "DITAGIHKAN KEPADA", leftX, panelTop);
    drawSectionLabel(ctx, "DETAIL INVOICE", rightX, panelTop);

    let leftY = panelTop - 24;
    drawBoxText(ctx, invoice.contact_name, leftX, leftY, panelWidth - 10, { font: ctx.helvBold, size: 11 });
    leftY -= 15;
    if (invoice.contact_phone) {
      drawBoxText(ctx, invoice.contact_phone, leftX, leftY, panelWidth - 10, { size: 9, color: MUTED_COLOR });
      leftY -= 13;
    }
    if (invoice.contact_address) {
      drawBoxText(ctx, invoice.contact_address, leftX, leftY, panelWidth - 10, { size: 9, color: MUTED_COLOR });
      leftY -= 13;
    }

    let rightY = panelTop - 24;
    const detailRows = [
      ["No. Invoice", invoice.invoice_no],
      ["Tanggal Invoice", formatDateLabel(invoice.invoice_date)],
      ["Jatuh Tempo", formatDateLabel(invoice.due_date)],
      ["Status", statusLabel]
    ];
    for (const [label, value] of detailRows) {
      drawBoxText(ctx, label, rightX, rightY, 88, { size: 8.5, color: MUTED_COLOR });
      drawBoxText(ctx, value, rightX + 90, rightY, panelWidth - 90, { size: 9, font: ctx.helvBold });
      rightY -= 15;
    }

    ctx.y = Math.min(leftY, rightY) - 12;

    // Item table: itemized (No / Deskripsi / Qty / Harga Satuan / Total)
    // when the invoice carries line items, mirroring a formal quotation
    // layout; falls back to a single description+amount row for older
    // invoices created before line items existed.
    const hasItems = Array.isArray(invoice.items) && invoice.items.length > 0;

    const footerRows = [];
    if (hasItems) {
      footerRows.push({ label: "Subtotal", value: formatMoney(invoice.subtotal_amount ?? invoice.amount) });
      if (invoice.discount_amount) {
        footerRows.push({ label: "Diskon", value: `-${formatMoney(invoice.discount_amount)}` });
      }
      if (invoice.tax_amount) {
        footerRows.push({ label: "Pajak (PPN)", value: formatMoney(invoice.tax_amount) });
      }
    }
    footerRows.push({ label: "Jumlah Invoice", value: formatMoney(invoice.amount) });
    footerRows.push({ label: "Sudah Dibayar", value: formatMoney(invoice.paid_amount) });
    footerRows.push({ label: "Sisa Tagihan", value: formatMoney(invoice.balance), strong: true });

    if (hasItems) {
      drawSimpleTable(
        ctx,
        "Rincian",
        [
          { label: "No", x: MARGIN + 8, width: 20 },
          { label: "Deskripsi", x: MARGIN + 32, width: 208 },
          { label: "Qty", x: MARGIN + 244, width: 34, align: "right" },
          { label: "Harga Satuan", x: MARGIN + 282, width: 92, align: "right" },
          { label: "Total", x: MARGIN + 378, width: 125, align: "right" }
        ],
        invoice.items.map((item, index) => [
          String(index + 1),
          item.description,
          String(item.qty),
          formatMoney(item.unit_price),
          formatMoney(item.qty * item.unit_price)
        ]),
        0,
        footerRows
      );
    } else {
      // Totals are drawn as this same table's closing rows (via the footer
      // option) so the item list and its totals read as one block instead
      // of a detached line floating below it.
      drawSimpleTable(
        ctx,
        "Rincian",
        [
          { label: "Deskripsi", x: MARGIN + 8, width: 411 },
          { label: "Jumlah", x: MARGIN + 425, width: 78, align: "right" }
        ],
        [[invoice.description, formatMoney(invoice.amount)]],
        0,
        footerRows
      );
    }

    if (invoice.status === "void" && invoice.void_reason) {
      ctx.ensureSpace(30);
      drawBoxText(ctx, `Invoice ini dibatalkan. Alasan: ${invoice.void_reason}`, MARGIN, ctx.y, PAGE_WIDTH - MARGIN * 2, {
        size: 9,
        color: rgb(0.75, 0.08, 0.18)
      });
      ctx.y -= 22;
    }

    if (invoice.payments && invoice.payments.length > 0) {
      drawSimpleTable(
        ctx,
        "Riwayat Pembayaran",
        [
          { label: "Tanggal", x: MARGIN + 8, width: 335 },
          { label: "Jumlah", x: MARGIN + 425, width: 78, align: "right" }
        ],
        invoice.payments.map((payment) => [
          formatDateLabel(payment.payment_date),
          formatMoney(payment.amount)
        ]),
        0
      );
    }

    // Payment method (left) + signature line (right), side by side, plain
    // text — only drawn if the invoice actually carries bank details, so we
    // never invent payment information that wasn't provided by the caller.
    const hasBankInfo = Boolean(invoice.bank_name && invoice.bank_account_no);
    if (hasBankInfo) {
      ctx.ensureSpace(70);
      const blockTop = ctx.y;
      drawLeft(ctx, "Metode Pembayaran", MARGIN, { font: ctx.helvBold, size: 10, color: INK });
      let payY = blockTop - 16;
      drawBoxText(ctx, `Bank ${invoice.bank_name}`, MARGIN, payY, 260, { size: 9, font: ctx.helvBold });
      payY -= 13;
      drawBoxText(ctx, `No. Rek: ${invoice.bank_account_no}`, MARGIN, payY, 260, { size: 9, color: MUTED_COLOR });
      payY -= 13;
      if (invoice.bank_account_holder) {
        drawBoxText(ctx, `a.n. ${invoice.bank_account_holder}`, MARGIN, payY, 260, { size: 9, color: MUTED_COLOR });
        payY -= 13;
      }

      let sigBottom = payY;
      if (invoice.signatory_name) {
        // Signature rule sits ~44pt below the block top to leave room for a
        // handwritten signature.
        ctx.page.drawLine({ start: { x: CONTENT_RIGHT - 140, y: blockTop - 44 }, end: { x: CONTENT_RIGHT, y: blockTop - 44 }, thickness: 0.5, color: LINE_COLOR });
        ctx.y = blockTop - 58;
        drawRight(ctx, invoice.signatory_name, CONTENT_RIGHT, { font: ctx.helvBold, size: 9.5 });
        sigBottom = ctx.y;
        if (invoice.signatory_title) {
          ctx.y -= 12;
          drawRight(ctx, invoice.signatory_title, CONTENT_RIGHT, { size: 8.5, color: MUTED_COLOR });
          sigBottom = ctx.y;
        }
      }

      ctx.y = Math.min(payY, sigBottom) - 16;
    }

    // Notes / Terms — plain labels and text, no box, no fill, like the
    // reference invoice's closing "Notes:" / "Terms:" lines.
    const noteLines = invoice.notes
      ? String(invoice.notes).split("\n").filter(Boolean)
      : ["Terima kasih atas kepercayaan Anda berbelanja di Gudara."];
    ctx.ensureSpace(20 + noteLines.length * 13);
    drawLeft(ctx, "Catatan", MARGIN, { font: ctx.helvBold, size: 9.5, color: INK });
    ctx.y -= 16;
    for (const line of noteLines) {
      drawBoxText(ctx, line, MARGIN, ctx.y, PAGE_WIDTH - MARGIN * 2, { size: 8.8, color: MUTED_COLOR });
      ctx.y -= 13;
    }
  });
}
