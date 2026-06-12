/**
 * Payment Behavior Engine — PURE, no DB, no fetch, no React.
 *
 * Analyzes historical receipt/invoice data per client to project when
 * pending invoices are likely to be paid.
 *
 * Limitation (DIV-CONT-005): Zeta does not expose receipt→invoice links.
 * Days-to-pay is estimated via FIFO matching: within each client+currency,
 * oldest invoices are assumed to be covered by oldest receipts.
 * This approximation is conservative and documented in v1.
 *
 * Key fields used:
 *   proto_invoices:  balance_amount (live snapshot), issue_date, due_date
 *   proto_receipts:  receipt_date, amount, currency_code, company_id
 */

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export type PaymentBehaviorCurrency = "UYU" | "USD";

export type PaymentBehaviorInvoice = {
  invoiceId: string;
  clientId: string;
  clientName: string;
  currency: PaymentBehaviorCurrency;
  issueDate: string;
  dueDate?: string | null;
  totalAmount: number;
  balanceAmount: number;
  /** Non-null when paidAt is known (currently not available from Zeta). */
  paidAt?: string | null;
  isCreditNote?: boolean;
  isVoided?: boolean;
};

export type PaymentBehaviorReceipt = {
  receiptId: string;
  clientId: string;
  currency: PaymentBehaviorCurrency;
  amount: number;
  receiptDate: string;
  /** Always null in v1 — Zeta does not expose application links. */
  appliedInvoiceId?: string | null;
};

// ---------------------------------------------------------------------------
// Output types — client profile
// ---------------------------------------------------------------------------

export type PaymentRegularity = "stable" | "normal" | "irregular" | "unknown";
export type PaymentConfidence = "high" | "medium" | "low" | "insufficient_data";
export type TypicalPaymentWindow =
  | "early_month"
  | "mid_month"
  | "late_month"
  | "end_month"
  | "mixed";

export type ClientPaymentProfile = {
  clientId: string;
  clientName: string;
  currency: PaymentBehaviorCurrency;
  totalInvoices: number;
  paidInvoices: number;
  openInvoices: number;
  /** Mean days from issue_date to payment (outlier-capped). */
  avgDaysToPay: number | null;
  medianDaysToPay: number | null;
  p75DaysToPay: number | null;
  minDaysToPay: number | null;
  maxDaysToPay: number | null;
  /** Mean days between due_date and payment (positive = paid late). */
  avgDaysAfterDue: number | null;
  medianDaysAfterDue: number | null;
  paymentRegularity: PaymentRegularity;
  confidence: PaymentConfidence;
  typicalPaymentDayOfMonth: number | null;
  typicalPaymentWindow: TypicalPaymentWindow;
  lastPaymentDate: string | null;
  /** Fraction of total invoiced that was collected. */
  historicalRecoveryRate: number | null;
};

// ---------------------------------------------------------------------------
// Output types — per-invoice projection
// ---------------------------------------------------------------------------

export type ExpectedBucket =
  | "0_7_days"
  | "8_15_days"
  | "16_30_days"
  | "over_30_days"
  | "uncertain";

export type InvoicePaymentProjection = {
  invoiceId: string;
  clientId: string;
  currency: PaymentBehaviorCurrency;
  /** Expected payment date (never in the past). */
  predictedPaymentDate: string;
  confidence: PaymentConfidence;
  /** 0–100 score reflecting confidence strength. */
  confidenceScore: number;
  /** Balance remaining — amounts to charge from this invoice. */
  expectedAmount: number;
  expectedBucket: ExpectedBucket;
  /** Human-readable reasoning. */
  reason: string;
};

// ---------------------------------------------------------------------------
// Output types — aggregated projection
// ---------------------------------------------------------------------------

