/**
 * Dedupe de deuda operativa: evita contar dos veces el mismo comprobante cuando
 * coexisten una factura CCV1 real y una fila shadow `Zeta / saldos pendientes`.
 *
 * Regla:
 * - Si existe factura real equivalente → usar solo su `balance_amount`.
 * - Si no existe real → usar shadow saldos pendientes.
 * - Nunca sumar ambas.
 *
 * Estado de cuenta (ledger) NO usa este helper; excluye shadows por diseño.
 */

import { readInvoiceFinancial } from "@/lib/copilot-invoice-financial-read";
import { isVoidedFinancialInvoice } from "@/lib/copilot-client-current-debt-summary";
import { isCreditNoteFromMetadata } from "@/lib/copilot-zeta-credit-note";
import { readInvoiceCurrency } from "@/lib/copilot-datos-invoice-display";
import {
  extractRegistroIdsFromInvoiceZetaMetadata,
  parseZetaLegacyRegistroIdFromInvoiceNumber,
} from "@/lib/integrations/zeta/zeta-proto-invoice-registro-match";

export const ZETA_SALDOS_PENDIENTES_CATEGORY = "Zeta / saldos pendientes";

const PENDING_EPSILON = 0.005;

export type OperationalDebtCurrencyCode = "UYU" | "USD";

export type OperationalDebtInvoiceInput = {
  id?: string | number;
  company_id?: string | null;
  invoice_number?: string | null;
  category?: string | null;
  total_amount?: unknown;
  balance_amount?: unknown;
  balanceFromFinancialsMap?: Map<string, number>;
  status?: string | null;
  due_date?: unknown;
  issue_date?: unknown;
  currency_code?: string | null;
  zeta_metadata?: unknown;
};

export type OperationalDebtDedupSelection<T extends OperationalDebtInvoiceInput> = {
  invoice: T;
  isShadow: boolean;
  equivalenceKey: string;
  skippedShadowIds: string[];
};

export type CompanyOperationalDebtTotals = {
  debtUYU: number;
  debtUSD: number;
  overdueUYU: number;
  overdueUSD: number;
  invoiceCount: number;
  shadowSkippedCount: number;
};

export function isZetaSaldosPendientesShadowRow(
  inv: Pick<OperationalDebtInvoiceInput, "category"> | Record<string, unknown>
): boolean {
  return String(inv.category ?? "").trim() === ZETA_SALDOS_PENDIENTES_CATEGORY;
}

