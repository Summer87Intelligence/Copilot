import PDFDocument from "pdfkit";
import type {
  AccountStatementByCurrency,
  ClientAccountStatement,
  AccountStatementMovement,
} from "@/lib/copilot-client-account-statement";
import { formatStatementAmount, describeMovementKind } from "@/lib/copilot-client-account-statement";

const COLORS = {
  ink: "#1a1a1a",
  muted: "#6b7280",
  accent: "#1f6b4a",
  border: "#e5e7eb",
  headerBg: "#f9fafb",
  debitFg: "#374151",
  creditFg: "#1f6b4a",
  negativeFg: "#b91c1c",
};

const PAGE = { margin: 48, width: 595 };
const COL_WIDTHS = { date: 72, type: 70, number: 80, detail: 150, debit: 72, credit: 72, balance: 79 };

function tableRight(x: number, w: number): number {
  return x + w;
}

function colX(startX: number, key: keyof typeof COL_WIDTHS): number {
  const keys = Object.keys(COL_WIDTHS) as Array<keyof typeof COL_WIDTHS>;
  let x = startX;
  for (const k of keys) {
    if (k === key) return x;
    x += COL_WIDTHS[k];
  }
  return x;
}

function formatDate(ymd: string): string {
  if (!ymd || ymd.length < 10) return ymd;
  const [y, m, d] = ymd.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function renderCurrencyBlock(
  doc: PDFKit.PDFDocument,
  block: AccountStatementByCurrency,
  startY: number
): number {
  const mx = PAGE.margin;
  let y = startY;
  const totalW = Object.values(COL_WIDTHS).reduce((a, b) => a + b, 0);

  // Currency header
  doc.rect(mx, y, totalW, 22).fill(COLORS.accent);
  const label = block.currency === "UYU" ? "Pesos uruguayos (UYU)" : "Dólares (USD)";
  doc.fillColor("white").font("Helvetica-Bold").fontSize(9).text(label, mx + 8, y + 7, { width: 200 });
  y += 22;

  // Column header row
  doc.rect(mx, y, totalW, 18).fill(COLORS.headerBg);
  const headers: Record<keyof typeof COL_WIDTHS, string> = {
    date: "Fecha",
    type: "Tipo",
    number: "Número",
    detail: "Detalle",
    debit: "Debe",
    credit: "Haber",
    balance: "Saldo",
  };
  doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(7.5);
  for (const [key, label] of Object.entries(headers) as Array<[keyof typeof COL_WIDTHS, string]>) {
    const x = colX(mx, key);
    const isNum = key === "debit" || key === "credit" || key === "balance";
    const opts = isNum ? { width: COL_WIDTHS[key] - 4, align: "right" as const } : { width: COL_WIDTHS[key] - 4 };
    doc.text(label, x + 4, y + 5, opts);
  }
  doc.moveTo(mx, y + 18).lineTo(mx + totalW, y + 18).strokeColor(COLORS.border).lineWidth(0.5).stroke();
  y += 18;

  // Movement rows
  const movements = block.movements;
  for (let i = 0; i < movements.length; i++) {
    const mv = movements[i];
    if (y > 780) {
      doc.addPage();
      y = PAGE.margin;
    }
    const rowH = 16;
    if (i % 2 === 1) {
      doc.rect(mx, y, totalW, rowH).fill("#f8fafb");
    }
    doc.fillColor(COLORS.ink).font("Helvetica").fontSize(7.5);

    const negBal = mv.runningBalance < 0;
    const cells: Array<[keyof typeof COL_WIDTHS, string, boolean]> = [
      ["date", formatDate(mv.date), false],
      ["type", describeMovementKind(mv.kind), false],
      ["number", mv.number || "—", false],
      ["detail", mv.detail || "—", false],
      ["debit", mv.debit > 0 ? formatStatementAmount(mv.debit, block.currency, { showZero: false }) : "", true],
      ["credit", mv.credit > 0 ? formatStatementAmount(mv.credit, block.currency, { showZero: false }) : "", true],
      ["balance", formatStatementAmount(mv.runningBalance, block.currency), true],
    ];
    for (const [key, text, isNum] of cells) {
      const x = colX(mx, key);
      let fg = COLORS.ink;
      if (key === "credit") fg = COLORS.creditFg;
      if (key === "balance" && negBal) fg = COLORS.negativeFg;
      const opts = isNum
        ? { width: COL_WIDTHS[key] - 4, align: "right" as const }
        : { width: COL_WIDTHS[key] - 4, lineBreak: false };
      doc.fillColor(fg).text(text, x + 4, y + 4, opts);
    }
    doc.moveTo(mx, y + rowH).lineTo(mx + totalW, y + rowH).strokeColor(COLORS.border).lineWidth(0.3).stroke();
    y += rowH;
  }

  // Summary row
  if (y > 760) { doc.addPage(); y = PAGE.margin; }
  doc.rect(mx, y, totalW, 20).fill(COLORS.headerBg);
  const s = block.summary;
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(7.5);
  doc.text("Totales", colX(mx, "detail") + 4, y + 6, { width: COL_WIDTHS.detail - 4 });
  doc.text(formatStatementAmount(s.totalDebit, block.currency), colX(mx, "debit") + 4, y + 6, { width: COL_WIDTHS.debit - 4, align: "right" });
  doc.fillColor(COLORS.creditFg)
    .text(formatStatementAmount(s.totalCredit, block.currency), colX(mx, "credit") + 4, y + 6, { width: COL_WIDTHS.credit - 4, align: "right" });
  const balFg = s.finalBalance < 0 ? COLORS.negativeFg : COLORS.ink;
  doc.fillColor(balFg)
    .text(formatStatementAmount(s.finalBalance, block.currency), colX(mx, "balance") + 4, y + 6, { width: COL_WIDTHS.balance - 4, align: "right" });
  y += 20;

  // Negative balance note
  if (s.hasNegativeBalance) {
    if (y > 770) { doc.addPage(); y = PAGE.margin; }
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7)
      .text("* Saldo negativo: el cliente tiene saldo a favor (anticipos o pagos sin imputación detectable).", mx, y + 4);
    y += 16;
  }

  return y + 12;
}

