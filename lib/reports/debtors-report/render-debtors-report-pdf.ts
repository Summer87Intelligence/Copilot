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
  rowAlt: "#f8fafc",
  headerBg: "#e8f0f8",
};

const PAGE = { margin: 48, width: 595, height: 842 };
const FOOTER_RESERVE = 48;
const MAX_Y = PAGE.height - PAGE.margin - FOOTER_RESERVE;

const ROW_MIN_H = 22;
const ROW_PAD_V = 6;

// Cliente | Moneda | Total pendiente | Atrasado | Días de atraso | Contacto | Estado
const COL = {
  client: { w: 120 },
  currency: { w: 34 },
  debt: { w: 64 },
  overdue: { w: 64 },
  aging: { w: 52 },
  contact: { w: 78 },
  status: { w: 47 },
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

function summaryLinesForModel(model: DebtorsReportModel): string[] {
  const lines: string[] = [`Clientes incluidos: ${model.totals.clientsCount}`];
  const showUyu = model.currencyFilter !== "USD";
  const showUsd = model.currencyFilter !== "UYU";

  if (showUyu) {
    lines.push(`Total pendiente UYU: ${formatMoney(model.totals.totalDebtUyu, "UYU")}`);
    lines.push(`Atrasado UYU: ${formatMoney(model.totals.totalOverdueUyu, "UYU")}`);
  }
  if (showUsd) {
    lines.push(`Total pendiente USD: ${formatMoney(model.totals.totalDebtUsd, "USD")}`);
    lines.push(`Atrasado USD: ${formatMoney(model.totals.totalOverdueUsd, "USD")}`);
  }
  return lines;
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

    doc.fillColor(COLORS.accent).font("Helvetica-Bold").fontSize(17)
      .text("Reporte de deudores", PAGE.margin, y);
    y += 26;

    doc.fillColor(COLORS.ink).font("Helvetica").fontSize(9.5);
    doc.text(`Emisión: ${model.emittedAtLabel}`, PAGE.margin, y);
    y += 14;
    if (issuerName.trim()) {
      doc.text(`Empresa: ${issuerName.trim()}`, PAGE.margin, y);
      y += 14;
    }

    if (model.filtersLabel.length > 0) {
      doc.fillColor(COLORS.muted).fontSize(8.5).text("Filtros aplicados:", PAGE.margin, y);
      y += 11;
      for (const label of model.filtersLabel) {
        doc.text(`• ${label}`, PAGE.margin + 10, y, { width: PAGE.width - PAGE.margin * 2 });
        y += 11;
      }
      y += 4;
    }

    const summaryLines = summaryLinesForModel(model);
    const summaryH = 16 + summaryLines.length * 12;
    doc.fillColor(COLORS.headerBg).rect(PAGE.margin, y, TABLE_W, summaryH).fill();
    doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(9.5)
      .text("Resumen", PAGE.margin + 10, y + 8);
    doc.font("Helvetica").fontSize(8.5);
    let sy = y + 22;
    for (const line of summaryLines) {
      doc.text(line, PAGE.margin + 10, sy);
      sy += 12;
    }
    y += summaryH + 14;

    if (model.rows.length === 0) {
      ensureSpace(56);
      doc.fillColor(COLORS.muted).font("Helvetica").fontSize(11)
        .text(
          "No hay clientes que coincidan con los filtros seleccionados.",
          PAGE.margin,
          y + 12,
          { width: TABLE_W, align: "center" }
        );
      renderFooter(doc, pageNum);
      doc.end();
      return;
    }

    if (model.currencyFilter === "all") {
      // Render two sections: UYU first, then USD — never mix currencies
      const uyuRows = model.rows.filter((r) => r.currency === "UYU");
      const usdRows = model.rows.filter((r) => r.currency === "USD");

      const renderSection = (rows: typeof model.rows, label: string) => {
        if (rows.length === 0) return;
        ensureSpace(30);
        doc.fillColor(COLORS.accent).font("Helvetica-Bold").fontSize(10)
          .text(label, PAGE.margin, y + 4);
        y += 20;
        doc.moveTo(PAGE.margin, y).lineTo(PAGE.margin + TABLE_W, y)
          .strokeColor(COLORS.border).lineWidth(0.5).stroke();
        y += 6;
        y = renderTableHeader(doc, y);
        for (let i = 0; i < rows.length; i++) {
          ensureSpace(ROW_MIN_H + 4);
          y = renderDataRow(doc, rows[i]!, i, y);
        }
        y += 8;
      };

      renderSection(uyuRows, "Pesos (UYU)");
      renderSection(usdRows, "Dólares (USD)");
    } else {
      y = renderTableHeader(doc, y);
      for (let i = 0; i < model.rows.length; i++) {
        const row = model.rows[i]!;
        ensureSpace(ROW_MIN_H + 4);
        y = renderDataRow(doc, row, i, y);
      }
    }

    renderFooter(doc, pageNum);
    doc.end();
  });
}

function renderTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  const h = 20;
  doc.fillColor(COLORS.headerBg).rect(PAGE.margin, y, TABLE_W, h).fill();
  doc.strokeColor(COLORS.border).lineWidth(0.5)
    .moveTo(PAGE.margin, y + h)
    .lineTo(PAGE.margin + TABLE_W, y + h)
    .stroke();

  doc.fillColor(COLORS.accent).font("Helvetica-Bold").fontSize(7.5);
  const headers: Array<[ColKey, string, "left" | "right" | "center"]> = [
    ["client", "Cliente", "left"],
    ["currency", "Mon.", "center"],
    ["debt", "Total pendiente", "right"],
    ["overdue", "Atrasado", "right"],
    ["aging", "Días de atraso", "center"],
    ["contact", "Contacto", "left"],
    ["status", "Estado", "left"],
  ];
  for (const [key, label, align] of headers) {
    doc.text(label, colX(key) + 4, y + 6, {
      width: COL[key].w - 8,
      align,
    });
  }
  return y + h + 2;
}

function renderDataRow(
  doc: PDFKit.PDFDocument,
  row: DebtorsReportModel["rows"][number],
  index: number,
  y: number
): number {
  const rowH = ROW_MIN_H;
  if (index % 2 === 1) {
    doc.fillColor(COLORS.rowAlt).rect(PAGE.margin, y, TABLE_W, rowH).fill();
  }

  const textY = y + ROW_PAD_V;
  doc.fillColor(COLORS.ink).font("Helvetica").fontSize(7.5);

  doc.text(truncate(doc, row.clientName, COL.client.w - 8), colX("client") + 4, textY, {
    width: COL.client.w - 8,
  });
  doc.text(row.currency, colX("currency") + 4, textY, {
    width: COL.currency.w - 8,
    align: "center",
  });
  doc.text(formatMoney(row.debtAmount, row.currency), colX("debt") + 4, textY, {
    width: COL.debt.w - 8,
    align: "right",
  });
  doc.text(
    row.overdueAmount > 0 ? formatMoney(row.overdueAmount, row.currency) : "—",
    colX("overdue") + 4,
    textY,
    { width: COL.overdue.w - 8, align: "right" }
  );
  doc.text(row.overdueDaysLabel, colX("aging") + 4, textY, {
    width: COL.aging.w - 8,
    align: "center",
  });
  doc.text(truncate(doc, row.contactLabel, COL.contact.w - 8), colX("contact") + 4, textY, {
    width: COL.contact.w - 8,
  });
  doc.text(truncate(doc, row.statusLabel, COL.status.w - 8), colX("status") + 4, textY, {
    width: COL.status.w - 8,
  });

  doc.strokeColor(COLORS.border).lineWidth(0.25)
    .moveTo(PAGE.margin, y + rowH)
    .lineTo(PAGE.margin + TABLE_W, y + rowH)
    .stroke();

  return y + rowH;
}

function renderFooter(doc: PDFKit.PDFDocument, pageNum: number): void {
  const y = PAGE.height - PAGE.margin - 28;
  doc.strokeColor(COLORS.border).lineWidth(0.35)
    .moveTo(PAGE.margin, y - 6)
    .lineTo(PAGE.margin + TABLE_W, y - 6)
    .stroke();
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7)
    .text(`Página ${pageNum}`, PAGE.margin, y, { width: TABLE_W, align: "right" });
  doc.text(
    "Documento informativo generado por Summer87 Copilot",
    PAGE.margin,
    y + 11,
    { width: TABLE_W, align: "center" }
  );
}
