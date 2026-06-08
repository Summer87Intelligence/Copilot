/**
 * ZETA-08 Fase 1 — Aging por cuota (motor puro).
 *
 * Clasifica saldo pendiente por `cuota_vencimiento` y `cuota_saldo`.
 * No usa `balance_amount` de factura ni hace I/O.
 */

export type InstallmentAgingCurrencyCode = "UYU" | "USD";

export type InstallmentAgingRange =
  | "current"
  | "overdue_0_30"
  | "overdue_31_60"
  | "overdue_61_90"
  | "overdue_90_plus";

export type InstallmentAgingInput = {
  invoice_id: string | null;
  currency_code: string | null;
  cuota_saldo: number | null;
  cuota_total?: number | null;
  cuota_vencimiento: string | null;
  issue_date?: string | null;
};

export type InstallmentCurrencyBuckets = {
  current: number;
  overdue_0_30: number;
  overdue_31_60: number;
  overdue_61_90: number;
  overdue_90_plus: number;
  overdueTotal: number;
  pendingTotal: number;
};

export type InstallmentAgingResult = {
  byCurrency: Partial<Record<InstallmentAgingCurrencyCode, InstallmentCurrencyBuckets>>;
  dominantRange: InstallmentAgingRange | null;
  hasMixedAging: boolean;
  /** Facturas con al menos una cuota current Y al menos una vencida simultáneamente. */
  mixedAgingInvoiceCount: number;
  overdueInvoices: string[];
  overdueInstallments: number;
};

const VALID_CURRENCIES = new Set<InstallmentAgingCurrencyCode>(["UYU", "USD"]);
const SALDO_EPSILON = 0.005;
const DAY_MS = 86_400_000;

