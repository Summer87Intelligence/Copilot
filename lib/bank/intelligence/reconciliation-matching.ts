/**
 * FASE DOMAIN-IA-BANK-001 — Motor PURO, determinístico y explicable de conciliación.
 *
 * NO usa IA generativa como fuente de verdad. NO toca DB. NO usa float para dinero
 * (minor units = enteros). Devuelve candidatos con razones estructuradas, confianza
 * y una acción recomendada. Diseñado para correr en modo SHADOW (solo propone).
 *
 * Reglas de seguridad (nunca auto-conciliar): moneda distinta, dos candidatos
 * igualmente fuertes, cuenta que paga por varios clientes sin otra señal, diferencia
 * de importe no explicada, posible duplicado, recibo ya conciliado, factura ya
 * pagada, sobre-aplicación, cruce de workspace, fecha fuera de rango, movimiento
 * revertido, o ingreso no comercial.
 */

export const RECONCILIATION_ENGINE_VERSION = 1;

export type ReconCurrency = "UYU" | "USD";
export type ReconDirection = "inflow" | "outflow";

/** Importes SIEMPRE en minor units (enteros). */
export type NormalizedBankMovement = {
  id: string;
  workspaceId: string;
  amountMinor: number;
  currency: ReconCurrency;
  direction: ReconDirection;
  date: string; // ymd
  payerFingerprintHash: string;
  normalizedPayerName: string;
  bankReference?: string | null;
  isProbableDuplicate?: boolean;
  isReversed?: boolean;
  isNonCommercial?: boolean;
};

export type ClientCandidate = { clientId: string; workspaceId: string; normalizedName: string };
export type ReceiptCandidate = {
  receiptId: string;
  clientId: string;
  workspaceId: string;
  amountMinor: number;
  currency: ReconCurrency;
  date: string;
  alreadyReconciled?: boolean;
};
export type InvoiceCandidate = {
  invoiceId: string;
  clientId: string;
  workspaceId: string;
  currency: ReconCurrency;
  outstandingMinor: number; // saldo pendiente
  date: string;
};
export type PayerClientLink = {
  fingerprintHash: string;
  clientId: string;
  workspaceId: string;
  status: "detected" | "suggested" | "confirmed" | "learned" | "conflicted" | "inactive" | "rejected";
  paymentsCount: number;
};

export type ReconciliationReason =
  | "CONFIRMED_PAYER"
  | "EXACT_AMOUNT"
  | "MATCHING_RECEIPT"
  | "MATCHING_INVOICE"
  | "DATE_PROXIMITY"
  | "REFERENCE_MATCH"
  | "HISTORICAL_PATTERN"
  | "NORMALIZED_NAME_MATCH"
  | "MULTIPLE_CANDIDATES"
  | "CURRENCY_MISMATCH";

export type ReconciliationWarning =
  | "MULTIPLE_STRONG_CANDIDATES"
  | "AMOUNT_DIFFERENCE"
  | "SHARED_PAYER"
  | "POSSIBLE_DUPLICATE"
  | "RECEIPT_ALREADY_RECONCILED"
  | "INVOICE_FULLY_PAID"
  | "OUT_OF_DATE_RANGE"
  | "REVERSED_MOVEMENT"
  | "NON_COMMERCIAL"
  | "WORKSPACE_MISMATCH"
  | "UNAPPLIED_BALANCE";

export type RecommendedAction =
  | "AUTO_RECONCILE_CANDIDATE"
  | "REVIEW"
  | "UNIDENTIFIED"
  | "REJECT";

export type ReconciliationCandidateResult = {
  clientId?: string;
  receiptId?: string;
  invoiceAllocations: Array<{ invoiceId: string; amountMinor: number }>;
  confidence: number; // 0..100
  reasons: ReconciliationReason[];
  warnings: ReconciliationWarning[];
  recommendedAction: RecommendedAction;
};

