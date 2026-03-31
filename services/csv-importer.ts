/**
 * Importador CSV (v1 simplificada) para pruebas manuales del pipeline financiero.
 *
 * Alcance de esta primera versión:
 * - Soporta solo dos secciones: `invoice:` y `expense:`.
 * - Formato simple sin comillas escapadas ni comas embebidas.
 * - No persiste datos; solo transforma a `NormalizedFinancePayload`.
 *
 * Ejemplo esperado:
 * invoice:
 * date,client,amount,status
 * 2026-03-02,Cliente A,120000,paid
 *
 * expense:
 * date,category,amount
 * 2026-03-03,sueldos,65000
 */

import type { DashboardSnapshot } from "@/lib/dashboard-data";
import { buildDashboardSnapshotFromNormalized } from "@/services/finance-aggregator";
import type {
  NormalizedExpense,
  NormalizedFinancePayload,
  NormalizedInvoice,
} from "@/types/normalized-finance";

type CsvSection = "invoice" | "expense" | null;

const DEFAULT_CURRENCY = "ARS";

function normalizeHeaderToken(token: string): string {
  return token.trim().toLowerCase();
}

function splitSimpleCsvLine(line: string): string[] {
  return line.split(",").map((part) => part.trim());
}

function toIsoDate(value: string): string {
  // v1: conserva la fecha recibida (YYYY-MM-DD o datetime) sin TZ conversion.
  return value.trim();
}

function toFiniteAmount(raw: string): number | null {
  const cleaned = raw.replace(/\s+/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function mapInvoiceStatus(raw: string): NormalizedInvoice["status"] {
  const v = raw.trim().toLowerCase();
  if (v === "draft") return "draft";
  if (v === "issued") return "issued";
  if (v === "paid") return "paid";
  if (v === "partially_paid") return "partially_paid";
  if (v === "cancelled") return "cancelled";
  return "unknown";
}

function buildInvoiceFromRow(
  row: string[],
  rowIndex: number,
  companyId: string,
): NormalizedInvoice | null {
  if (row.length < 4) return null;
  const [date, client, amountRaw, statusRaw] = row;
  const amount = toFiniteAmount(amountRaw);
  if (!date || amount === null) return null;

  const status = mapInvoiceStatus(statusRaw ?? "");
  const normalizedClient = client ? client.trim() : "";
  const clientExternalId = normalizedClient
    ? `csv-client-${normalizedClient.toLowerCase().replace(/\s+/g, "-")}`
    : undefined;

  let outstandingAmount: number | undefined = undefined;
  if (status === "paid") {
    outstandingAmount = 0;
  } else if (status === "issued" || status === "partially_paid" || status === "unknown") {
    // v1: sin columna explícita de saldo, usamos total como pendiente aproximado.
    outstandingAmount = Math.max(0, amount);
  }

  return {
    externalId: `csv-invoice-${rowIndex}`,
    companyId,
    issueDate: toIsoDate(date),
    clientExternalId,
    currency: DEFAULT_CURRENCY,
    totalAmount: amount,
    outstandingAmount,
    status,
  };
}

function buildExpenseFromRow(
  row: string[],
  rowIndex: number,
  companyId: string,
): NormalizedExpense | null {
  if (row.length < 3) return null;
  const [date, category, amountRaw] = row;
  const amount = toFiniteAmount(amountRaw);
  if (!date || amount === null) return null;

  return {
    externalId: `csv-expense-${rowIndex}`,
    companyId,
    expenseDate: toIsoDate(date),
    currency: DEFAULT_CURRENCY,
    amount,
    category: category?.trim() || undefined,
  };
}

export function parseCsvToNormalizedPayload(
  csvText: string,
  companyId: string,
): NormalizedFinancePayload {
  const invoices: NormalizedInvoice[] = [];
  const expenses: NormalizedExpense[] = [];

  const rawLines = csvText.split(/\r?\n/);
  let section: CsvSection = null;
  let expectingHeader = false;

  for (let i = 0; i < rawLines.length; i += 1) {
    const line = rawLines[i].trim();
    if (!line) continue;

    const lowered = line.toLowerCase();
    if (lowered === "invoice:" || lowered === "invoices:") {
      section = "invoice";
      expectingHeader = true;
      continue;
    }
    if (lowered === "expense:" || lowered === "expenses:") {
      section = "expense";
      expectingHeader = true;
      continue;
    }

    if (expectingHeader) {
      // v1: validación suave del header, seguimos incluso si no coincide exacto.
      const header = splitSimpleCsvLine(line).map(normalizeHeaderToken);
      if (section === "invoice") {
        const ok =
          header[0] === "date" &&
          header[1] === "client" &&
          header[2] === "amount" &&
          header[3] === "status";
        if (!ok) {
          // Fallback: tratar la línea actual como dato.
          const maybeInvoice = buildInvoiceFromRow(
            splitSimpleCsvLine(line),
            i + 1,
            companyId,
          );
          if (maybeInvoice) invoices.push(maybeInvoice);
        }
      } else if (section === "expense") {
        const ok =
          header[0] === "date" &&
          header[1] === "category" &&
          header[2] === "amount";
        if (!ok) {
          const maybeExpense = buildExpenseFromRow(
            splitSimpleCsvLine(line),
            i + 1,
            companyId,
          );
          if (maybeExpense) expenses.push(maybeExpense);
        }
      }
      expectingHeader = false;
      continue;
    }

    const row = splitSimpleCsvLine(line);
    if (section === "invoice") {
      const maybeInvoice = buildInvoiceFromRow(row, i + 1, companyId);
      if (maybeInvoice) invoices.push(maybeInvoice);
      continue;
    }
    if (section === "expense") {
      const maybeExpense = buildExpenseFromRow(row, i + 1, companyId);
      if (maybeExpense) expenses.push(maybeExpense);
    }
  }

  return {
    // v1: usamos "zeta" para mantener compatibilidad con el tipo actual.
    // Cuando el tipo soporte múltiples orígenes, migrar a `sourceSystem: "csv"`.
    sourceSystem: "zeta",
    companyId,
    invoices,
    collections: [],
    expenses,
    cashMovements: [],
    clients: [],
    suppliers: [],
    syncRunId: `csv-import-${Date.now()}`,
  };
}

/**
 * Helper de extremo a extremo para pruebas:
 * CSV manual -> payload normalizado -> DashboardSnapshot.
 */
export function buildSnapshotFromCsv(
  csvText: string,
  companyId: string,
): DashboardSnapshot {
  const payload = parseCsvToNormalizedPayload(csvText, companyId);
  return buildDashboardSnapshotFromNormalized(payload);
}

