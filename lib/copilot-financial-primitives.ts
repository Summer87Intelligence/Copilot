/**
 * Primitivas compartidas entre motores financieros (snapshot vs cashflow).
 * Semántica duplicada histórica se preserva explícitamente (p. ej. dos parseos ISO→YMD).
 * Contexto de dominio: `lib/copilot-liquidity-motors.md`.
 */

/** Coerción numérica desde valores proto/JSON (coma decimal, NaN → 0). */
export function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function sumPositiveReceiptAmounts(
  rows: ReadonlyArray<{ amount: unknown }>
): number {
  let t = 0;
  for (const r of rows) {
    const n = num(r.amount);
    if (n > 0) t += n;
  }
  return t;
}

export function sumPositivePaymentAmounts(
  rows: ReadonlyArray<{ amount: unknown }>
): number {
  let t = 0;
  for (const r of rows) {
    const n = num(r.amount);
    if (n > 0) t += n;
  }
  return t;
}

/** Caja histórica: Σ recibos(+) − Σ pagos(+) sobre el dataset cargado. */
export function historicalCashNet(
  receipts: ReadonlyArray<{ amount: unknown }>,
  payments: ReadonlyArray<{ amount: unknown }>
): number {
  return sumPositiveReceiptAmounts(receipts) - sumPositivePaymentAmounts(payments);
}

/**
 * ISO / fecha → YYYY-MM-DD usando componentes **locales** del `Date` parseado
 * (comportamiento legacy del snapshot financiero).
 */
export function ymdFromIsoLocal(iso: string): string {
  const s = String(iso ?? "").trim();
  if (s.length >= 10) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * ISO / fecha → YYYY-MM-DD: prefijo 10 chars; si no, **UTC** vía `toISOString`
 * (comportamiento legacy del motor de cashflow).
 */
export function ymdFromIsoUtcDate(iso: string): string {
  const s = String(iso ?? "").trim();
  if (s.length >= 10) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/** Hoy en calendario local YYYY-MM-DD. */
export function localCalendarTodayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Suma días en calendario local a partir de YYYY-MM-DD (motor financiero / snapshot).
 * No redondea el delta de días antes de sumar.
 */
export function addCalendarDaysLocal(ymd: string, days: number): string {
  const base = ymd.slice(0, 10);
  const parts = base.split("-").map((x) => Number(x));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return base;
  const [y, mo, da] = parts;
  const dt = new Date(y, mo - 1, da);
  if (Number.isNaN(dt.getTime())) return base;
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Igual que `addCalendarDaysLocal` pero aplica `Math.round` al delta de días
 * antes de `setDate` (motor de cashflow / timing de cobro).
 */
export function addCalendarDaysLocalRoundDays(ymd: string, days: number): string {
  const base = ymd.slice(0, 10);
  const parts = base.split("-").map((x) => Number(x));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return base;
  const [y, m, d] = parts;
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return base;
  dt.setDate(dt.getDate() + Math.round(days));
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Probabilidad de cobro en factura: 0–1; si viene como 0–100 se normaliza.
 * Sin dato útil → 0,6 (neutro, mismo orden que el factor medio histórico).
 */
export function normalizedCollectionProbability(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") return 0.6;
  let p = num(raw);
  if (!Number.isFinite(p) || p < 0) return 0.6;
  if (p > 1) p = p / 100;
  if (p > 1) p = 1;
  return p;
}
