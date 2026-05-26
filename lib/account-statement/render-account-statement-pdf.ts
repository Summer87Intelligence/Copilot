// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require("pdfkit/js/pdfkit.standalone.js") as new (
  opts?: PDFKit.PDFDocumentOptions
) => PDFKit.PDFDocument;

import type {
  AccountStatementByCurrency,
  ClientAccountStatement,
  AccountStatementMovement,
} from "@/lib/copilot-client-account-statement";
import { extractSerieNumero } from "./extract-serie-numero";
import { ISSUER_FALLBACK, type IssuerInfo } from "./issuer-fallback";

// ── Constantes de layout ──────────────────────────────────────────────────────

const COLORS = {
  ink: "#1a1a1a",
  muted: "#6b7280",
  accent: "#1a5fa8",      // azul contable como Zeta
  border: "#d1d5db",
  rowAlt: "#f9fafb",      // fila alternada
  clientBg: "#f3f4f6",    // bloque gris cliente
};

const PAGE = { margin: 48, width: 595, height: 842 };
const FOOTER_RESERVE = 36;
const MAX_Y = PAGE.height - PAGE.margin - FOOTER_RESERVE;

// Columnas: Fecha | Comprobante | Serie y Nº | Moneda | Debe | Haber | Saldo
// Total: 499 pt (= 595 - 48*2)
const COL = {
  date:        { w: 52  },
  description: { w: 148 },   // Comprobante
  reference:   { w: 78  },   // Serie y Nº
  currency:    { w: 40  },   // Moneda (símbolo)
  debit:       { w: 60  },   // Debe
  credit:      { w: 60  },   // Haber
  balance:     { w: 61  },   // Saldo
} as const;

type ColKey = keyof typeof COL;

const TABLE_W = (Object.values(COL) as Array<{ w: number }>).reduce((s, c) => s + c.w, 0);

function colX(key: ColKey): number {
  const keys = Object.keys(COL) as ColKey[];
  let x = PAGE.margin;
  for (const k of keys) {
    if (k === key) return x;
    x += COL[k].w;
  }
  return x;
}

// ── Tipos públicos ────────────────────────────────────────────────────────────

export type ClientInfo = {
  code?: string;
  name: string;
  address?: string;
  phone?: string;
};

export type AccountStatementPdfOptions = {
  companyName: string;
  statement: ClientAccountStatement;
  generatedAt?: Date;
  currencies?: Array<"UYU" | "USD">;
  /** YYYY-MM-DD inclusive */
  from?: string;
  to?: string;
  issuer?: IssuerInfo;
  client?: ClientInfo;
};

// ── Helpers de formato ────────────────────────────────────────────────────────

function formatDate(ymd: string | undefined): string {
  if (!ymd || ymd.length < 10) return "";
  const [y, m, d] = ymd.slice(0, 10).split("-");
  return `${d}/${m}/${y.slice(2)}`; // DD/MM/YY
}

function formatAmount(n: number): string {
  if (!Number.isFinite(n)) return "";
  return Math.abs(n).toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function currencySymbol(c: "UYU" | "USD"): string {
  return c === "UYU" ? "$" : "U$S";
}

function currencyLabel(c: "UYU" | "USD"): string {
  return c === "UYU" ? "Pesos" : "Dólares";
}

function describeComprobante(kind: string): string {
  switch (kind) {
    case "invoice":     return "Venta Crédito (CFE)";
    case "receipt":     return "Recibo de Cobro";
    case "credit_note": return "Nota de Crédito Venta (CFE)";
    default:            return kind;
  }
}

function formatEmision(date: Date): string {
  const d = date.toLocaleDateString("es-UY", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    timeZone: "America/Montevideo",
  });
  const t = date.toLocaleTimeString("es-UY", {
    hour: "2-digit", minute: "2-digit",
    timeZone: "America/Montevideo",
  });
  return `${d} ${t}`;
}

// ── Lógica de filtro y saldo anterior ────────────────────────────────────────

function getPreviousBalance(block: AccountStatementByCurrency, from: string | undefined): number {
  if (!from) return 0;
  const before = block.movements.filter((m) => m.date < from);
  return before.length > 0 ? before[before.length - 1].runningBalance : 0;
}

