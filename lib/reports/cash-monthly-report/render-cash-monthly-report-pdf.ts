// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require("pdfkit/js/pdfkit.standalone.js") as new (
  opts?: PDFKit.PDFDocumentOptions
) => PDFKit.PDFDocument;

import type { CashMonthlyReportModel } from "./build-cash-monthly-report-model";

const COLORS = {
  ink: "#1a1a1a",
  muted: "#6b7280",
  accent: "#1a5fa8",
  border: "#d1d5db",
  rowAlt: "#f8fafc",
  headerBg: "#e8f0f8",
  incomeGreen: "#15803d",
  expenseRed: "#be123c",
};

const PAGE = { margin: 48, width: 595, height: 842 };
const FOOTER_RESERVE = 48;
const MAX_Y = PAGE.height - PAGE.margin - FOOTER_RESERVE;

const ROW_H = 22;
const ROW_PAD_V = 6;

// Fecha | Tipo | Concepto | Ingreso | Egreso | Saldo
// Total: 499px (595 - 48 - 48)
const COL = {
  date: { w: 60 },
  type: { w: 65 },
  concept: { w: 149 },
  income: { w: 75 },
  expense: { w: 75 },
  balance: { w: 75 },
} as const;

type ColKey = keyof typeof COL;

const TABLE_W = Object.values(COL).reduce((s, c) => s + c.w, 0);

function colX(key: ColKey): number {
  const keys = Object.keys(COL) as ColKey[];
  let x = PAGE.margin;
  for (const k of keys) {
    if (k === key) return x;
    x += COL[k].w;
  }
  return x;
}

