// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require("pdfkit/js/pdfkit.standalone.js") as new (
  opts?: PDFKit.PDFDocumentOptions
) => PDFKit.PDFDocument;

import type { DebtorsReportModel } from "./debtors-report-types";

const COLORS = {
  ink: "#1a1a1a",
  muted: "#6b7280",
  accent: "#1a5fa8",
  border: "#d1d5db",
  rowAlt: "#f7f9fb",
  headerBg: "#eef4fa",
};

const PAGE = { margin: 48, width: 595, height: 842 };
const FOOTER_RESERVE = 40;
const MAX_Y = PAGE.height - PAGE.margin - FOOTER_RESERVE;

// Cliente | Moneda | Deuda | Vencido | Antigüedad | Contacto | Estado
const COL = {
  client: { w: 118 },
  currency: { w: 36 },
  debt: { w: 62 },
  overdue: { w: 62 },
  aging: { w: 58 },
  contact: { w: 72 },
  status: { w: 51 },
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
  const n = Math.abs(amount).toLocaleString("es-UY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return currency === "USD" ? `U$S ${n}` : `$ ${n}`;
}

function truncate(doc: PDFKit.PDFDocument, text: string, width: number): string {
  if (doc.widthOfString(text) <= width) return text;
  let t = text;
  while (t.length > 1 && doc.widthOfString(`${t}…`) > width) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

export type RenderDebtorsReportPdfOptions = {
  model: DebtorsReportModel;
  issuerName: string;
};

export function renderDebtorsReportPdf(
  options: RenderDebtorsReportPdfOptions
): Promise<Buffer> {
  const { model, issuerName } = options;

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

    // ── Portada / encabezado ──
    doc.fillColor(COLORS.accent).font("Helvetica-Bold").fontSize(16)
      .text("Reporte de deudores", PAGE.margin, y);
    y += 22;

    doc.fillColor(COLORS.ink).font("Helvetica").fontSize(9);
    doc.text(`Emisión: ${model.emittedAtLabel}`, PAGE.margin, y);
    y += 12;
    if (issuerName.trim()) {
      doc.text(`Empresa: ${issuerName.trim()}`, PAGE.margin, y);
      y += 12;
    }

    doc.fillColor(COLORS.muted).fontSize(8).text("Filtros aplicados:", PAGE.margin, y);
    y += 10;
    for (const label of model.filtersLabel) {
      doc.text(`• ${label}`, PAGE.margin + 8, y, { width: PAGE.width - PAGE.margin * 2 });
      y += 10;
    }
    y += 6;

    // ── Resumen ──
    doc.fillColor(COLORS.headerBg).rect(PAGE.margin, y, TABLE_W, 52).fill();
    doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(9)
      .text("Resumen", PAGE.margin + 8, y + 8);
    doc.font("Helvetica").fontSize(8);
    const summaryLines = [
      `Clientes incluidos: ${model.totals.clientsCount}`,
      `Total UYU: ${formatMoney(model.totals.totalDebtUyu, "UYU")}`,
      `Vencido UYU: ${formatMoney(model.totals.totalOverdueUyu, "UYU")}`,
      `Total USD: ${formatMoney(model.totals.totalDebtUsd, "USD")}`,
      `Vencido USD: ${formatMoney(model.totals.totalOverdueUsd, "USD")}`,
    ];
    let sy = y + 20;
    for (const line of summaryLines) {
      doc.text(line, PAGE.margin + 8, sy);
      sy += 10;
    }
    y += 58;

    if (model.rows.length === 0) {
      ensureSpace(40);
      doc.fillColor(COLORS.muted).font("Helvetica").fontSize(10)
        .text(
          "No hay clientes que coincidan con los filtros seleccionados.",
          PAGE.margin,
          y,
          { width: TABLE_W, align: "center" }
        );
      renderFooter(doc, pageNum);
      doc.end();
      return;
    }

    y = renderTableHeader(doc, y);

    for (let i = 0; i < model.rows.length; i++) {
      const row = model.rows[i]!;
      ensureSpace(18);
      if (i > 0 && y === PAGE.margin) {
        // header already drawn on new page
      }
      y = renderDataRow(doc, row, i, y);
    }

    renderFooter(doc, pageNum);
    doc.end();
  });
}

function renderTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  doc.fillColor(COLORS.headerBg).rect(PAGE.margin, y, TABLE_W, 16).fill();
  doc.fillColor(COLORS.accent).font("Helvetica-Bold").fontSize(7);
  const headers: Array<[ColKey, string]> = [
    ["client", "Cliente"],
    ["currency", "Moneda"],
    ["debt", "Deuda"],
    ["overdue", "Vencido"],
    ["aging", "Antigüedad"],
    ["contact", "Contacto"],
    ["status", "Estado"],
  ];
  for (const [key, label] of headers) {
    doc.text(label, colX(key) + 3, y + 4, { width: COL[key].w - 6 });
  }
  return y + 18;
}

function renderDataRow(
  doc: PDFKit.PDFDocument,
  row: DebtorsReportModel["rows"][number],
  index: number,
  y: number
): number {
  const rowH = 16;
  if (index % 2 === 1) {
    doc.fillColor(COLORS.rowAlt).rect(PAGE.margin, y, TABLE_W, rowH).fill();
  }
  doc.fillColor(COLORS.ink).font("Helvetica").fontSize(7);

  const statusText = row.agingBadge ? `${row.statusLabel} ${row.agingBadge}` : row.statusLabel;

  doc.text(truncate(doc, row.clientName, COL.client.w - 6), colX("client") + 3, y + 4, {
    width: COL.client.w - 6,
  });
  doc.text(row.currency, colX("currency") + 3, y + 4, { width: COL.currency.w - 6 });
  doc.text(formatMoney(row.debtAmount, row.currency), colX("debt") + 3, y + 4, {
    width: COL.debt.w - 6,
    align: "right",
  });
  doc.text(
    row.overdueAmount > 0 ? formatMoney(row.overdueAmount, row.currency) : "—",
    colX("overdue") + 3,
    y + 4,
    { width: COL.overdue.w - 6, align: "right" }
  );
  doc.text(row.overdueDaysLabel, colX("aging") + 3, y + 4, {
    width: COL.aging.w - 6,
  });
  doc.text(truncate(doc, row.contactLabel, COL.contact.w - 6), colX("contact") + 3, y + 4, {
    width: COL.contact.w - 6,
  });
  doc.text(truncate(doc, statusText, COL.status.w - 6), colX("status") + 3, y + 4, {
    width: COL.status.w - 6,
  });

  doc.strokeColor(COLORS.border).lineWidth(0.25)
    .moveTo(PAGE.margin, y + rowH)
    .lineTo(PAGE.margin + TABLE_W, y + rowH)
    .stroke();

  return y + rowH;
}

function renderFooter(doc: PDFKit.PDFDocument, pageNum: number): void {
  const y = PAGE.height - PAGE.margin - 24;
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7)
    .text(`Página ${pageNum}`, PAGE.margin, y, { width: TABLE_W, align: "right" });
  doc.text(
    "Documento informativo generado por Summer87 Copilot",
    PAGE.margin,
    y + 10,
    { width: TABLE_W, align: "center" }
  );
}