function filterMovements(
  block: AccountStatementByCurrency,
  from: string | undefined,
  to: string | undefined
): AccountStatementByCurrency {
  if (!from && !to) return block;
  const mvs = block.movements.filter((m) => {
    if (from && m.date < from) return false;
    if (to && m.date > to) return false;
    return true;
  });
  let totalDebit = 0;
  let totalCredit = 0;
  for (const m of mvs) {
    totalDebit += m.debit;
    totalCredit += m.credit;
  }
  const netChange = totalDebit - totalCredit;
  return {
    ...block,
    movements: mvs,
    summary: {
      ...block.summary,
      totalDebit,
      totalCredit,
      finalBalance: netChange,
      totalInvoiced: totalDebit,
      totalCollected: totalCredit,
      pendingBalance: netChange,
      movementCount: mvs.length,
      hasNegativeBalance: (mvs[mvs.length - 1]?.runningBalance ?? 0) < 0,
    },
  };
}

// ── Secciones del PDF ─────────────────────────────────────────────────────────

function renderFooter(doc: PDFKit.PDFDocument, pageNum: number, generatedAt: Date): void {
  const fy = PAGE.height - PAGE.margin + 6;
  const mx = PAGE.margin;
  const w = TABLE_W;
  doc.moveTo(mx, fy - 4).lineTo(mx + w, fy - 4).strokeColor(COLORS.border).lineWidth(0.4).stroke();
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7);
  doc.text(`Página: ${pageNum}`, mx, fy, { width: w / 2 });
  doc.text(`Emisión: ${formatEmision(generatedAt)}`, mx, fy, { width: w, align: "right" });
}

function renderPageHeader(
  doc: PDFKit.PDFDocument,
  opts: { from?: string; to?: string; currency: "UYU" | "USD"; issuer: IssuerInfo },
  startY: number
): number {
  const mx = PAGE.margin;
  let y = startY;
  const rightW = 165;
  const rightX = PAGE.margin + TABLE_W - rightW;

  // Título izquierda
  doc.fillColor(COLORS.accent).font("Helvetica-Bold").fontSize(13)
    .text("Estado de Cuenta", mx, y, { width: TABLE_W - rightW - 8 });

  // Empresa derecha — nombre
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(8)
    .text(opts.issuer.name, rightX, y, { width: rightW, align: "right" });

  y += 17;

  // Período izquierda
  const periodText =
    opts.from && opts.to
      ? `Período: ${formatDate(opts.from)} al ${formatDate(opts.to)}`
      : opts.from
        ? `Desde: ${formatDate(opts.from)}`
        : opts.to
          ? `Hasta: ${formatDate(opts.to)}`
          : "Todos los movimientos";
  doc.fillColor(COLORS.ink).font("Helvetica").fontSize(8)
    .text(periodText, mx, y, { width: TABLE_W - rightW - 8 });

  // RUT derecha
  if (opts.issuer.rut) {
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7.5)
      .text(opts.issuer.rut, rightX, y, { width: rightW, align: "right" });
  }
  y += 12;

  // Moneda izquierda
  doc.fillColor(COLORS.ink).font("Helvetica").fontSize(8)
    .text(`Moneda: ${currencyLabel(opts.currency)}`, mx, y, { width: TABLE_W - rightW - 8 });

  // Dirección + tel derecha
  const addrParts = [opts.issuer.addressLine, opts.issuer.phone].filter(Boolean);
  if (addrParts.length > 0) {
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7.5)
      .text(addrParts.join(" - "), rightX, y, { width: rightW, align: "right" });
    y += 10;
    if (opts.issuer.city) {
      doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7.5)
        .text(opts.issuer.city, rightX, y, { width: rightW, align: "right" });
    }
  }
  y += 14;

  // Divisor
  doc.moveTo(mx, y).lineTo(mx + TABLE_W, y).strokeColor(COLORS.border).lineWidth(0.7).stroke();
  y += 10;

  return y;
}

function renderClientBlock(
  doc: PDFKit.PDFDocument,
  client: ClientInfo,
  startY: number
): number {
  const mx = PAGE.margin;
  const blockH = 34;
  doc.rect(mx, startY, TABLE_W, blockH).fill(COLORS.clientBg);

  const nameLine = [client.code, client.name].filter(Boolean).join(" - ");
  const addrLine = [
    client.address || ".",
    client.phone ? `Tel. ${client.phone}` : "",
  ].filter(Boolean).join(" / ");

  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(8.5)
    .text(nameLine, mx + 8, startY + 6, { width: TABLE_W - 16, lineBreak: false });
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7.5)
    .text(addrLine, mx + 8, startY + 19, { width: TABLE_W - 16, lineBreak: false });

  return startY + blockH + 8;
}

