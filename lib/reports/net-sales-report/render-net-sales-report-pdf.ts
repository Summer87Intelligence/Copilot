// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require("pdfkit/js/pdfkit.standalone.js") as new (
  opts?: PDFKit.PDFDocumentOptions
) => PDFKit.PDFDocument;

import type { NetSalesReportModel } from "./build-net-sales-report-model";

export const NET_SALES_PDF_INVOICE_TABLE_HEADERS = [
  "Fecha",
  "Número de factura",
  "Cliente",
  "Importe",
] as const;

const COLORS = {
  ink: "#1a1a1a",
  muted: "#6b7280",
  accent: "#1a5fa8",
  border: "#d1d5db",
  rowAlt: "#f8fafc",
  headerBg: "#e8f0f8",
};

const PAGE = { margin: 48, width: 595, height: 842 };
const FOOTER_RESERVE = 48;
const MAX_Y = PAGE.height - PAGE.margin - FOOTER_RESERVE;

const ROW_H = 22;
const ROW_PAD_V = 6;

// Fecha | Número | Cliente | Importe — 499px
const COL = {
  date: { w: 72 },
  number: { w: 92 },
  client: { w: 185 },
  amount: { w: 150 },
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

function formatPeriodRange(from: string, to: string): string {
  return `${formatDate(from)} – ${formatDate(to)}`;
}

function formatMoney(amount: number, currency: "UYU" | "USD"): string {
  const abs = Math.abs(amount);
  if (currency === "USD") {
    const n = abs.toLocaleString("es-UY", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const prefix = amount < 0 ? "- U$S " : "U$S ";
    return `${prefix}${n}`;
  }
  const n = Math.round(abs).toLocaleString("es-UY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  const prefix = amount < 0 ? "- $ " : "$ ";
  return `${prefix}${n}`;
}

function truncate(doc: PDFKit.PDFDocument, text: string, width: number): string {
  if (doc.widthOfString(text) <= width) return text;
  let t = text;
  while (t.length > 1 && doc.widthOfString(`${t}…`) > width) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

export type RenderNetSalesReportPdfOptions = {
  model: NetSalesReportModel;
};

export function renderNetSalesReportPdf(
  options: RenderNetSalesReportPdfOptions
): Promise<Buffer> {
  const { model } = options;
  const periodRange = formatPeriodRange(model.period.from, model.period.to);
  const invoiceCount = model.invoiceRows.filter((r) => !r.isCreditNote).length;

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
      y = renderInvoiceTableHeader(doc, y);
    };

    const ensureSpace = (needed: number) => {
      if (y + needed > MAX_Y) breakPage();
    };

    doc
      .fillColor(COLORS.accent)
      .font("Helvetica-Bold")
      .fontSize(17)
      .text("Reporte de ventas", PAGE.margin, y);
    y += 24;

    doc
      .fillColor(COLORS.ink)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(`Período: ${periodRange}`, PAGE.margin, y);
    y += 16;

    const emitDate = new Date(model.generatedAt).toLocaleDateString("es-UY", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8.5);
    doc.text(`Emisión: ${emitDate}`, PAGE.margin, y);
    y += 16;

    const summaryLines = [
      model.issuerName ? `Empresa: ${model.issuerName}` : null,
      `Moneda seleccionada: ${model.currency}`,
      `Cantidad de facturas: ${invoiceCount}`,
      `Total ventas: ${formatMoney(model.totals.invoiceRowsTotal, model.currency)}`,
    ].filter((line): line is string => Boolean(line));

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

    doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(9).text("Detalle de facturas", PAGE.margin, y);
    y += 16;

    if (model.invoiceRows.length === 0) {
      ensureSpace(48);
      doc
        .fillColor(COLORS.muted)
        .font("Helvetica")
        .fontSize(10)
        .text(
          `No hay facturas registradas para ${model.currency} en ${model.period.label}.`,
          PAGE.margin,
          y + 10,
          { width: TABLE_W, align: "center" }
        );
      renderFooter(doc, pageNum);
      doc.end();
      return;
    }

    y = renderInvoiceTableHeader(doc, y);

    for (let i = 0; i < model.invoiceRows.length; i++) {
      ensureSpace(ROW_H + 4);
      y = renderInvoiceDataRow(doc, model.invoiceRows[i]!, i, y, model.currency);
    }

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
    doc.text("Total ventas", colX("client") + 4, y, {
      width: COL.client.w - 8,
    });
    doc.text(
      formatMoney(model.totals.invoiceRowsTotal, model.currency),
      colX("amount") + 4,
      y,
      { width: COL.amount.w - 8,
        align: "right" }
    );
    y += 14;

    renderFooter(doc, pageNum);
    doc.end();
  });
}

function renderInvoiceTableHeader(doc: PDFKit.PDFDocument, y: number): number {
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
    ["date", NET_SALES_PDF_INVOICE_TABLE_HEADERS[0], "left"],
    ["number", NET_SALES_PDF_INVOICE_TABLE_HEADERS[1], "left"],
    ["client", NET_SALES_PDF_INVOICE_TABLE_HEADERS[2], "left"],
    ["amount", NET_SALES_PDF_INVOICE_TABLE_HEADERS[3], "right"],
  ];
  for (const [key, label, align] of headers) {
    doc.text(label, colX(key) + 4, y + 6, { width: COL[key].w - 8, align });
  }
  return y + h + 2;
}

function renderInvoiceDataRow(
  doc: PDFKit.PDFDocument,
  row: NetSalesReportModel["invoiceRows"][number],
  index: number,
  y: number,
  currency: "UYU" | "USD"
): number {
  if (index % 2 === 1) {
    doc.fillColor(COLORS.rowAlt).rect(PAGE.margin, y, TABLE_W, ROW_H).fill();
  }

  const textY = y + ROW_PAD_V;
  doc.fillColor(COLORS.ink).font("Helvetica").fontSize(7.5);

  doc.text(formatDate(row.issueDate), colX("date") + 4, textY, {
    width: COL.date.w - 8,
  });
  doc.text(
    truncate(doc, row.invoiceNumber, COL.number.w - 8),
    colX("number") + 4,
    textY,
    { width: COL.number.w - 8 }
  );
  doc.text(
    truncate(doc, row.clientName, COL.client.w - 8),
    colX("client") + 4,
    textY,
    { width: COL.client.w - 8 }
  );
  doc.text(formatMoney(row.amount, currency), colX("amount") + 4, textY, {
    width: COL.amount.w - 8,
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
