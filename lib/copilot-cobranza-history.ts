export type CobranzaHistoryOrigen = "Zeta";
export type CobranzaHistoryMoneda = "UYU" | "USD";

export type CobranzaHistoryRow = {
  id: string;
  fecha: string;
  companyId: string | null;
  clienteNombre: string;
  monto: number;
  moneda: CobranzaHistoryMoneda;
  origen: CobranzaHistoryOrigen;
  referencia: string | null;
  registradoPor: string;
  createdAt: string;
};

export type CobranzaHistoryPeriod = "30d" | "month" | "all";

export type CobranzaHistoryApiMeta = {
  fetched: number;
  limitApplied: number | null;
};

export type CobranzaHistoryApiResponse = {
  ok: true;
  items: CobranzaHistoryRow[];
  total: number;
  truncated: boolean;
  meta: CobranzaHistoryApiMeta;
};

import type { SupabaseClient } from "@supabase/supabase-js";

import { isReceiptVoidLike } from "@/lib/copilot-receipts-utils";
import { fetchAllRows } from "@/lib/supabase-pagination";

export const HISTORY_PAGE_SIZE = 25;
export const HISTORY_API_PATH = "/api/copilot/cobranza/history";
export const VALID_HISTORY_PERIODS = ["30d", "month", "all"] as const satisfies readonly CobranzaHistoryPeriod[];

/** Page size for server-side pagination of proto_receipts. */
export const COBRANZA_HISTORY_FETCH_PAGE_SIZE = 1_000;
/** Safety cap for period=month / 30d (no silent truncation under this volume). */
export const COBRANZA_HISTORY_MAX_ROWS_BOUNDED = 50_000;
/** Safety cap for period=all — exposes truncated when reached. */
export const COBRANZA_HISTORY_MAX_ROWS_ALL = 50_000;

const RECEIPT_SELECT =
  "id, receipt_date, amount, currency_code, company_id, reference, created_at, status";

export function computePeriodFrom(period: CobranzaHistoryPeriod, today: string): string | null {
  if (period === "all") return null;
  if (period === "month") return today.slice(0, 7) + "-01";
  const d = new Date(today + "T12:00:00Z");
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

/** Inclusive upper bound for bounded periods (month / 30d). */
export function computePeriodTo(period: CobranzaHistoryPeriod, today: string): string | null {
  if (period === "all") return null;
  if (period === "30d") return today;
  const ym = today.slice(0, 7);
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
}

function validMoneda(v: unknown): v is CobranzaHistoryMoneda {
  return v === "UYU" || v === "USD";
}

function s(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function sOrNull(v: unknown): string | null {
  const t = s(v);
  return t.length > 0 ? t : null;
}

function parseAmount(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseFloat(s(v));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export function mapZetaReceiptRow(
  row: Record<string, unknown>,
  companyNames: Map<string, string>
): CobranzaHistoryRow | null {
  const id = s(row.id);
  const fecha = s(row.receipt_date);
  const createdAt = s(row.created_at);
  const monto = parseAmount(row.amount);
  const moneda = s(row.currency_code);
  const companyId = s(row.company_id);

  if (!id || !fecha || monto == null || !validMoneda(moneda)) return null;

  const clienteNombre = companyNames.get(companyId) ?? "Cliente no especificado";

  return {
    id,
    fecha,
    companyId: companyId || null,
    clienteNombre,
    monto,
    moneda,
    origen: "Zeta",
    referencia: sOrNull(row.reference),
    registradoPor: "Zeta",
    createdAt,
  };
}

export function mergeAndSort(rows: CobranzaHistoryRow[]): CobranzaHistoryRow[] {
  return [...rows].sort((a, b) => {
    const d = b.fecha.localeCompare(a.fecha);
    if (d !== 0) return d;
    const c = b.createdAt.localeCompare(a.createdAt);
    if (c !== 0) return c;
    return b.id.localeCompare(a.id);
  });
}

export type CobranzaHistoryReceiptFetchResult = {
  rows: Record<string, unknown>[];
  truncated: boolean;
  fetched: number;
  limitApplied: number | null;
};

/**
 * Loads all active receipts for cobranza history with server-side pagination.
 * Excludes void-like statuses (same rule as financial reconciliation).
 */
export async function fetchCobranzaHistoryReceiptRows(
  supabase: SupabaseClient,
  input: {
    workspaceId: string;
    fromDate: string | null;
    toDate: string | null;
    currency: string;
    period: CobranzaHistoryPeriod;
  }
): Promise<CobranzaHistoryReceiptFetchResult> {
  const maxRows =
    input.period === "all"
      ? COBRANZA_HISTORY_MAX_ROWS_ALL
      : COBRANZA_HISTORY_MAX_ROWS_BOUNDED;

  const result = await fetchAllRows<Record<string, unknown>>({
    pageSize: COBRANZA_HISTORY_FETCH_PAGE_SIZE,
    maxRows,
    queryPage: (from, to) => {
      let q = supabase
        .from("proto_receipts")
        .select(RECEIPT_SELECT)
        .eq("workspace_company_id", input.workspaceId)
        .eq("is_active", true)
        .order("receipt_date", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);

      if (input.fromDate) q = q.gte("receipt_date", input.fromDate);
      if (input.toDate) q = q.lte("receipt_date", input.toDate);
      if (input.currency === "UYU" || input.currency === "USD") {
        q = q.eq("currency_code", input.currency);
      }
      return q;
    },
  });

  const eligible = result.rows.filter((r) => !isReceiptVoidLike(r.status));

  return {
    rows: eligible,
    truncated: result.reachedMaxRows,
    fetched: result.totalFetched,
    limitApplied: result.reachedMaxRows ? maxRows : null,
  };
}

export function buildCobranzaHistoryItems(
  rawRows: Record<string, unknown>[],
  companyNames: Map<string, string>
): CobranzaHistoryRow[] {
  const mapped: CobranzaHistoryRow[] = [];
  for (const r of rawRows) {
    const row = mapZetaReceiptRow(r, companyNames);
    if (row) mapped.push(row);
  }
  return mergeAndSort(mapped);
}

export function filterHistoryByCurrency(
  rows: CobranzaHistoryRow[],
  currency: string
): CobranzaHistoryRow[] {
  if (currency !== "UYU" && currency !== "USD") return rows;
  return rows.filter((r) => r.moneda === currency);
}

export function filterHistoryByCliente(
  rows: CobranzaHistoryRow[],
  clienteNombre: string
): CobranzaHistoryRow[] {
  if (!clienteNombre) return rows;
  return rows.filter((r) => r.clienteNombre === clienteNombre);
}

export function uniqueClientesFromHistory(rows: CobranzaHistoryRow[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const r of rows) {
    if (!seen.has(r.clienteNombre)) {
      seen.add(r.clienteNombre);
      result.push(r.clienteNombre);
    }
  }
  return result.sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

export function parsePeriodParam(raw: string | null): CobranzaHistoryPeriod {
  if (raw === "30d" || raw === "month" || raw === "all") return raw;
  return "30d";
}