function renderTableHeader(doc: PDFKit.PDFDocument, startY: number): number {
  const y = startY;
  doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(7.5);

  const cols: Array<[ColKey, string, "left" | "right"]> = [
    ["date",        "Fecha",      "left"],
    ["description", "Comprobante","left"],
    ["reference",   "Serie y Nº", "left"],
    ["currency",    "Moneda",     "left"],
    ["debit",       "Debe",       "right"],
    ["credit",      "Haber",      "right"],
    ["balance",     "Saldo",      "right"],
  ];

  for (const [key, label, align] of cols) {
    const x = colX(key);
    const w = COL[key].w - 4;
    doc.text(label, align === "right" ? x : x + 4, y, { width: w, align });
  }

  const lineY = y + 13;
  doc.moveTo(PAGE.margin, lineY).lineTo(PAGE.margin + TABLE_W, lineY)
    .strokeColor(COLORS.accent).lineWidth(0.8).stroke();

  return lineY + 4;
}

function renderSaldoAnteriorRow(
  doc: PDFKit.PDFDocument,
  previousBalance: number,
  startY: number
): number {
  const mx = PAGE.margin;
  doc.rect(mx, startY, TABLE_W, 14).fill(COLORS.clientBg);
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7.5)
    .text("Saldo anterior...", colX("description") + 4, startY + 3,
      { width: COL.description.w - 8, lineBreak: false });
  const neg = previousBalance < 0;
  doc.fillColor(neg ? "#b91c1c" : COLORS.ink).font("Helvetica").fontSize(7.5)
    .text(formatAmount(previousBalance), colX("balance"), startY + 3,
      { width: COL.balance.w - 4, align: "right" });
  doc.moveTo(mx, startY + 14).lineTo(mx + TABLE_W, startY + 14)
    .strokeColor(COLORS.border).lineWidth(0.3).stroke();
  return startY + 14;
}

function renderMovementRow(
  doc: PDFKit.PDFDocument,
  mv: AccountStatementMovement,
  currency: "UYU" | "USD",
  rowIdx: number,
  startY: number
): number {
  const mx = PAGE.margin;
  const ROW_H = 14;
  let y = startY;

  if (rowIdx % 2 === 1) {
    doc.rect(mx, y, TABLE_W, ROW_H).fill(COLORS.rowAlt);
  }

  const neg = mv.runningBalance < 0;
  const sym = currencySymbol(currency);

  doc.fillColor(COLORS.ink).font("Helvetica").fontSize(7.5);

  // Fecha
  doc.text(formatDate(mv.date), colX("date") + 4, y + 3,
    { width: COL.date.w - 4, lineBreak: false });
  // Comprobante
  doc.text(describeComprobante(mv.kind), colX("description") + 4, y + 3,
    { width: COL.description.w - 8, lineBreak: false });
  // Serie y Nº
  doc.text(extractSerieNumero(mv.number), colX("reference") + 4, y + 3,
    { width: COL.reference.w - 4, lineBreak: false });
  // Moneda
  doc.text(sym, colX("currency") + 4, y + 3,
    { width: COL.currency.w - 4, lineBreak: false });
  // Debe
  if (mv.debit > 0) {
    doc.text(formatAmount(mv.debit), colX("debit"), y + 3,
      { width: COL.debit.w - 4, align: "right" });
  }
  // Haber
  if (mv.credit > 0) {
    doc.text(formatAmount(mv.credit), colX("credit"), y + 3,
      { width: COL.credit.w - 4, align: "right" });
  }
  // Saldo
  doc.fillColor(neg ? "#b91c1c" : COLORS.ink)
    .text(formatAmount(mv.runningBalance), colX("balance"), y + 3,
      { width: COL.balance.w - 4, align: "right" });

  doc.moveTo(mx, y + ROW_H).lineTo(mx + TABLE_W, y + ROW_H)
    .strokeColor(COLORS.border).lineWidth(0.2).stroke();
  y += ROW_H;

  // Línea de detalle secundaria (indentada)
  if (mv.detail) {
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7)
      .text(mv.detail, colX("description") + 14, y + 2,
        { width: COL.description.w - 22, lineBreak: false });
    y += 11;
  }

  return y;
}