export type AccountStatementPdfOptions = {
  companyName: string;
  statement: ClientAccountStatement;
  generatedAt?: Date;
  currencies?: Array<"UYU" | "USD">;
};

export async function renderAccountStatementPdf(opts: AccountStatementPdfOptions): Promise<Buffer> {
  const { companyName, statement, generatedAt = new Date(), currencies = ["UYU", "USD"] } = opts;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: PAGE.margin, size: "A4", autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const mx = PAGE.margin;
    let y = mx;

    // ── Header ──
    doc.fillColor(COLORS.accent).font("Helvetica-Bold").fontSize(16)
      .text("Estado de Cuenta", mx, y);
    y += 22;
    doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(11)
      .text(companyName, mx, y);
    y += 16;
    const dateStr = generatedAt.toLocaleDateString("es-UY", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "America/Montevideo",
    });
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8)
      .text(`Generado el ${dateStr}`, mx, y);
    y += 20;

    // divider
    doc.moveTo(mx, y).lineTo(PAGE.width - mx, y).strokeColor(COLORS.border).lineWidth(1).stroke();
    y += 16;

    // ── Currency blocks ──
    for (const currency of currencies) {
      const block = currency === "UYU" ? statement.uyu : statement.usd;
      if (block.movements.length === 0 && block.summary.movementCount === 0) continue;
      if (y > 720) { doc.addPage(); y = PAGE.margin; }
      y = renderCurrencyBlock(doc, block, y);
    }

    // ── Footer note ──
    if (statement.unknownCurrencyCount > 0) {
      doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7)
        .text(`${statement.unknownCurrencyCount} movimiento(s) descartado(s) por moneda no determinable.`, mx, y);
      y += 12;
    }
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7)
      .text("Este documento es de carácter informativo. Los importes surgen de los datos sincronizados con el sistema contable.", mx, y);

    doc.end();
  });
}
