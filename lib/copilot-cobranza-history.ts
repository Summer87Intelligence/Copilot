export type CobranzaHistoryOrigen = "Zeta";
export type CobranzaHistoryMoneda = "UYU" | "USD";

export type CobranzaHistoryRow = {
  id: string;
  fecha: string;
  clienteNombre: string;
  monto: number;
  moneda: CobranzaHistoryMoneda;
  origen: CobranzaHistoryOrigen;
  referencia: string | null;
  registradoPor: string;
  createdAt: string;
};

export type CobranzaHistoryPeriod = "30d" | "month" | "all";

export type CobranzaHistoryApiResponse = {
  ok: true;
  items: CobranzaHistoryRow[];
  total: number;
};

export const HISTORY_PAGE_SIZE = 25;
export const HISTORY_API_PATH = "/api/copilot/cobranza/history";
export const VALID_HISTORY_PERIODS = ["30d", "month", "all"] as const satisfies readonly CobranzaHistoryPeriod[];

export function computePeriodFrom(period: CobranzaHistoryPeriod, today: string): string | null {
  if (period === "all") return null;
  if (period === "month") return today.slice(0, 7) + "-01";
  const d = new Date(today + "T12:00:00Z");
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
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
    return b.createdAt.localeCompare(a.createdAt);
  });
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
