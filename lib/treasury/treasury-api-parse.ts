/**
 * Parsers compartidos para respuestas JSON de APIs de Tesorería.
 * Contrato: `{ ok: true, data: { ... } }` vía `nextResponseFromTreasuryCrud` o route directa.
 */

import type { CashPositionByCurrency } from "@/lib/treasury/treasury-cash-position";
import type {
  TreasuryOutflowSummary,
  TreasuryScheduledPayment,
} from "@/lib/treasury/treasury-scheduled-payments";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object";
}

/** GET /api/copilot/treasury/cash-position → positions[] */
export function parseTreasuryCashPositionJson(json: unknown): CashPositionByCurrency[] {
  if (!isRecord(json) || json.ok !== true || !isRecord(json.data)) return [];
  const positions = json.data.positions;
  return Array.isArray(positions) ? (positions as CashPositionByCurrency[]) : [];
}

/** GET /api/copilot/treasury/scheduled-payments?include_summary=1 → data.summary[] */
export function parseTreasuryScheduledSummaryJson(json: unknown): TreasuryOutflowSummary[] {
  if (!isRecord(json) || json.ok !== true || !isRecord(json.data)) return [];
  const summary = json.data.summary;
  return Array.isArray(summary) ? (summary as TreasuryOutflowSummary[]) : [];
}

/** GET /api/copilot/treasury/scheduled-payments?include_summary=1 → data.items[] */
export function parseTreasuryScheduledItemsJson(json: unknown): TreasuryScheduledPayment[] {
  if (!isRecord(json) || json.ok !== true || !isRecord(json.data)) return [];
  const items = json.data.items;
  return Array.isArray(items) ? (items as TreasuryScheduledPayment[]) : [];
}

export type CanonicalTreasuryRollup = {
  availableCash: { UYU: number; USD: number };
  scheduledTotal: { UYU: number; USD: number };
  safeCash30d: { UYU: number; USD: number };
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Misma fórmula que Hoy (`safeCash30d`) y Dashboard (`cajaDespuesPagos`). */
export function canonicalTreasuryRollup(
  positions: readonly CashPositionByCurrency[],
  outflowSummaries: readonly TreasuryOutflowSummary[]
): CanonicalTreasuryRollup {
  const availableCash = { UYU: 0, USD: 0 };
  const scheduledTotal = { UYU: 0, USD: 0 };

  for (const p of positions) {
    if (p.currency === "UYU") availableCash.UYU = round2(p.availableCash);
    if (p.currency === "USD") availableCash.USD = round2(p.availableCash);
  }
  for (const s of outflowSummaries) {
    if (s.currency === "UYU") scheduledTotal.UYU = round2(s.scheduledTotal);
    if (s.currency === "USD") scheduledTotal.USD = round2(s.scheduledTotal);
  }

  return {
    availableCash,
    scheduledTotal,
    safeCash30d: {
      UYU: round2(availableCash.UYU - scheduledTotal.UYU),
      USD: round2(availableCash.USD - scheduledTotal.USD),
    },
  };
}