export type PaymentProjectionSummary = {
  currency: PaymentBehaviorCurrency;
  next7Days: number;
  next15Days: number;
  next30Days: number;
  over30Days: number;
  highConfidence30d: number;
  mediumConfidence30d: number;
  lowConfidence30d: number;
  totalExpected30d: number;
  /**
   * Weighted expected 30-day inflow:
   *   high = 0.90 · amount
   *   medium = 0.65 · amount
   *   low = 0.35 · amount
   *   insufficient_data = 0.20 · amount
   */
  weightedExpected30d: number;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const CONFIDENCE_WEIGHTS: Record<PaymentConfidence, number> = {
  high: 0.9,
  medium: 0.65,
  low: 0.35,
  insufficient_data: 0.2,
};

const MIN_PAID_FOR_MEDIUM = 3;
const MIN_PAID_FOR_HIGH = 5;
const OUTLIER_CAP_DAYS = 365;

function daysBetween(fromYmd: string, toYmd: string): number {
  const a = Date.parse(`${fromYmd}T12:00:00.000Z`);
  const b = Date.parse(`${toYmd}T12:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

function addDays(ymd: string, days: number): string {
  const ms = Date.parse(`${ymd}T12:00:00.000Z`);
  if (!Number.isFinite(ms)) return ymd;
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}

function isValidYmd(s: string | null | undefined): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    const a = sorted[mid - 1];
    const b = sorted[mid];
    if (a === undefined || b === undefined) return null;
    return (a + b) / 2;
  }
  const v = sorted[mid];
  return v === undefined ? null : v;
}

function percentile75(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.ceil(sorted.length * 0.75) - 1;
  return sorted[Math.max(0, idx)]!;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Determine "day of month" cluster for a list of dates. */
function typicalDayOfMonth(dates: string[]): number | null {
  if (dates.length === 0) return null;
  const days = dates
    .map((d) => {
      const parsed = parseInt(d.slice(8, 10), 10);
      return Number.isFinite(parsed) ? parsed : null;
    })
    .filter((d): d is number => d !== null);
  if (days.length === 0) return null;
  const sum = days.reduce((a, b) => a + b, 0);
  return Math.round(sum / days.length);
}

function typicalWindow(day: number | null): TypicalPaymentWindow {
  if (day === null) return "mixed";
  if (day <= 5) return "early_month";
  if (day <= 15) return "mid_month";
  if (day <= 25) return "late_month";
  return "end_month";
}

function coefficientOfVariation(sorted: number[]): number {
  if (sorted.length < 2) return 0;
  const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  if (avg === 0) return 0;
  const variance = sorted.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / sorted.length;
  return Math.sqrt(variance) / Math.abs(avg);
}

function paymentRegularity(
  sortedDays: number[],
  baseConfidence: PaymentConfidence
): PaymentRegularity {
  if (baseConfidence === "insufficient_data") return "unknown";
  const cv = coefficientOfVariation(sortedDays);
  if (cv <= 0.15) return "stable";
  if (cv <= 0.4) return "normal";
  return "irregular";
}

/**
 * Lower confidence by one level.
 * allowInsufficient=false: "low" stays "low" (used for regularity penalty).
 * allowInsufficient=true:  "low" drops to "insufficient_data" (used for recency penalty).
 */
function lowerOneLevel(c: PaymentConfidence, allowInsufficient: boolean): PaymentConfidence {
  if (c === "high") return "medium";
  if (c === "medium") return "low";
  if (c === "low") return allowInsufficient ? "insufficient_data" : "low";
  return "insufficient_data";
}

// ---------------------------------------------------------------------------
// FIFO receipt→invoice matching heuristic
// ---------------------------------------------------------------------------

/**
 * Estimates days_to_pay for closed invoices using FIFO matching.
 * Since Zeta does not expose receipt→invoice links (DIV-CONT-005), we match
 * oldest invoices to oldest receipts within client+currency.
 *
 * Returns an array of { issueDate, dueDate, daysToPay, daysAfterDue } for
 * each invoice that was fully covered.
 */
function matchFifoPayments(
  invoices: PaymentBehaviorInvoice[],
  receipts: PaymentBehaviorReceipt[],
  today: string
): Array<{ issueDate: string; dueDate: string | null; daysToPay: number; daysAfterDue: number | null; receiptDate: string }> {
  // Sort invoices by issueDate ascending (oldest first)
  const sortedInvoices = invoices
    .filter((inv) => !inv.isCreditNote && !inv.isVoided && isValidYmd(inv.issueDate))
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate));

  // Sort receipts by receiptDate ascending
  const sortedReceipts = receipts
    .filter((r) => r.amount > 0 && isValidYmd(r.receiptDate))
    .sort((a, b) => a.receiptDate.localeCompare(b.receiptDate));

  const results: Array<{
    issueDate: string;
    dueDate: string | null;
    daysToPay: number;
    daysAfterDue: number | null;
    receiptDate: string;
  }> = [];

  // FIFO: consume receipts across invoices (mutable queue).
  // Receipts are consumed in date order; each invoice consumes from
  // the oldest available receipt that post-dates its issue_date.
  const receiptQueue: { date: string; remaining: number }[] = sortedReceipts.map((r) => ({
    date: r.receiptDate,
    remaining: r.amount,
  }));

  // Cursor: skip receipts that are fully consumed
  let qCursor = 0;

  for (const inv of sortedInvoices) {
    const target = inv.totalAmount;
    if (target <= 0) continue;

    // Only attribute daysToPay to invoices confirmed paid by Zeta (balance=0)
    if (inv.balanceAmount > 0) continue;

    let covered = 0;
    let lastCoveringReceiptDate: string | null = null;

    // Advance cursor past fully consumed receipts
    while (qCursor < receiptQueue.length && (receiptQueue[qCursor]?.remaining ?? 0) <= 0) {
      qCursor++;
    }

    let i = qCursor;
    while (i < receiptQueue.length && covered < target) {
      const r = receiptQueue[i]!;
      if (r.remaining <= 0) { i++; continue; }
      if (r.date < inv.issueDate) {
        // Receipt predates invoice — cannot apply
        i++;
        continue;
      }
      const take = Math.min(r.remaining, target - covered);
      r.remaining -= take;   // consume from the receipt
      covered += take;
      if (take > 0) lastCoveringReceiptDate = r.date;
      i++;
    }

    if (lastCoveringReceiptDate === null) {
      // No receipt found — use today as conservative estimate
      lastCoveringReceiptDate = today;
    }

    const daysToPay = Math.max(0, daysBetween(inv.issueDate, lastCoveringReceiptDate));
    const cappedDays = Math.min(daysToPay, OUTLIER_CAP_DAYS);
    const daysAfterDue =
      isValidYmd(inv.dueDate)
        ? daysBetween(inv.dueDate!, lastCoveringReceiptDate)
        : null;

    results.push({
      issueDate: inv.issueDate,
      dueDate: inv.dueDate ?? null,
      daysToPay: cappedDays,
      daysAfterDue,
      receiptDate: lastCoveringReceiptDate,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Public: build client profiles
// ---------------------------------------------------------------------------

/**
 * Computes ClientPaymentProfile for every (client, currency) combination found
 * in the input arrays.
 *
 * Returns a flat Map keyed by `"${clientId}::${currency}"`.
 */
export function buildClientPaymentProfiles(
  invoices: PaymentBehaviorInvoice[],
  receipts: PaymentBehaviorReceipt[],
  today: string
): Map<string, ClientPaymentProfile> {
  const profileMap = new Map<string, ClientPaymentProfile>();

  // Group by clientId+currency
  type ClientKey = string;
  const invoicesByKey = new Map<ClientKey, PaymentBehaviorInvoice[]>();
  const receiptsByKey = new Map<ClientKey, PaymentBehaviorReceipt[]>();

  for (const inv of invoices) {
    const key = `${inv.clientId}::${inv.currency}`;
    if (!invoicesByKey.has(key)) invoicesByKey.set(key, []);
    invoicesByKey.get(key)!.push(inv);
  }

  for (const r of receipts) {
    const key = `${r.clientId}::${r.currency}`;
    if (!receiptsByKey.has(key)) receiptsByKey.set(key, []);
    receiptsByKey.get(key)!.push(r);
  }

  for (const [key, clientInvoices] of invoicesByKey) {
    const [clientId, currency] = key.split("::") as [string, PaymentBehaviorCurrency];
    const clientReceipts = receiptsByKey.get(key) ?? [];

    const operationalInvoices = clientInvoices.filter(
      (inv) => !inv.isCreditNote && !inv.isVoided && inv.totalAmount > 0
    );

    const paidInvoices = operationalInvoices.filter((inv) => inv.balanceAmount <= 0);
    const openInvoices = operationalInvoices.filter((inv) => inv.balanceAmount > 0);

    // FIFO matching to estimate days_to_pay
    const matched = matchFifoPayments(clientInvoices, clientReceipts, today);
    const sortedDays = matched.map((m) => m.daysToPay).sort((a, b) => a - b);
    const sortedDaysAfterDue = matched
      .map((m) => m.daysAfterDue)
      .filter((d): d is number => d !== null)
      .sort((a, b) => a - b);

    const paidCount = paidInvoices.length;

    // Step 1: base confidence from paid count
    const baseConfidence: PaymentConfidence =
      paidCount >= MIN_PAID_FOR_HIGH
        ? "high"
        : paidCount >= MIN_PAID_FOR_MEDIUM
          ? "medium"
          : paidCount >= 1
            ? "low"
            : "insufficient_data";

    const avg =
      sortedDays.length > 0
        ? round2(sortedDays.reduce((a, b) => a + b, 0) / sortedDays.length)
        : null;
    const med = median(sortedDays);
    const p75 = percentile75(sortedDays);
    const min = sortedDays.length > 0 ? sortedDays[0]! : null;
    const max = sortedDays.length > 0 ? sortedDays[sortedDays.length - 1]! : null;
    const avgAfterDue =
      sortedDaysAfterDue.length > 0
        ? round2(sortedDaysAfterDue.reduce((a, b) => a + b, 0) / sortedDaysAfterDue.length)
        : null;
    const medAfterDue = median(sortedDaysAfterDue);

    const receiptDates = clientReceipts
      .filter((r) => isValidYmd(r.receiptDate))
      .map((r) => r.receiptDate)
      .sort()
      .reverse();
    const lastPaymentDate = receiptDates[0] ?? null;

    const typDay = typicalDayOfMonth(receiptDates);
    const typWin = typicalWindow(typDay);

    const totalInvoiced = operationalInvoices.reduce((s, inv) => s + inv.totalAmount, 0);
    const totalPaid = operationalInvoices.reduce(
      (s, inv) => s + (inv.totalAmount - Math.max(0, inv.balanceAmount)),
      0
    );
    const recoveryRate =
      totalInvoiced > 0 ? round2(Math.min(1, Math.max(0, totalPaid / totalInvoiced))) : null;

    const clientName = clientInvoices[0]?.clientName ?? "";

    // Step 2: regularity (computed against base confidence, before any adjustments)
    const reg = paymentRegularity(sortedDays, baseConfidence);

    // Step 3: adjust confidence for regularity
    let confidence = baseConfidence;
    if (reg === "irregular") {
      // high→medium, medium→low, low stays low (not penalised to insufficient_data)
      confidence = lowerOneLevel(confidence, false);
    } else if (reg === "unknown" && confidence !== "insufficient_data") {
      // No proven history — never allow above low
      confidence = "low";
    }

    // Step 4: adjust confidence for recency (can reach insufficient_data)
    if (lastPaymentDate !== null) {
      const daysSinceLast = daysBetween(lastPaymentDate, today);
      if (daysSinceLast > 180) {
        confidence = lowerOneLevel(lowerOneLevel(confidence, true), true);
      } else if (daysSinceLast > 90) {
        confidence = lowerOneLevel(confidence, true);
      }
    }

    profileMap.set(key, {
      clientId,
      clientName,
      currency,
      totalInvoices: operationalInvoices.length,
      paidInvoices: paidCount,
      openInvoices: openInvoices.length,
      avgDaysToPay: avg,
      medianDaysToPay: med !== null ? round2(med) : null,
      p75DaysToPay: p75 !== null ? round2(p75) : null,
      minDaysToPay: min,
      maxDaysToPay: max,
      avgDaysAfterDue: avgAfterDue,
      medianDaysAfterDue: medAfterDue !== null ? round2(medAfterDue) : null,
      paymentRegularity: reg,
      confidence,
      typicalPaymentDayOfMonth: typDay,
      typicalPaymentWindow: typWin,
      lastPaymentDate,
      historicalRecoveryRate: recoveryRate,
    });
  }

  return profileMap;
}

// ---------------------------------------------------------------------------
// Global fallbacks (used when client has insufficient data)
// ---------------------------------------------------------------------------

export type GlobalPaymentFallbacks = Partial<Record<PaymentBehaviorCurrency, {
  medianDaysToPay: number;
  medianDaysAfterDue: number;
}>>;

/** Derive global fallbacks from the full population of matched pairs. */
export function buildGlobalFallbacks(
  invoices: PaymentBehaviorInvoice[],
  receipts: PaymentBehaviorReceipt[],
  today: string
): GlobalPaymentFallbacks {
  const byKey = new Map<PaymentBehaviorCurrency, number[]>();

  const invoicesByCur = groupBy(invoices, (i) => i.currency);
  const receiptsByCur = groupBy(receipts, (r) => r.currency);

  for (const currency of ["UYU", "USD"] as PaymentBehaviorCurrency[]) {
    const allMatchedInCur = matchFifoPayments(
      invoicesByCur.get(currency) ?? [],
      receiptsByCur.get(currency) ?? [],
      today
    );
    const days = allMatchedInCur.map((m) => m.daysToPay).sort((a, b) => a - b);
    if (days.length > 0) byKey.set(currency, days);
  }

  const result: GlobalPaymentFallbacks = {};
  for (const [currency, days] of byKey) {
    const med = median(days);
    if (med === null) continue;
    const daysAfterDue = days.map((d) => Math.max(0, d - 30)).sort((a, b) => a - b);
    const medAfterDue = median(daysAfterDue) ?? 15;
    result[currency] = {
      medianDaysToPay: round2(med),
      medianDaysAfterDue: round2(medAfterDue),
    };
  }
  return result;
}

// ---------------------------------------------------------------------------
// Projected payment date for a single invoice
// ---------------------------------------------------------------------------

/**
 * Returns the next occurrence of `dayOfMonth` that is >= `fromYmd`.
 * If the day has already passed this month, advances to next month.
 */
function nextOccurrenceOfDayInMonth(fromYmd: string, dayOfMonth: number): string {
  const ms = Date.parse(`${fromYmd}T12:00:00.000Z`);
  if (!Number.isFinite(ms)) return fromYmd;
  const dt = new Date(ms);
  const year = dt.getUTCFullYear();
  const month = dt.getUTCMonth(); // 0-based
  const currentDay = dt.getUTCDate();

  let targetMonth = month;
  let targetYear = year;

  if (currentDay > dayOfMonth) {
    // Day already passed this month — go to next month
    targetMonth += 1;
    if (targetMonth > 11) {
      targetMonth = 0;
      targetYear += 1;
    }
  }

  // Clamp to last day of month
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(dayOfMonth, lastDay);
  const target = new Date(Date.UTC(targetYear, targetMonth, clampedDay));
  return target.toISOString().slice(0, 10);
}

/**
 * Compute the projected payment date for a single open invoice.
 * Never returns a date in the past.
 */
function projectPaymentDate(
  inv: PaymentBehaviorInvoice,
  profile: ClientPaymentProfile | null,
  fallback: { medianDaysToPay: number; medianDaysAfterDue: number } | null,
  today: string
): { date: string; reason: string } {
  const isOverdue = isValidYmd(inv.dueDate) && inv.dueDate! < today;
  const medianDays = profile?.medianDaysToPay ?? fallback?.medianDaysToPay ?? 30;
  const medianAfterDue = profile?.medianDaysAfterDue ?? fallback?.medianDaysAfterDue ?? 15;
  const typDay = profile?.typicalPaymentDayOfMonth;

  let predictedDate: string;
  let reason: string;

  if (isOverdue) {
    // Invoice already past due — use due_date + median lag after due
    const baseDate = addDays(inv.dueDate!, Math.max(0, medianAfterDue));
    predictedDate = baseDate > today ? baseDate : addDays(today, 7);
    reason =
      profile && profile.confidence !== "insufficient_data"
        ? `Factura vencida. Historial del cliente: paga típicamente ${Math.round(Math.abs(medianAfterDue))} días después del vencimiento.`
        : `Factura vencida. Sin historial suficiente — proyectando +7 días desde hoy.`;
  } else if (isValidYmd(inv.issueDate) && medianDays > 0) {
    predictedDate = addDays(inv.issueDate, medianDays);
    reason =
      profile && profile.confidence !== "insufficient_data"
        ? `Historial del cliente: mediana ${Math.round(medianDays)} días desde emisión.`
        : `Sin historial suficiente — usando promedio global (${Math.round(medianDays)} días).`;
  } else {
    // Fallback: +30 days from today
    predictedDate = addDays(today, 30);
    reason = "Sin historial ni vencimiento — proyectando 30 días desde hoy.";
  }

  // Adjust to typical payment day of month if the client has one
  if (typeof typDay === "number" && profile && profile.confidence !== "insufficient_data") {
    const adjustedDate = nextOccurrenceOfDayInMonth(predictedDate, typDay);
    if (adjustedDate >= today && Math.abs(daysBetween(predictedDate, adjustedDate)) <= 15) {
      predictedDate = adjustedDate;
      reason += ` Ajustado al día típico de pago del cliente (día ${typDay} del mes).`;
    }
  }

  // Never return a date in the past
  if (predictedDate < today) {
    predictedDate = addDays(today, 7);
    reason += " (Fecha proyectada en pasado — corregida a +7 días.)";
  }

  return { date: predictedDate, reason };
}

// ---------------------------------------------------------------------------
// Confidence score (0–100)
// ---------------------------------------------------------------------------

function confidenceScore(profile: ClientPaymentProfile | null, confidence: PaymentConfidence): number {
  // Base scores per level. Confidence already encodes regularity + recency penalties,
  // so adjustments here are fine-tuning within each band.
  const base: Record<PaymentConfidence, number> = {
    high: 85,           // range ~77–98
    medium: 65,         // range ~57–78
    low: 30,            // range ~22–38
    insufficient_data: 20, // range ~15–28
  };
  let score = base[confidence];
  if (profile) {
    // Regularity fine-tunes within the band (confidence was already lowered for irregular)
    if (profile.paymentRegularity === "stable") score = Math.min(100, score + 8);
    if (profile.paymentRegularity === "irregular") score = Math.max(0, score - 8);
    // Recovery rate quality signal
    if ((profile.historicalRecoveryRate ?? 0) >= 0.9) score = Math.min(100, score + 5);
    if ((profile.historicalRecoveryRate ?? 0) < 0.6 && profile.historicalRecoveryRate !== null) {
      score = Math.max(0, score - 5);
    }
  }
  return Math.round(score);
}

// ---------------------------------------------------------------------------
// Bucket assignment
// ---------------------------------------------------------------------------

function assignBucket(predictedDate: string, today: string): ExpectedBucket {
  const days = daysBetween(today, predictedDate);
  if (days <= 0) return "0_7_days";
  if (days <= 7) return "0_7_days";
  if (days <= 15) return "8_15_days";
  if (days <= 30) return "16_30_days";
  if (days <= 90) return "over_30_days";
  return "uncertain";
}

// ---------------------------------------------------------------------------
// Public: project open invoices
// ---------------------------------------------------------------------------

/**
 * Projects expected payment date and confidence for all open invoices.
 *
 * - Excludes voided and credit notes.
 * - Uses `balanceAmount` as `expectedAmount` (partial payments supported).
 * - Predicted date is capped to never be in the past.
 */
export function projectOpenInvoices(
  openInvoices: PaymentBehaviorInvoice[],
  profiles: Map<string, ClientPaymentProfile>,
  fallbacks: GlobalPaymentFallbacks,
  today: string
): InvoicePaymentProjection[] {
  const results: InvoicePaymentProjection[] = [];

  for (const inv of openInvoices) {
    if (inv.isCreditNote || inv.isVoided) continue;
    if (inv.balanceAmount <= 0) continue;
    if (!isValidYmd(inv.issueDate)) continue;

    const profileKey = `${inv.clientId}::${inv.currency}`;
    const profile = profiles.get(profileKey) ?? null;
    const fb = fallbacks[inv.currency] ?? null;

    const conf: PaymentConfidence =
      profile?.confidence !== "insufficient_data" && profile?.confidence !== undefined
        ? profile.confidence
        : fb !== null
          ? "low"
          : "insufficient_data";

    const { date: predictedDate, reason } = projectPaymentDate(inv, profile, fb, today);
    const score = confidenceScore(profile, conf);
    const bucket = assignBucket(predictedDate, today);

    results.push({
      invoiceId: inv.invoiceId,
      clientId: inv.clientId,
      currency: inv.currency,
      predictedPaymentDate: predictedDate,
      confidence: conf,
      confidenceScore: score,
      expectedAmount: round2(inv.balanceAmount),
      expectedBucket: bucket,
      reason,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Public: aggregate projection summary
// ---------------------------------------------------------------------------

/**
 * Aggregates invoice projections into PaymentProjectionSummary per currency.
 */
export function buildProjectionSummary(
  projections: InvoicePaymentProjection[],
  today: string
): PaymentProjectionSummary[] {
  const byCurrency = new Map<PaymentBehaviorCurrency, InvoicePaymentProjection[]>();

  for (const p of projections) {
    if (!byCurrency.has(p.currency)) byCurrency.set(p.currency, []);
    byCurrency.get(p.currency)!.push(p);
  }

  const summaries: PaymentProjectionSummary[] = [];

  for (const [currency, items] of byCurrency) {
    let next7 = 0, next15 = 0, next30 = 0, over30 = 0;
    let highConf30 = 0, medConf30 = 0, lowConf30 = 0;
    let weighted30 = 0;

    for (const item of items) {
      const days = daysBetween(today, item.predictedPaymentDate);
      const amt = item.expectedAmount;
      const w = CONFIDENCE_WEIGHTS[item.confidence];

      if (days <= 7) next7 = round2(next7 + amt);
      if (days <= 15) next15 = round2(next15 + amt);
      if (days <= 30) {
        next30 = round2(next30 + amt);
        if (item.confidence === "high") highConf30 = round2(highConf30 + amt);
        else if (item.confidence === "medium") medConf30 = round2(medConf30 + amt);
        else lowConf30 = round2(lowConf30 + amt);
        weighted30 = round2(weighted30 + amt * w);
      } else {
        over30 = round2(over30 + amt);
      }
    }

    summaries.push({
      currency,
      next7Days: next7,
      next15Days: next15,
      next30Days: next30,
      over30Days: over30,
      highConfidence30d: highConf30,
      mediumConfidence30d: medConf30,
      lowConfidence30d: lowConf30,
      totalExpected30d: next30,
      weightedExpected30d: weighted30,
    });
  }

  return summaries;
}

// ---------------------------------------------------------------------------
// Public: full pipeline (convenience)
// ---------------------------------------------------------------------------

export type PaymentBehaviorResult = {
  profiles: Map<string, ClientPaymentProfile>;
  projections: InvoicePaymentProjection[];
  summaries: PaymentProjectionSummary[];
  globalFallbacks: GlobalPaymentFallbacks;
};

/**
 * Full pipeline: profiles → project open invoices → aggregate summaries.
 */
export function runPaymentBehaviorEngine(
  invoices: PaymentBehaviorInvoice[],
  receipts: PaymentBehaviorReceipt[],
  today: string
): PaymentBehaviorResult {
  const profiles = buildClientPaymentProfiles(invoices, receipts, today);
  const globalFallbacks = buildGlobalFallbacks(invoices, receipts, today);
  const openInvoices = invoices.filter(
    (inv) => !inv.isCreditNote && !inv.isVoided && inv.balanceAmount > 0
  );
  const projections = projectOpenInvoices(openInvoices, profiles, globalFallbacks, today);
  const summaries = buildProjectionSummary(projections, today);

  return { profiles, projections, summaries, globalFallbacks };
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function groupBy<T, K>(arr: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of arr) {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
  }
  return map;
}
