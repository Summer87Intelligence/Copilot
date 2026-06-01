// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require("pdfkit/js/pdfkit.standalone.js") as new (
  opts?: PDFKit.PDFDocumentOptions
) => PDFKit.PDFDocument;

import type { TopClientsReportModel } from "./build-top-clients-report-model";

const COLORS = {
  ink: "#1a1a1a",
  muted: "#6b7280",
  accent: "#1a5fa8",
  border: "#d1d5db",
  rowAlt: "#f8fafc",
  headerBg: "#e8f0f8",
  riskAlto: "#be123c",
  riskMedio: "#b45309",
  riskBajo: "#15803d",
};

const PAGE = { margin: 48, width: 595, height: 842 };
const FOOTER_RESERVE = 48;
const MAX_Y = PAGE.height - PAGE.margin - FOOTER_RESERVE;

const ROW_H = 22;
const ROW_PAD_V = 6;

// # | Cliente | Ventas | Deuda total | Deuda vencida | Part.% | Riesgo
// Total: 499px (595 - 48 - 48)
const COL = {
  rank: { w: 22 },
  client: { w: 137 },
  sales: { w: 78 },
  debt: { w: 78 },
  overdue: { w: 78 },
  share: { w: 48 },
  risk: { w: 58 },
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

function formatPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}

function truncate(doc: PDFKit.PDFDocument, text: string, width: number): string {
  if (doc.widthOfString(text) <= width) return text;
  let t = text;
  while (t.length > 1 && doc.widthOfString(`${t}…`) > width) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

function riskColor(risk: string): string {
  if (risk === "Alto") return COLORS.riskAlto;
  if (risk === "Medio") return COLORS.riskMedio;
  return COLORS.riskBajo;
}

function sortLabel(sortBy: string): string {
  if (sortBy === "debt") return "ordenado por deuda total";
  if (sortBy === "overdue") return "ordenado por deuda vencida";
  return "ordenado por facturación";
}

export type RenderTopClientsReportPdfOptions = {
  model: TopClientsReportModel;
};

export function renderTopClientsReportPdf(
  options: RenderTopClientsReportPdfOptions
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
      .text("Clientes principales", PAGE.margin, y);
    y += 26;

    // Subtitle
    doc
      .fillColor(COLORS.ink)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(`${model.currency} — ${model.period.label} — ${sortLabel(model.sortBy)}`, PAGE.margin, y);
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
      `Facturación acumulada visible en Copilot. Deuda y vencimiento al día de la emisión.`,
      PAGE.margin,
      y,
      { width: TABLE_W }
    );
    y += 18;

    // Summary box
    const summaryLines = [
      `Clientes activos: ${model.totals.clientCount}`,
      `Facturación total ${model.currency}: ${formatMoney(model.totals.netSales, model.currency)}`,
      `Deuda total ${model.currency}: ${formatMoney(model.totals.totalDebt, model.currency)}`,
      `Deuda vencida ${model.currency}: ${formatMoney(model.totals.overdueDebt, model.currency)}`,
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
          `No hay clientes con actividad en ${model.currency}.`,
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
      `Deuda total: ${formatMoney(model.totals.totalDebt, model.currency)}`,
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
    ["rank", "#", "center"],
    ["client", "Cliente", "left"],
    ["sales", "Facturación", "right"],
    ["debt", "Deuda total", "right"],
    ["overdue", "Vencida", "right"],
    ["share", "Part.%", "right"],
    ["risk", "Riesgo", "center"],
  ];
  for (const [key, label, align] of headers) {
    doc.text(label, colX(key) + 4, y + 6, { width: COL[key].w - 8, align });
  }
  return y + h + 2;
}

function renderDataRow(
  doc: PDFKit.PDFDocument,
  row: TopClientsReportModel["rows"][number],
  index: number,
  y: number
): number {
  if (index % 2 === 1) {
    doc.fillColor(COLORS.rowAlt).rect(PAGE.margin, y, TABLE_W, ROW_H).fill();
  }

  const textY = y + ROW_PAD_V;
  doc.fillColor(COLORS.ink).font("Helvetica").fontSize(7.5);

  doc.text(String(row.rank), colX("rank") + 4, textY, {
    width: COL.rank.w - 8,
    align: "center",
  });
  doc.text(
    truncate(doc, row.clientName, COL.client.w - 8),
    colX("client") + 4,
    textY,
    { width: COL.client.w - 8 }
  );
  doc.text(formatMoneyOrDash(row.netSales, row.currency), colX("sales") + 4, textY, {
    width: COL.sales.w - 8,
    align: "right",
  });
  doc.text(formatMoneyOrDash(row.totalDebt, row.currency), colX("debt") + 4, textY, {
    width: COL.debt.w - 8,
    align: "right",
  });
  doc.text(formatMoneyOrDash(row.overdueDebt, row.currency), colX("overdue") + 4, textY, {
    width: COL.overdue.w - 8,
    align: "right",
  });
  doc.text(formatPercent(row.sharePercent), colX("share") + 4, textY, {
    width: COL.share.w - 8,
    align: "right",
  });

  doc.fillColor(riskColor(row.risk));
  doc.text(row.risk, colX("risk") + 4, textY, {
    width: COL.risk.w - 8,
    align: "center",
  });

  doc.fillColor(COLORS.ink);
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