function renderFinalBalanceRow(
  doc: PDFKit.PDFDocument,
  finalBalance: number,
  currency: "UYU" | "USD",
  to: string | undefined,
  startY: number
): number {
  const mx = PAGE.margin;
  let y = startY + 6;
  const sym = currencySymbol(currency);
  const dateStr = to ? formatDate(to) : "";
  const label = dateStr ? `SALDO ${sym} al ${dateStr}` : `SALDO ${sym}`;
  const labelW = COL.date.w + COL.description.w + COL.reference.w + COL.currency.w - 8;

  doc.moveTo(mx, y).lineTo(mx + TABLE_W, y).strokeColor(COLORS.border).lineWidth(0.5).stroke();
  y += 4;

  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(8)
    .text(label, colX("date") + 4, y, { width: labelW });
  const neg = finalBalance < 0;
  doc.fillColor(neg ? "#b91c1c" : COLORS.ink).font("Helvetica-Bold").fontSize(8)
    .text(formatAmount(finalBalance), colX("balance"), y,
      { width: COL.balance.w - 4, align: "right" });

  y += 14;
  doc.moveTo(mx, y).lineTo(mx + TABLE_W, y).strokeColor(COLORS.border).lineWidth(0.5).stroke();
  return y + 10;
}

// ── Render principal ──────────────────────────────────────────────────────────

export async function renderAccountStatementPdf(opts: AccountStatementPdfOptions): Promise<Buffer> {
  const {
    companyName,
    statement,
    generatedAt = new Date(),
    currencies = ["UYU", "USD"],
    from,
    to,
    issuer = ISSUER_FALLBACK,
    client,
  } = opts;

  const clientInfo: ClientInfo = client ?? { name: companyName };

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: PAGE.margin, size: "A4", autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let pageNum = 1;
    let y = PAGE.margin;

    // Rompe página, renderiza footer en la saliente y resetea y
    function breakPage(): void {
      renderFooter(doc, pageNum, generatedAt);
      doc.addPage();
      pageNum++;
      y = PAGE.margin;
    }

    // Garantiza espacio; si no alcanza rompe página y re-renderiza header de tabla
    function ensureSpace(needed: number, reTableHeader?: () => void): void {
      if (y + needed > MAX_Y) {
        breakPage();
        if (reTableHeader) {
          y = renderTableHeader(doc, y);
        }
      }
    }

    let firstBlock = true;

    for (const currency of currencies) {
      const rawBlock = currency === "UYU" ? statement.uyu : statement.usd;
      const previousBalance = getPreviousBalance(rawBlock, from);
      const block = filterMovements(rawBlock, from, to);

      if (block.movements.length === 0 && previousBalance === 0) continue;

      if (!firstBlock) {
        y += 18;
        if (y > MAX_Y - 120) breakPage();
      }
      firstBlock = false;

      // Header de página (título, período, moneda, empresa)
      ensureSpace(80);
      y = renderPageHeader(doc, { from, to, currency, issuer }, y);

      // Bloque cliente
      ensureSpace(46);
      y = renderClientBlock(doc, clientInfo, y);

      // Encabezado de tabla
      ensureSpace(20);
      y = renderTableHeader(doc, y);

      // Saldo anterior
      if (from) {
        ensureSpace(18);
        y = renderSaldoAnteriorRow(doc, previousBalance, y);
      }

      // Movimientos
      const reTable = () => {
        y = renderTableHeader(doc, y);
      };

      for (let i = 0; i < block.movements.length; i++) {
        const mv = block.movements[i];
        const rowH = mv.detail ? 27 : 16;
        ensureSpace(rowH, reTable);
        y = renderMovementRow(doc, mv, currency, i, y);
      }

      // Saldo final
      const finalBalance =
        block.movements.length > 0
          ? block.movements[block.movements.length - 1].runningBalance
          : previousBalance;
      ensureSpace(35);
      y = renderFinalBalanceRow(doc, finalBalance, currency, to, y);
    }

    // Nota de moneda desconocida (discreta)
    if (statement.unknownCurrencyCount > 0) {
      ensureSpace(14);
      doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7)
        .text(
          `${statement.unknownCurrencyCount} movimiento(s) descartado(s) por moneda no determinable.`,
          PAGE.margin, y
        );
      y += 12;
    }

    renderFooter(doc, pageNum, generatedAt);
    doc.end();
  });
}