function num(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function ymd(iso: unknown): string {
  const s = String(iso ?? "").trim();
  return s.length >= 10 ? s.slice(0, 10) : "";
}

function symbolToIso(sym: "$" | "U$S" | null): OperationalDebtCurrencyCode | null {
  if (sym === "U$S") return "USD";
  if (sym === "$") return "UYU";
  return null;
}

export function readOperationalDebtInvoiceCurrency(
  inv: OperationalDebtInvoiceInput
): OperationalDebtCurrencyCode | null {
  const raw = String(inv.currency_code ?? "").trim().toUpperCase();
  if (raw === "UYU" || raw === "USD") return raw;
  return symbolToIso(readInvoiceCurrency(inv as Record<string, unknown>));
}

function pendingAmount(
  inv: OperationalDebtInvoiceInput,
  invoiceBalanceMap?: Map<string, number>
): number {
  const id = String(inv.id ?? "").trim();
  const fin = readInvoiceFinancial({
    invoiceId: id || "unknown",
    balancePersisted: inv.balance_amount,
    totalAmount: inv.total_amount,
    balanceFromFinancialsMap: inv.balanceFromFinancialsMap ?? invoiceBalanceMap,
  });
  return Math.max(0, fin.balance_authoritative);
}

function totalsWithinTolerance(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  return diff <= Math.max(0.01, 1e-4 * Math.max(Math.abs(a), Math.abs(b)));
}

function balanceForDedup(
  inv: OperationalDebtInvoiceInput,
  invoiceBalanceMap?: Map<string, number>
): number {
  return pendingAmount(inv, invoiceBalanceMap);
}

function shadowRegistroId(inv: OperationalDebtInvoiceInput): string | null {
  if (!isZetaSaldosPendientesShadowRow(inv)) return null;
  return parseZetaLegacyRegistroIdFromInvoiceNumber(String(inv.invoice_number ?? ""));
}

function realHasRegistroId(
  inv: OperationalDebtInvoiceInput,
  registroId: string
): boolean {
  const regIds = extractRegistroIdsFromInvoiceZetaMetadata(inv.zeta_metadata);
  return regIds.includes(registroId);
}

function amountsCompatibleForDedup(
  real: OperationalDebtInvoiceInput,
  shadow: OperationalDebtInvoiceInput,
  invoiceBalanceMap?: Map<string, number>
): boolean {
  const shadowBal = balanceForDedup(shadow, invoiceBalanceMap);
  const realBal = balanceForDedup(real, invoiceBalanceMap);
  const realTotal = round2(num(real.total_amount));
  const shadowTotal = round2(num(shadow.total_amount));
  return (
    totalsWithinTolerance(realBal, shadowBal) ||
    totalsWithinTolerance(realTotal, shadowBal) ||
    totalsWithinTolerance(realTotal, shadowTotal)
  );
}

/**
 * Empareja shadow `ZETA:{RegistroId}` ↔ CCV1 real:
 * 1. RegistroId exacto en metadata/identity.
 * 2. Fallback: company + moneda + issue_date + monto compatible (+ serie/número si aplica).
 */
function pairShadowsToRealsByRegistroId<
  T extends OperationalDebtInvoiceInput,
>(
  shadows: T[],
  reals: T[],
  invoiceBalanceMap?: Map<string, number>
): Map<string, string> {
  const shadowToReal = new Map<string, string>();
  const usedRealIds = new Set<string>();

  for (const shadow of shadows) {
    const shadowId = String(shadow.id ?? "").trim();
    if (!shadowId || shadowToReal.has(shadowId)) continue;

    const registroId = shadowRegistroId(shadow);
    if (!registroId) continue;

    const shadowCompany = String(shadow.company_id ?? "").trim();
    const shadowCur = readOperationalDebtInvoiceCurrency(shadow);
    const shadowIssue = ymd(shadow.issue_date);
    const shadowBal = balanceForDedup(shadow, invoiceBalanceMap);
    if (!shadowCur || !(shadowBal > PENDING_EPSILON)) continue;

    const metadataMatches = reals.filter((real) => {
      const realId = String(real.id ?? "").trim();
      if (!realId || usedRealIds.has(realId)) return false;
      if (String(real.company_id ?? "").trim() !== shadowCompany) return false;
      if (readOperationalDebtInvoiceCurrency(real) !== shadowCur) return false;
      return realHasRegistroId(real, registroId);
    });

    if (metadataMatches.length === 1) {
      const realId = String(metadataMatches[0]!.id ?? "").trim();
      shadowToReal.set(shadowId, realId);
      usedRealIds.add(realId);
      continue;
    }

    const fallbackMatches = reals.filter((real) => {
      const realId = String(real.id ?? "").trim();
      if (!realId || usedRealIds.has(realId)) return false;
      if (String(real.company_id ?? "").trim() !== shadowCompany) return false;
      if (readOperationalDebtInvoiceCurrency(real) !== shadowCur) return false;
      if (shadowIssue && ymd(real.issue_date) !== shadowIssue) return false;
      return amountsCompatibleForDedup(real, shadow, invoiceBalanceMap);
    });

    if (fallbackMatches.length === 1) {
      const realId = String(fallbackMatches[0]!.id ?? "").trim();
      shadowToReal.set(shadowId, realId);
      usedRealIds.add(realId);
    }
  }

  return shadowToReal;
}

/**
 * Segunda pasada: shadow sin RegistroId enlazado ↔ CCV1 real por saldo+moneda (match único).
 */
function pairShadowsToRealsByBalance<
  T extends OperationalDebtInvoiceInput,
>(
  shadows: T[],
  reals: T[],
  invoiceBalanceMap?: Map<string, number>
): Map<string, string> {
  const shadowToReal = new Map<string, string>();
  const usedRealIds = new Set<string>();
  const usedShadowIds = new Set<string>();

  type BucketKey = string;
  const shadowBuckets = new Map<BucketKey, T[]>();
  const realBuckets = new Map<BucketKey, T[]>();

  function bucketKey(inv: T): BucketKey | null {
    const cur = readOperationalDebtInvoiceCurrency(inv);
    const bal = round2(balanceForDedup(inv, invoiceBalanceMap));
    if (!cur || !(bal > PENDING_EPSILON)) return null;
    return `${cur}:${bal.toFixed(2)}`;
  }

  for (const shadow of shadows) {
    const key = bucketKey(shadow);
    if (!key) continue;
    const list = shadowBuckets.get(key) ?? [];
    list.push(shadow);
    shadowBuckets.set(key, list);
  }
  for (const real of reals) {
    const key = bucketKey(real);
    if (!key) continue;
    const list = realBuckets.get(key) ?? [];
    list.push(real);
    realBuckets.set(key, list);
  }

  for (const [key, bucketShadows] of shadowBuckets) {
    const bucketReals = realBuckets.get(key) ?? [];
    if (bucketShadows.length === 1 && bucketReals.length === 1) {
      const shadowId = String(bucketShadows[0]!.id ?? "").trim();
      const realId = String(bucketReals[0]!.id ?? "").trim();
      if (shadowId && realId) shadowToReal.set(shadowId, realId);
      continue;
    }
    if (bucketShadows.length > 1 && bucketShadows.length === bucketReals.length) {
      const sortedShadows = [...bucketShadows].sort((a, b) =>
        String(a.id ?? "").localeCompare(String(b.id ?? ""))
      );
      const sortedReals = [...bucketReals].sort((a, b) =>
        String(a.id ?? "").localeCompare(String(b.id ?? ""))
      );
      for (let i = 0; i < sortedShadows.length; i += 1) {
        const shadowId = String(sortedShadows[i]!.id ?? "").trim();
        const realId = String(sortedReals[i]!.id ?? "").trim();
        if (shadowId && realId) shadowToReal.set(shadowId, realId);
      }
    }
  }

  for (const shadow of shadows) {
    const shadowId = String(shadow.id ?? "").trim();
    if (!shadowId || shadowToReal.has(shadowId) || usedShadowIds.has(shadowId)) continue;
    const shadowCur = readOperationalDebtInvoiceCurrency(shadow);
    const shadowBal = balanceForDedup(shadow, invoiceBalanceMap);
    if (!shadowCur || !(shadowBal > PENDING_EPSILON)) continue;

    const candidates = reals.filter((real) => {
      const realId = String(real.id ?? "").trim();
      if (!realId || usedRealIds.has(realId) || shadowToReal.has(shadowId)) return false;
      const realCur = readOperationalDebtInvoiceCurrency(real);
      if (realCur !== shadowCur) return false;
      const realBal = balanceForDedup(real, invoiceBalanceMap);
      const realTotal = round2(num(real.total_amount));
      return (
        totalsWithinTolerance(realBal, shadowBal) ||
        totalsWithinTolerance(realTotal, shadowBal) ||
        totalsWithinTolerance(realTotal, num(shadow.total_amount))
      );
    });

    if (candidates.length === 1) {
      const realId = String(candidates[0]!.id ?? "").trim();
      shadowToReal.set(shadowId, realId);
      usedRealIds.add(realId);
      usedShadowIds.add(shadowId);
    }
  }

  return shadowToReal;
}

/**
 * Clave de equivalencia comprobante Zeta dentro de un cliente.
 * `null` → fila independiente (sin dedupe cross-row).
 */
export function buildOperationalDebtEquivalenceKey(
  inv: OperationalDebtInvoiceInput
): string | null {
  const invoiceNumber = String(inv.invoice_number ?? "").trim();

  if (isZetaSaldosPendientesShadowRow(inv)) {
    const rid = parseZetaLegacyRegistroIdFromInvoiceNumber(invoiceNumber);
    if (rid) return `reg:${rid}`;
  }

  const regIds = extractRegistroIdsFromInvoiceZetaMetadata(inv.zeta_metadata);
  if (regIds.length > 0) {
    return `reg:${[...regIds].sort()[0]}`;
  }

  if (invoiceNumber.startsWith("ZETA:CCV1:")) {
    return `ccv1:${invoiceNumber}`;
  }

  const companyId = String(inv.company_id ?? "").trim();
  const currency = readOperationalDebtInvoiceCurrency(inv);
  const issue = ymd(inv.issue_date);
  const total = round2(num(inv.total_amount));
  if (companyId && currency && issue && total > PENDING_EPSILON) {
    return `heur:${companyId}:${currency}:${issue}:${total.toFixed(2)}`;
  }

  return null;
}

function isRealOperationalDebtInvoice(inv: OperationalDebtInvoiceInput): boolean {
  return !isZetaSaldosPendientesShadowRow(inv);
}

function pickWinnerInEquivalenceGroup<T extends OperationalDebtInvoiceInput>(
  group: readonly T[]
): OperationalDebtDedupSelection<T> | null {
  if (group.length === 0) return null;

  const reals = group.filter(isRealOperationalDebtInvoice);
  const shadows = group.filter(isZetaSaldosPendientesShadowRow);

  const candidates = reals.length > 0 ? reals : shadows;
  const sorted = [...candidates].sort((a, b) => {
    const aCcV1 = String(a.invoice_number ?? "").startsWith("ZETA:CCV1:") ? 1 : 0;
    const bCcV1 = String(b.invoice_number ?? "").startsWith("ZETA:CCV1:") ? 1 : 0;
    if (bCcV1 !== aCcV1) return bCcV1 - aCcV1;
    return pendingAmount(b) - pendingAmount(a);
  });

  const winner = sorted[0];
  if (!winner) return null;

  const skippedShadowIds = shadows
    .filter((s) => s !== winner)
    .map((s) => String(s.id ?? "").trim())
    .filter(Boolean);

  const key =
    buildOperationalDebtEquivalenceKey(winner) ??
    `id:${String(winner.id ?? "").trim() || "unknown"}`;

  return {
    invoice: winner,
    isShadow: isZetaSaldosPendientesShadowRow(winner),
    equivalenceKey: key,
    skippedShadowIds,
  };
}

/**
 * Selecciona una fila por comprobante equivalente (por cliente).
 * Excluye void/NC antes de agrupar.
 */
export function selectOperationalDebtInvoicesForSummation<
  T extends OperationalDebtInvoiceInput,
>(
  invoices: readonly T[],
  options?: { invoiceBalanceMap?: Map<string, number> }
): OperationalDebtDedupSelection<T>[] {
  const eligible: T[] = [];
  for (const inv of invoices) {
    if (isVoidedFinancialInvoice(inv as Record<string, unknown>)) continue;
    if (isCreditNoteFromMetadata(inv.zeta_metadata)) continue;
    eligible.push(inv);
  }

  const byCompany = new Map<string, T[]>();
  for (const inv of eligible) {
    const companyId = String(inv.company_id ?? "").trim() || "__single_client__";
    const list = byCompany.get(companyId) ?? [];
    list.push(inv);
    byCompany.set(companyId, list);
  }

  const selections: OperationalDebtDedupSelection<T>[] = [];

  for (const companyInvoices of byCompany.values()) {
    const grouped = new Map<string, T[]>();
    const standalone: T[] = [];

    for (const inv of companyInvoices) {
      const key = buildOperationalDebtEquivalenceKey(inv);
      if (!key) {
        standalone.push(inv);
        continue;
      }
      const bucket = grouped.get(key) ?? [];
      bucket.push(inv);
      grouped.set(key, bucket);
    }

    const consumedShadowIds = new Set<string>();
    const registroWinners: T[] = [];

    for (const group of grouped.values()) {
      const realsInGroup = group.filter(isRealOperationalDebtInvoice);
      const shadowsInGroup = group.filter(isZetaSaldosPendientesShadowRow);
      if (realsInGroup.length === 0 && shadowsInGroup.length > 0) {
        continue;
      }
      const picked = pickWinnerInEquivalenceGroup(group);
      if (!picked) continue;
      selections.push(picked);
      registroWinners.push(picked.invoice);
      for (const sid of picked.skippedShadowIds) consumedShadowIds.add(sid);
    }

    const unmatchedShadows = companyInvoices.filter(
      (inv) =>
        isZetaSaldosPendientesShadowRow(inv) &&
        !consumedShadowIds.has(String(inv.id ?? "").trim())
    );
    const allReals = companyInvoices.filter(isRealOperationalDebtInvoice);

    const registroPairs = pairShadowsToRealsByRegistroId(
      unmatchedShadows,
      allReals,
      options?.invoiceBalanceMap
    );
    const stillUnmatchedShadows = unmatchedShadows.filter(
      (inv) => !registroPairs.has(String(inv.id ?? "").trim())
    );
    const balancePairs = pairShadowsToRealsByBalance(
      stillUnmatchedShadows,
      allReals.filter(
        (real) => !new Set(registroPairs.values()).has(String(real.id ?? "").trim())
      ),
      options?.invoiceBalanceMap
    );
    const allPairs = new Map([...registroPairs, ...balancePairs]);
    for (const shadow of unmatchedShadows) {
      const shadowId = String(shadow.id ?? "").trim();
      if (allPairs.has(shadowId)) {
        consumedShadowIds.add(shadowId);
      }
    }

    for (const inv of standalone) {
      const invId = String(inv.id ?? "").trim();
      if (isZetaSaldosPendientesShadowRow(inv) && consumedShadowIds.has(invId)) continue;
      if (isZetaSaldosPendientesShadowRow(inv) && allPairs.has(invId)) continue;
      selections.push({
        invoice: inv,
        isShadow: isZetaSaldosPendientesShadowRow(inv),
        equivalenceKey: `id:${invId || "unknown"}`,
        skippedShadowIds: [],
      });
    }

    for (const shadow of unmatchedShadows) {
      const shadowId = String(shadow.id ?? "").trim();
      if (allPairs.has(shadowId)) {
        const realId = allPairs.get(shadowId)!;
        const existing = selections.find((s) => String(s.invoice.id ?? "") === realId);
        if (existing) {
          existing.skippedShadowIds = [...existing.skippedShadowIds, shadowId];
        }
        continue;
      }
      selections.push({
        invoice: shadow,
        isShadow: true,
        equivalenceKey: buildOperationalDebtEquivalenceKey(shadow) ?? `id:${shadowId}`,
        skippedShadowIds: [],
      });
    }
  }

  return selections;
}

export function aggregateOperationalDebtForCompany<
  T extends OperationalDebtInvoiceInput,
>(
  invoices: readonly T[],
  options?: { todayYmd?: string; invoiceBalanceMap?: Map<string, number> }
): CompanyOperationalDebtTotals {
  const todayYmd =
    options?.todayYmd ??
    (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();

  const selections = selectOperationalDebtInvoicesForSummation(invoices, options);
  let debtUYU = 0;
  let debtUSD = 0;
  let overdueUYU = 0;
  let overdueUSD = 0;
  let invoiceCount = 0;
  let shadowSkippedCount = 0;

  for (const sel of selections) {
    shadowSkippedCount += sel.skippedShadowIds.length;
    const inv = sel.invoice;
    const pending = pendingAmount(inv, options?.invoiceBalanceMap);
    if (!(pending > PENDING_EPSILON)) continue;

    const currency = readOperationalDebtInvoiceCurrency(inv);
    if (!currency) continue;

    invoiceCount += 1;
    const due = ymd(inv.due_date);
    const isOverdue = due !== "" && due < todayYmd;

    if (currency === "UYU") {
      debtUYU = round2(debtUYU + pending);
      if (isOverdue) overdueUYU = round2(overdueUYU + pending);
    } else {
      debtUSD = round2(debtUSD + pending);
      if (isOverdue) overdueUSD = round2(overdueUSD + pending);
    }
  }

  return {
    debtUYU,
    debtUSD,
    overdueUYU,
    overdueUSD,
    invoiceCount,
    shadowSkippedCount,
  };
}

/** Expuesto para tests: ¿dos filas representan el mismo comprobante? */
export function operationalDebtInvoicesAreEquivalent(
  a: OperationalDebtInvoiceInput,
  b: OperationalDebtInvoiceInput
): boolean {
  const companyA = String(a.company_id ?? "").trim();
  const companyB = String(b.company_id ?? "").trim();
  if (!companyA || companyA !== companyB) return false;

  const keyA = buildOperationalDebtEquivalenceKey(a);
  const keyB = buildOperationalDebtEquivalenceKey(b);
  if (keyA && keyB && keyA === keyB) return true;

  const shadow = isZetaSaldosPendientesShadowRow(a)
    ? a
    : isZetaSaldosPendientesShadowRow(b)
      ? b
      : null;
  const real = shadow === a ? b : shadow === b ? a : null;
  if (shadow && real && !isZetaSaldosPendientesShadowRow(real)) {
    const registroId = shadowRegistroId(shadow);
    if (registroId && realHasRegistroId(real, registroId)) return true;
    const shadowIssue = ymd(shadow.issue_date);
    const realIssue = ymd(real.issue_date);
    const curA = readOperationalDebtInvoiceCurrency(a);
    const curB = readOperationalDebtInvoiceCurrency(b);
    if (
      shadowIssue &&
      realIssue === shadowIssue &&
      curA &&
      curA === curB &&
      amountsCompatibleForDedup(real, shadow)
    ) {
      return true;
    }
  }

  const curA = readOperationalDebtInvoiceCurrency(a);
  const curB = readOperationalDebtInvoiceCurrency(b);
  if (!curA || curA !== curB) return false;

  const issueA = ymd(a.issue_date);
  const issueB = ymd(b.issue_date);
  if (!issueA || issueA !== issueB) return false;

  return totalsWithinTolerance(num(a.total_amount), num(b.total_amount));
}