function formatDate(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

function formatMoney(amount: number, currency: "UYU" | "USD"): string {
  if (currency === "USD") {
    const n = amount.toLocaleString("es-UY", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `U$S ${n}`;
  }
  const n = Math.round(amount).toLocaleString("es-UY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return `$ ${n}`;
}

function formatMoneyOrDash(amount: number, currency: "UYU" | "USD"): string {
  if (amount === 0) return "—";
  return formatMoney(amount, currency);
}

function truncate(doc: PDFKit.PDFDocument, text: string, width: number): string {
  if (doc.widthOfString(text) <= width) return text;
  let t = text;
  while (t.length > 1 && doc.widthOfString(`${t}…`) > width) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

export type RenderCashMonthlyReportPdfOptions = {
  model: CashMonthlyReportModel;
};

export function renderCashMonthlyReportPdf(
  options: RenderCashMonthlyReportPdfOptions
): Promise<Buffer> {
  const { model } = options;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: PAGE.margin,
      bufferPages: true,
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let y = PAGE.margin;
    let pageNum = 1;

    const breakPage = () => {
      renderFooter(doc, pageNum);
      doc.addPage();
      pageNum += 1;
      y = PAGE.margin;
      y = renderTableHeader(doc, y);
    };

    const ensureSpace = (needed: number) => {
      if (y + needed > MAX_Y) breakPage();
    };

    // Title
    doc
      .fillColor(COLORS.accent)
      .font("Helvetica-Bold")
      .fontSize(17)
      .text("Reporte de caja mensual", PAGE.margin, y);
    y += 26;

    // Subtitle: currency — period
    doc
      .fillColor(COLORS.ink)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(`${model.currency} — ${model.period.label}`, PAGE.margin, y);
    y += 16;

    // Meta
    const emitDate = new Date(model.generatedAt).toLocaleDateString("es-UY", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8.5);
    doc.text(`Emisión: ${emitDate}`, PAGE.margin, y);
    y += 12;
    if (model.issuerName) {
      doc.text(`Empresa: ${model.issuerName}`, PAGE.margin, y);
      y += 12;
    }
    doc.text(
      `Período: ${formatDate(model.period.from)} — ${formatDate(model.period.to)}`,
      PAGE.margin,
      y
    );
    y += 18;

    // Summary box
    const summaryLines = [
      `Saldo inicial: ${formatMoney(model.openingBalance, model.currency)}`,
      `Ingresos del período: ${formatMoney(model.totals.totalIncome, model.currency)}`,
      `Egresos del período: ${formatMoney(model.totals.totalExpense, model.currency)}`,
      `Saldo final: ${formatMoney(model.totals.closingBalance, model.currency)}`,
    ];
    const summaryH = 14 + summaryLines.length * 13;
    doc.fillColor(COLORS.headerBg).rect(PAGE.margin, y, TABLE_W, summaryH).fill();
    doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(9).text("Resumen", PAGE.margin + 10, y + 6);
    doc.font("Helvetica").fontSize(8.5);
    let sy = y + 20;
    for (const line of summaryLines) {
      doc.fillColor(COLORS.ink).text(line, PAGE.margin + 10, sy);
      sy += 13;
    }
    y += summaryH + 14;

    // Empty state
    if (model.rows.length === 0) {
      ensureSpace(48);
      doc
        .fillColor(COLORS.muted)
        .font("Helvetica")
        .fontSize(10)
        .text(
          `No hay movimientos registrados para ${model.currency} en ${model.period.label}.`,
          PAGE.margin,
          y + 10,
          { width: TABLE_W, align: "center" }
        );
      renderFooter(doc, pageNum);
      doc.end();
      return;
    }

    // Table
    y = renderTableHeader(doc, y);

    for (let i = 0; i < model.rows.length; i++) {
      ensureSpace(ROW_H + 4);
      y = renderDataRow(doc, model.rows[i]!, i, y);
    }

    // Totals row
    ensureSpace(ROW_H + 6);
    y += 4;
    doc
      .strokeColor(COLORS.accent)
      .lineWidth(0.5)
      .moveTo(PAGE.margin, y)
      .lineTo(PAGE.margin + TABLE_W, y)
      .stroke();
    y += 5;
    doc.fillColor(COLORS.accent).font("Helvetica-Bold").fontSize(8);
    doc.text(
      `Saldo final: ${formatMoney(model.totals.closingBalance, model.currency)}`,
      PAGE.margin,
      y,
      { width: TABLE_W - 8, align: "right" }
    );
    y += 14;

    renderFooter(doc, pageNum);
    doc.end();
  });
}

function renderTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  const h = 20;
  doc.fillColor(COLORS.headerBg).rect(PAGE.margin, y, TABLE_W, h).fill();
  doc
    .strokeColor(COLORS.border)
    .lineWidth(0.5)
    .moveTo(PAGE.margin, y + h)
    .lineTo(PAGE.margin + TABLE_W, y + h)
    .stroke();

  doc.fillColor(COLORS.accent).font("Helvetica-Bold").fontSize(7.5);
  const headers: Array<[ColKey, string, "left" | "right" | "center"]> = [
    ["date", "Fecha", "left"],
    ["type", "Tipo", "left"],
    ["concept", "Concepto", "left"],
    ["income", "Ingreso", "right"],
    ["expense", "Egreso", "right"],
    ["balance", "Saldo", "right"],
  ];
  for (const [key, label, align] of headers) {
    doc.text(label, colX(key) + 4, y + 6, { width: COL[key].w - 8, align });
  }
  return y + h + 2;
}

function renderDataRow(
  doc: PDFKit.PDFDocument,
  row: CashMonthlyReportModel["rows"][number],
  index: number,
  y: number
): number {
  if (index % 2 === 1) {
    doc.fillColor(COLORS.rowAlt).rect(PAGE.margin, y, TABLE_W, ROW_H).fill();
  }

  const textY = y + ROW_PAD_V;
  doc.fillColor(COLORS.ink).font("Helvetica").fontSize(7.5);

  doc.text(formatDate(row.date), colX("date") + 4, textY, { width: COL.date.w - 8 });
  doc.text(row.typeLabel, colX("type") + 4, textY, { width: COL.type.w - 8 });
  doc.text(
    truncate(doc, row.concept, COL.concept.w - 8),
    colX("concept") + 4,
    textY,
    { width: COL.concept.w - 8 }
  );

  if (row.income > 0) {
    doc.fillColor(COLORS.incomeGreen);
  }
  doc.text(formatMoneyOrDash(row.income, row.currency), colX("income") + 4, textY, {
    width: COL.income.w - 8,
    align: "right",
  });

  doc.fillColor(COLORS.ink);
  if (row.expense > 0) {
    doc.fillColor(COLORS.expenseRed);
  }
  doc.text(formatMoneyOrDash(row.expense, row.currency), colX("expense") + 4, textY, {
    width: COL.expense.w - 8,
    align: "right",
  });

  doc.fillColor(COLORS.ink);
  doc.text(formatMoney(row.runningBalance, row.currency), colX("balance") + 4, textY, {
    width: COL.balance.w - 8,
    align: "right",
  });

  doc
    .strokeColor(COLORS.border)
    .lineWidth(0.25)
    .moveTo(PAGE.margin, y + ROW_H)
    .lineTo(PAGE.margin + TABLE_W, y + ROW_H)
    .stroke();

  return y + ROW_H;
}

function renderFooter(doc: PDFKit.PDFDocument, pageNum: number): void {
  const y = PAGE.height - PAGE.margin - 28;
  doc
    .strokeColor(COLORS.border)
    .lineWidth(0.35)
    .moveTo(PAGE.margin, y - 6)
    .lineTo(PAGE.margin + TABLE_W, y - 6)
    .stroke();
  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(7)
    .text(`Página ${pageNum}`, PAGE.margin, y, { width: TABLE_W, align: "right" });
  doc.text(
    "Documento informativo generado por Summer87 Copilot",
    PAGE.margin,
    y + 11,
    { width: TABLE_W, align: "center" }
  );
}