const RANGE_PRIORITY: InstallmentAgingRange[] = [
  "overdue_90_plus",
  "overdue_61_90",
  "overdue_31_60",
  "overdue_0_30",
  "current",
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function safeNum(v: number | null | undefined): number {
  if (v === null || v === undefined || !Number.isFinite(v)) return 0;
  return v;
}

function parseYmdToMs(s: string | null | undefined): number | null {
  const d = (s ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const ms = Date.parse(`${d}T00:00:00.000Z`);
  return Number.isFinite(ms) ? ms : null;
}

function normalizeCurrency(code: string | null | undefined): InstallmentAgingCurrencyCode | null {
  const c = (code ?? "").trim().toUpperCase();
  return VALID_CURRENCIES.has(c as InstallmentAgingCurrencyCode)
    ? (c as InstallmentAgingCurrencyCode)
    : null;
}

function emptyBuckets(): InstallmentCurrencyBuckets {
  return {
    current: 0,
    overdue_0_30: 0,
    overdue_31_60: 0,
    overdue_61_90: 0,
    overdue_90_plus: 0,
    overdueTotal: 0,
    pendingTotal: 0,
  };
}

function recomputeDerived(b: InstallmentCurrencyBuckets): InstallmentCurrencyBuckets {
  const overdueTotal = round2(
    b.overdue_0_30 + b.overdue_31_60 + b.overdue_61_90 + b.overdue_90_plus
  );
  return {
    ...b,
    overdueTotal,
    pendingTotal: round2(b.current + overdueTotal),
  };
}

/**
 * Días desde vencimiento (positivo = vencida). Fecha inválida → null (se trata como current).
 */
export function daysPastDueFromVencimiento(
  cuotaVencimiento: string | null | undefined,
  nowMs: number
): number | null {
  const ms = parseYmdToMs(cuotaVencimiento);
  if (ms === null) return null;
  return Math.floor((nowMs - ms) / DAY_MS);
}

export function classifyInstallmentAgingRange(
  cuotaVencimiento: string | null | undefined,
  nowMs: number
): InstallmentAgingRange {
  const days = daysPastDueFromVencimiento(cuotaVencimiento, nowMs);
  if (days === null || days <= 0) return "current";
  if (days <= 30) return "overdue_0_30";
  if (days <= 60) return "overdue_31_60";
  if (days <= 90) return "overdue_61_90";
  return "overdue_90_plus";
}

function getOrCreateCurrency(
  map: Partial<Record<InstallmentAgingCurrencyCode, InstallmentCurrencyBuckets>>,
  code: InstallmentAgingCurrencyCode
): InstallmentCurrencyBuckets {
  if (!map[code]) map[code] = emptyBuckets();
  return map[code]!;
}

/**
 * Agrega aging REAL por cuota. Solo filas con `cuota_saldo > 0` aportan monto.
 */
export function computeInstallmentAging(
  installments: InstallmentAgingInput[],
  now?: string
): InstallmentAgingResult {
  const nowMs = now ? Date.parse(now) : Date.now();
  const refMs = Number.isFinite(nowMs) ? nowMs : Date.now();

  const byCurrency: Partial<Record<InstallmentAgingCurrencyCode, InstallmentCurrencyBuckets>> =
    {};
  const overdueInvoiceSet = new Set<string>();
  let overdueInstallments = 0;

  /** invoice_id → { hasCurrent, hasOverdue } */
  const perInvoiceMix = new Map<string, { hasCurrent: boolean; hasOverdue: boolean }>();

  for (const row of installments) {
    const saldo = round2(Math.max(0, safeNum(row.cuota_saldo)));
    if (saldo <= SALDO_EPSILON) continue;

    const currency = normalizeCurrency(row.currency_code);
    if (!currency) continue;

    const range = classifyInstallmentAgingRange(row.cuota_vencimiento, refMs);
    const buckets = getOrCreateCurrency(byCurrency, currency);
    buckets[range] = round2(buckets[range] + saldo);

    const invId = row.invoice_id?.trim() || null;
    if (invId) {
      if (range === "current") {
        let mix = perInvoiceMix.get(invId);
        if (!mix) {
          mix = { hasCurrent: false, hasOverdue: false };
          perInvoiceMix.set(invId, mix);
        }
        mix.hasCurrent = true;
      } else {
        overdueInstallments += 1;
        overdueInvoiceSet.add(invId);
        let mix = perInvoiceMix.get(invId);
        if (!mix) {
          mix = { hasCurrent: false, hasOverdue: false };
          perInvoiceMix.set(invId, mix);
        }
        mix.hasOverdue = true;
      }
    }
  }

  for (const code of VALID_CURRENCIES) {
    if (byCurrency[code]) {
      byCurrency[code] = recomputeDerived(byCurrency[code]!);
    }
  }

  let dominantRange: InstallmentAgingRange | null = null;
  let dominantAmount = -1;
  for (const range of RANGE_PRIORITY) {
    let sum = 0;
    for (const code of VALID_CURRENCIES) {
      sum += byCurrency[code]?.[range] ?? 0;
    }
    if (sum > dominantAmount) {
      dominantAmount = sum;
      dominantRange = sum > SALDO_EPSILON ? range : null;
    }
  }
  if (dominantAmount <= SALDO_EPSILON) dominantRange = null;

  let hasMixedAging = false;
  let mixedAgingInvoiceCount = 0;
  for (const mix of perInvoiceMix.values()) {
    if (mix.hasCurrent && mix.hasOverdue) {
      hasMixedAging = true;
      mixedAgingInvoiceCount++;
    }
  }
  if (!hasMixedAging) {
    let anyCurrent = 0;
    let anyOverdue = 0;
    for (const code of VALID_CURRENCIES) {
      const b = byCurrency[code];
      if (!b) continue;
      anyCurrent += b.current;
      anyOverdue += b.overdueTotal;
    }
    hasMixedAging =
      anyCurrent > SALDO_EPSILON && anyOverdue > SALDO_EPSILON;
  }

  return {
    byCurrency,
    dominantRange,
    hasMixedAging,
    mixedAgingInvoiceCount,
    overdueInvoices: [...overdueInvoiceSet].sort(),
    overdueInstallments,
  };
}

/** Default para scripts Node (`tsx` + `.mjs`): named ESM no se re-exportan desde `.ts`. */
const installmentAgingDefault = {
  classifyInstallmentAgingRange,
  computeInstallmentAging,
  daysPastDueFromVencimiento,
};
export default installmentAgingDefault;