export type ReconciliationMatchInput = {
  movement: NormalizedBankMovement;
  clients: ClientCandidate[];
  receipts: ReceiptCandidate[];
  invoices: InvoiceCandidate[];
  historicalLinks: PayerClientLink[];
  options?: { dateWindowDays?: number; amountToleranceMinor?: number };
};

const DEFAULT_DATE_WINDOW = 7;
const DEFAULT_AMOUNT_TOLERANCE = 1; // 1 cent

function daysBetween(a: string, b: string): number {
  const da = new Date(`${a.slice(0, 10)}T00:00:00Z`).getTime();
  const db = new Date(`${b.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round(Math.abs(da - db) / 86400000);
}

function reject(reasons: ReconciliationReason[], warnings: ReconciliationWarning[]): ReconciliationCandidateResult {
  return { invoiceAllocations: [], confidence: 0, reasons, warnings, recommendedAction: "REJECT" };
}

function unidentified(warnings: ReconciliationWarning[] = []): ReconciliationCandidateResult {
  return { invoiceAllocations: [], confidence: 0, reasons: [], warnings, recommendedAction: "UNIDENTIFIED" };
}

/**
 * Elige la mejor asignación a facturas de un cliente que sume EXACTAMENTE el importe
 * (una factura, o combinación de dos). Determinístico (orden por fecha, luego id).
 * Nunca asigna más que el saldo de cada factura ni más que el importe del movimiento.
 */
function allocateInvoices(
  amountMinor: number,
  invoices: InvoiceCandidate[],
  tol: number
): { allocations: Array<{ invoiceId: string; amountMinor: number }>; exact: boolean } {
  const open = invoices
    .filter((i) => i.outstandingMinor > 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.invoiceId.localeCompare(b.invoiceId)));

  // 1 factura exacta.
  for (const inv of open) {
    if (Math.abs(inv.outstandingMinor - amountMinor) <= tol) {
      return { allocations: [{ invoiceId: inv.invoiceId, amountMinor: Math.min(amountMinor, inv.outstandingMinor) }], exact: true };
    }
  }
  // 2 facturas cuya suma sea exacta.
  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) {
      if (Math.abs(open[i]!.outstandingMinor + open[j]!.outstandingMinor - amountMinor) <= tol) {
        return {
          allocations: [
            { invoiceId: open[i]!.invoiceId, amountMinor: open[i]!.outstandingMinor },
            { invoiceId: open[j]!.invoiceId, amountMinor: open[j]!.outstandingMinor },
          ],
          exact: true,
        };
      }
    }
  }
  // Pago parcial: aplica al saldo más antiguo sin exceder el importe.
  if (open.length > 0 && amountMinor > 0) {
    const inv = open[0]!;
    return { allocations: [{ invoiceId: inv.invoiceId, amountMinor: Math.min(amountMinor, inv.outstandingMinor) }], exact: false };
  }
  return { allocations: [], exact: false };
}

function clampConfidence(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function matchBankMovement(input: ReconciliationMatchInput): ReconciliationCandidateResult {
  const { movement } = input;
  const dateWindow = input.options?.dateWindowDays ?? DEFAULT_DATE_WINDOW;
  const tol = input.options?.amountToleranceMinor ?? DEFAULT_AMOUNT_TOLERANCE;
  const wsId = movement.workspaceId;

  // ── Guardas duras de seguridad ────────────────────────────────────────────
  if (movement.isReversed) return unidentified(["REVERSED_MOVEMENT"]);
  if (movement.isNonCommercial || movement.direction !== "inflow") return unidentified(["NON_COMMERCIAL"]);
  if (movement.isProbableDuplicate) return reject([], ["POSSIBLE_DUPLICATE"]);

  // Aislamiento por workspace: un match en OTRO workspace nunca concilia (rechazo).
  const crossWorkspaceHit =
    input.clients.some((c) => c.workspaceId !== wsId && c.normalizedName && c.normalizedName === movement.normalizedPayerName) ||
    input.receipts.some((r) => r.workspaceId !== wsId && r.currency === movement.currency && Math.abs(r.amountMinor - movement.amountMinor) <= tol);

  const clients = input.clients.filter((c) => c.workspaceId === wsId);
  const receipts = input.receipts.filter((r) => r.workspaceId === wsId);
  const invoices = input.invoices.filter((i) => i.workspaceId === wsId);
  const links = input.historicalLinks.filter((l) => l.workspaceId === wsId && l.status !== "rejected" && l.status !== "inactive");

  const sameWsSignal = clients.length > 0 || receipts.length > 0 || invoices.length > 0 || links.length > 0;
  if (crossWorkspaceHit && !sameWsSignal) {
    return reject([], ["WORKSPACE_MISMATCH"]);
  }

  const reasons: ReconciliationReason[] = [];
  const warnings: ReconciliationWarning[] = [];
  let confidence = 0;
  let exactAmountCounted = false;
  let clientId: string | undefined;
  let ambiguous = false;

  // ── Señal 1: pagador confirmado / aprendido ───────────────────────────────
  const confirmedLinks = links.filter((l) => l.fingerprintHash === movement.payerFingerprintHash && l.status === "confirmed");
  const learnedLinks = links.filter((l) => l.fingerprintHash === movement.payerFingerprintHash && (l.status === "learned" || l.status === "suggested" || l.status === "detected"));
  const distinctConfirmed = [...new Set(confirmedLinks.map((l) => l.clientId))];
  const distinctLearned = [...new Set(learnedLinks.map((l) => l.clientId))];

  if (distinctConfirmed.length === 1) {
    clientId = distinctConfirmed[0];
    confidence += 45;
    reasons.push("CONFIRMED_PAYER");
  } else if (distinctConfirmed.length > 1) {
    warnings.push("SHARED_PAYER");
    ambiguous = true;
  } else if (distinctLearned.length === 1) {
    clientId = distinctLearned[0];
    confidence += 10;
    reasons.push("HISTORICAL_PATTERN");
  } else if (distinctLearned.length > 1) {
    warnings.push("SHARED_PAYER");
    ambiguous = true;
  }

  // ── Señal por nombre (última) ─────────────────────────────────────────────
  const nameMatches = movement.normalizedPayerName
    ? clients.filter((c) => c.normalizedName && c.normalizedName === movement.normalizedPayerName)
    : [];
  if (!clientId && nameMatches.length === 1) {
    clientId = nameMatches[0]!.clientId;
    confidence += 5;
    reasons.push("NORMALIZED_NAME_MATCH");
  } else if (!clientId && nameMatches.length > 1) {
    warnings.push("MULTIPLE_STRONG_CANDIDATES");
    reasons.push("MULTIPLE_CANDIDATES");
    ambiguous = true;
  }

  // ── Recibo Zeta coincidente (mismo cliente, importe, moneda) ──────────────
  const scopedReceipts = clientId ? receipts.filter((r) => r.clientId === clientId) : receipts;
  const currencyReceipts = scopedReceipts.filter((r) => r.currency === movement.currency);
  const crossCurrencyReceipt = scopedReceipts.find((r) => r.currency !== movement.currency && Math.abs(r.amountMinor - movement.amountMinor) <= tol);
  if (crossCurrencyReceipt) return reject(["CURRENCY_MISMATCH"], [...warnings, "AMOUNT_DIFFERENCE"]);

  const activeExactReceipt = currencyReceipts.find((r) => !r.alreadyReconciled && Math.abs(r.amountMinor - movement.amountMinor) <= tol);
  const reconciledExactReceipt = currencyReceipts.find((r) => r.alreadyReconciled && Math.abs(r.amountMinor - movement.amountMinor) <= tol);
  if (reconciledExactReceipt && !activeExactReceipt) warnings.push("RECEIPT_ALREADY_RECONCILED");

  let receiptId: string | undefined;
  if (activeExactReceipt) {
    receiptId = activeExactReceipt.receiptId;
    if (!clientId) clientId = activeExactReceipt.clientId;
    confidence += 35;
    reasons.push("MATCHING_RECEIPT");
    if (!exactAmountCounted) { confidence += 10; reasons.push("EXACT_AMOUNT"); exactAmountCounted = true; }
    if (daysBetween(movement.date, activeExactReceipt.date) <= dateWindow) {
      confidence += 5;
      reasons.push("DATE_PROXIMITY");
    } else {
      warnings.push("OUT_OF_DATE_RANGE");
    }
  }

  // ── Facturas del cliente (exacta / múltiple / parcial) ────────────────────
  let invoiceAllocations: Array<{ invoiceId: string; amountMinor: number }> = [];
  if (clientId) {
    const clientInvoices = invoices.filter((i) => i.clientId === clientId);
    const openInvoices = clientInvoices.filter((i) => i.currency === movement.currency && i.outstandingMinor > 0);
    const anyOpen = openInvoices.length > 0;
    const { allocations, exact } = allocateInvoices(movement.amountMinor, openInvoices, tol);
    invoiceAllocations = allocations;
    if (allocations.length > 0) {
      reasons.push("MATCHING_INVOICE");
      if (exact) {
        confidence += 10;
        if (!exactAmountCounted) { confidence += 10; reasons.push("EXACT_AMOUNT"); exactAmountCounted = true; }
      } else {
        confidence += 5;
        const allocated = allocations.reduce((s, a) => s + a.amountMinor, 0);
        if (allocated < movement.amountMinor - tol) warnings.push("UNAPPLIED_BALANCE");
      }
    } else if (!anyOpen && clientInvoices.some((i) => i.outstandingMinor <= 0)) {
      warnings.push("INVOICE_FULLY_PAID");
    }

    // Diferencia de importe: recibo/factura "cercano" pero no exacto → revisar, no auto.
    if (!activeExactReceipt && allocations.length === 0) {
      const near =
        currencyReceipts.find((r) => !r.alreadyReconciled && amountIsNear(r.amountMinor, movement.amountMinor, tol)) ||
        openInvoices.find((i) => amountIsNear(i.outstandingMinor, movement.amountMinor, tol));
      if (near) warnings.push("AMOUNT_DIFFERENCE");
    }
  }

  // Nunca sobre-aplicar.
  const allocated = invoiceAllocations.reduce((s, a) => s + a.amountMinor, 0);
  if (allocated > movement.amountMinor + tol) return reject([], [...warnings, "AMOUNT_DIFFERENCE"]);

  // Cliente sin recibo ni factura aplicable → saldo sin aplicar.
  if (clientId && !activeExactReceipt && invoiceAllocations.length === 0 && !warnings.includes("AMOUNT_DIFFERENCE")) {
    warnings.push("UNAPPLIED_BALANCE");
  }

  confidence = clampConfidence(confidence);

  if (!clientId) {
    return {
      receiptId,
      invoiceAllocations: [],
      confidence,
      reasons,
      warnings,
      recommendedAction: ambiguous ? "REVIEW" : "UNIDENTIFIED",
    };
  }

  const blockedAuto =
    warnings.includes("SHARED_PAYER") ||
    warnings.includes("MULTIPLE_STRONG_CANDIDATES") ||
    warnings.includes("AMOUNT_DIFFERENCE") ||
    warnings.includes("OUT_OF_DATE_RANGE");

  let recommendedAction: RecommendedAction;
  if (confidence >= 95 && !blockedAuto) recommendedAction = "AUTO_RECONCILE_CANDIDATE";
  else if (confidence >= 40) recommendedAction = "REVIEW";
  else recommendedAction = "UNIDENTIFIED";

  return { clientId, receiptId, invoiceAllocations, confidence, reasons, warnings, recommendedAction };
}

/** Importe "cercano" (misma operación probable) pero no exacto: entre tol y 10%. */
function amountIsNear(a: number, b: number, tol: number): boolean {
  const diff = Math.abs(a - b);
  if (diff <= tol) return false;
  const band = Math.max(tol, Math.round(Math.max(a, b) * 0.1));
  return diff <= band;
}
