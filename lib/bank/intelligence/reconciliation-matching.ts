/**
 * FASE DOMAIN-IA-BANK-001 / BANK-SHADOW-CORRECTION-001 — Motor PURO, determinístico
 * y explicable de conciliación.
 *
 * NO usa IA generativa como fuente de verdad. NO toca DB. NO usa float para dinero
 * (minor units = enteros). Devuelve candidatos con razones estructuradas, confianza
 * y una acción recomendada. Diseñado para correr en modo SHADOW (solo propone).
 *
 * Reglas de seguridad (nunca auto-conciliar): moneda distinta, dos candidatos
 * igualmente fuertes, cuenta que paga por varios clientes sin otra señal, diferencia
 * de importe no explicada, posible duplicado, recibo ya conciliado, factura ya
 * pagada, sobre-aplicación, cruce de workspace, fecha fuera de rango, movimiento
 * revertido, ingreso no comercial, empate de recibos exactos o colisión de recibo.
 *
 * BANK-SHADOW-CORRECTION-001: la selección de recibo NUNCA usa `.find()` / orden de
 * array como desempate. Empate → proposedReceiptId null + MULTIPLE_STRONG_CANDIDATES.
 */

export const RECONCILIATION_ENGINE_VERSION = 1;

/** Techo de confianza cuando hay empate de recibos exactos (sin ganador único). */
export const MAX_TIED_RECEIPT_CONFIDENCE = 50;

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
  | "CURRENCY_MISMATCH"
  /** Desempate objetivo: proximidad de fecha estrictamente mejor que el resto. */
  | "RECEIPT_DATE_DOMINANCE"
  /** Borrador manual (sin sugerencia canónica): ver create-manual-draft-suggestion.server.ts. */
  | "MANUAL_DRAFT";

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
  | "UNAPPLIED_BALANCE"
  /** Dos+ propuestas del mismo batch apuntan al mismo recibo. */
  | "RECEIPT_CANDIDATE_COLLISION"
  /** Movimiento ya `matched` incluido solo para auditoría (audit-only, nunca persiste). */
  | "MATCHED_MOVEMENT_AUDIT"
  /** Movimiento histórico (`< 2026-07-01`) analizado en modo audit (dry-run only, nunca persiste). */
  | "HISTORICAL_SHADOW_AUDIT";

export type RecommendedAction =
  | "AUTO_RECONCILE_CANDIDATE"
  | "REVIEW"
  | "UNIDENTIFIED"
  | "REJECT";

/** Candidato de recibo en empate o ranking (evidencia, no selección arbitraria). */
export type TiedReceiptCandidate = {
  receiptId: string;
  clientId: string;
  amountMinor: number;
  currency: ReconCurrency;
  date: string;
  daysFromMovement: number;
  /** 1 = tier más fuerte; empatados comparten el mismo rank. */
  candidateRank: number;
  score: number;
};

export type ReconciliationCandidateResult = {
  clientId?: string;
  receiptId?: string;
  invoiceAllocations: Array<{ invoiceId: string; amountMinor: number }>;
  confidence: number; // 0..100
  reasons: ReconciliationReason[];
  warnings: ReconciliationWarning[];
  recommendedAction: RecommendedAction;
  /** Todos los recibos exactos empatados en el tier máximo (vacío si ganador único o ninguno). */
  tiedReceiptCandidates?: TiedReceiptCandidate[];
  ambiguityReason?: string | null;
  collisionDetected?: boolean;
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

/** Boost material: recibo cuyo cliente tiene pagador confirmado para esta huella. */
const SCORE_CONFIRMED_CLIENT = 10_000_000;
/** Base por importe exacto + moneda (todos los strong exactos la tienen). */
const SCORE_EXACT_BASE = 1_000_000;
/** Penalización por día de distancia (menor distancia = mayor score). */
const SCORE_PER_DAY = 1_000;

export function daysBetween(a: string, b: string): number {
  const da = new Date(`${a.slice(0, 10)}T00:00:00Z`).getTime();
  const db = new Date(`${b.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round(Math.abs(da - db) / 86400000);
}

function reject(reasons: ReconciliationReason[], warnings: ReconciliationWarning[]): ReconciliationCandidateResult {
  return {
    invoiceAllocations: [],
    confidence: 0,
    reasons,
    warnings,
    recommendedAction: "REJECT",
    tiedReceiptCandidates: [],
    ambiguityReason: null,
    collisionDetected: false,
  };
}

function unidentified(warnings: ReconciliationWarning[] = []): ReconciliationCandidateResult {
  return {
    invoiceAllocations: [],
    confidence: 0,
    reasons: [],
    warnings,
    recommendedAction: "UNIDENTIFIED",
    tiedReceiptCandidates: [],
    ambiguityReason: null,
    collisionDetected: false,
  };
}

/**
 * Score objetivo de un recibo exacto. NO usa orden de array ni receiptId.
 *
 * Desempates PERMITIDOS (materiales):
 *  1. Cliente con pagador confirmado para la huella del movimiento.
 *  2. Menor distancia absoluta de fecha al movimiento.
 *
 * Desempates PROHIBIDOS: orden de consulta, inserción, posición en array, receiptId.
 */
export function scoreExactReceiptCandidate(input: {
  receipt: ReceiptCandidate;
  movement: NormalizedBankMovement;
  confirmedClientIds: ReadonlySet<string>;
}): number {
  const { receipt, movement, confirmedClientIds } = input;
  const days = daysBetween(movement.date, receipt.date);
  let score = SCORE_EXACT_BASE - days * SCORE_PER_DAY;
  if (confirmedClientIds.has(receipt.clientId)) {
    score += SCORE_CONFIRMED_CLIENT;
  }
  return score;
}

type ScoredReceipt = {
  receipt: ReceiptCandidate;
  score: number;
  days: number;
};

/**
 * Selección conservadora de recibos exactos activos.
 * - 0 → sin recibo
 * - 1 con score único máximo → ganador + reason de dominio si aplica
 * - 2+ con mismo score máximo → empate (sin receiptId)
 */
export function selectExactReceiptConservatively(input: {
  exactActive: ReceiptCandidate[];
  movement: NormalizedBankMovement;
  confirmedClientIds: ReadonlySet<string>;
}): {
  winner: ReceiptCandidate | null;
  tied: TiedReceiptCandidate[];
  dateDominance: boolean;
  ambiguityReason: string | null;
} {
  const scored: ScoredReceipt[] = input.exactActive.map((receipt) => ({
    receipt,
    score: scoreExactReceiptCandidate({
      receipt,
      movement: input.movement,
      confirmedClientIds: input.confirmedClientIds,
    }),
    days: daysBetween(input.movement.date, receipt.date),
  }));

  if (scored.length === 0) {
    return { winner: null, tied: [], dateDominance: false, ambiguityReason: null };
  }

  const maxScore = Math.max(...scored.map((s) => s.score));
  const top = scored.filter((s) => s.score === maxScore);

  // Evidencia estable: ordenar por receiptId solo para listar (no para elegir).
  const toTied = (rows: ScoredReceipt[], rank: number): TiedReceiptCandidate[] =>
    [...rows]
      .sort((a, b) => a.receipt.receiptId.localeCompare(b.receipt.receiptId))
      .map((s) => ({
        receiptId: s.receipt.receiptId,
        clientId: s.receipt.clientId,
        amountMinor: s.receipt.amountMinor,
        currency: s.receipt.currency,
        date: s.receipt.date,
        daysFromMovement: s.days,
        candidateRank: rank,
        score: s.score,
      }));

  if (top.length === 1) {
    const winner = top[0]!;
    const others = scored.filter((s) => s.receipt.receiptId !== winner.receipt.receiptId);
    // Dominancia por fecha: mismo tier de pagador confirmado y días estrictamente menores.
    const pureDateDominance =
      others.length > 0 &&
      others.every(
        (o) =>
          input.confirmedClientIds.has(o.receipt.clientId) ===
            input.confirmedClientIds.has(winner.receipt.clientId) &&
          o.days > winner.days
      );

    return {
      winner: winner.receipt,
      tied: [],
      dateDominance: pureDateDominance,
      ambiguityReason: null,
    };
  }

  return {
    winner: null,
    tied: toTied(top, 1),
    dateDominance: false,
    ambiguityReason: "MULTIPLE_EXACT_AMOUNT_RECEIPTS",
  };
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

  for (const inv of open) {
    if (Math.abs(inv.outstandingMinor - amountMinor) <= tol) {
      return {
        allocations: [{ invoiceId: inv.invoiceId, amountMinor: Math.min(amountMinor, inv.outstandingMinor) }],
        exact: true,
      };
    }
  }
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
  if (open.length > 0 && amountMinor > 0) {
    const inv = open[0]!;
    return {
      allocations: [{ invoiceId: inv.invoiceId, amountMinor: Math.min(amountMinor, inv.outstandingMinor) }],
      exact: false,
    };
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

  if (movement.isReversed) return unidentified(["REVERSED_MOVEMENT"]);
  if (movement.isNonCommercial || movement.direction !== "inflow") return unidentified(["NON_COMMERCIAL"]);
  if (movement.isProbableDuplicate) return reject([], ["POSSIBLE_DUPLICATE"]);

  const crossWorkspaceHit =
    input.clients.some(
      (c) =>
        c.workspaceId !== wsId &&
        c.normalizedName &&
        c.normalizedName === movement.normalizedPayerName
    ) ||
    input.receipts.some(
      (r) =>
        r.workspaceId !== wsId &&
        r.currency === movement.currency &&
        Math.abs(r.amountMinor - movement.amountMinor) <= tol
    );

  const clients = input.clients.filter((c) => c.workspaceId === wsId);
  const receipts = input.receipts.filter((r) => r.workspaceId === wsId);
  const invoices = input.invoices.filter((i) => i.workspaceId === wsId);
  const links = input.historicalLinks.filter(
    (l) => l.workspaceId === wsId && l.status !== "rejected" && l.status !== "inactive"
  );

  const sameWsSignal =
    clients.length > 0 || receipts.length > 0 || invoices.length > 0 || links.length > 0;
  if (crossWorkspaceHit && !sameWsSignal) {
    return reject([], ["WORKSPACE_MISMATCH"]);
  }

  const reasons: ReconciliationReason[] = [];
  const warnings: ReconciliationWarning[] = [];
  let confidence = 0;
  let exactAmountCounted = false;
  let clientId: string | undefined;
  let ambiguous = false;
  let tiedReceiptCandidates: TiedReceiptCandidate[] = [];
  let ambiguityReason: string | null = null;

  const confirmedLinks = links.filter(
    (l) => l.fingerprintHash === movement.payerFingerprintHash && l.status === "confirmed"
  );
  const learnedLinks = links.filter(
    (l) =>
      l.fingerprintHash === movement.payerFingerprintHash &&
      (l.status === "learned" || l.status === "suggested" || l.status === "detected")
  );
  const distinctConfirmed = [...new Set(confirmedLinks.map((l) => l.clientId))];
  const distinctLearned = [...new Set(learnedLinks.map((l) => l.clientId))];
  const confirmedClientIds = new Set(distinctConfirmed);

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

  // ── Recibos: exactos activos (sin .find() arbitrario) ─────────────────────
  const scopedReceipts = clientId ? receipts.filter((r) => r.clientId === clientId) : receipts;
  const currencyReceipts = scopedReceipts.filter((r) => r.currency === movement.currency);
  const crossCurrencyExact = scopedReceipts.filter(
    (r) => r.currency !== movement.currency && Math.abs(r.amountMinor - movement.amountMinor) <= tol
  );
  if (crossCurrencyExact.length > 0) {
    return reject(["CURRENCY_MISMATCH"], [...warnings, "AMOUNT_DIFFERENCE"]);
  }

  const exactActive = currencyReceipts.filter(
    (r) => !r.alreadyReconciled && Math.abs(r.amountMinor - movement.amountMinor) <= tol
  );
  const exactReconciled = currencyReceipts.filter(
    (r) => r.alreadyReconciled && Math.abs(r.amountMinor - movement.amountMinor) <= tol
  );
  if (exactReconciled.length > 0 && exactActive.length === 0) {
    warnings.push("RECEIPT_ALREADY_RECONCILED");
  }

  const selection = selectExactReceiptConservatively({
    exactActive,
    movement,
    confirmedClientIds,
  });

  let receiptId: string | undefined;
  let hadExactReceiptMatch = false;

  if (selection.tied.length > 0) {
    ambiguous = true;
    tiedReceiptCandidates = selection.tied;
    ambiguityReason = selection.ambiguityReason;
    if (!warnings.includes("MULTIPLE_STRONG_CANDIDATES")) {
      warnings.push("MULTIPLE_STRONG_CANDIDATES");
    }
    if (!reasons.includes("MULTIPLE_CANDIDATES")) reasons.push("MULTIPLE_CANDIDATES");
    if (!exactAmountCounted) {
      confidence += 10;
      reasons.push("EXACT_AMOUNT");
      exactAmountCounted = true;
    }
    // Señal débil de que hay match posible, sin elegir ganador.
    confidence += 15;
    confidence = Math.min(confidence, MAX_TIED_RECEIPT_CONFIDENCE);
    hadExactReceiptMatch = true;
    // No fijar clientId desde un recibo arbitrario del empate.
  } else if (selection.winner) {
    const activeExactReceipt = selection.winner;
    receiptId = activeExactReceipt.receiptId;
    hadExactReceiptMatch = true;
    if (!clientId) clientId = activeExactReceipt.clientId;
    confidence += 35;
    reasons.push("MATCHING_RECEIPT");
    if (!exactAmountCounted) {
      confidence += 10;
      reasons.push("EXACT_AMOUNT");
      exactAmountCounted = true;
    }
    if (daysBetween(movement.date, activeExactReceipt.date) <= dateWindow) {
      confidence += 5;
      reasons.push("DATE_PROXIMITY");
    } else {
      warnings.push("OUT_OF_DATE_RANGE");
    }
    if (selection.dateDominance) {
      reasons.push("RECEIPT_DATE_DOMINANCE");
    }
  }

  // ── Facturas del cliente ──────────────────────────────────────────────────
  let invoiceAllocations: Array<{ invoiceId: string; amountMinor: number }> = [];
  if (clientId) {
    const clientInvoices = invoices.filter((i) => i.clientId === clientId);
    const openInvoices = clientInvoices.filter(
      (i) => i.currency === movement.currency && i.outstandingMinor > 0
    );
    const anyOpen = openInvoices.length > 0;
    const { allocations, exact } = allocateInvoices(movement.amountMinor, openInvoices, tol);
    invoiceAllocations = allocations;
    if (allocations.length > 0) {
      reasons.push("MATCHING_INVOICE");
      if (exact) {
        confidence += 10;
        if (!exactAmountCounted) {
          confidence += 10;
          reasons.push("EXACT_AMOUNT");
          exactAmountCounted = true;
        }
      } else {
        confidence += 5;
        const allocated = allocations.reduce((s, a) => s + a.amountMinor, 0);
        if (allocated < movement.amountMinor - tol) warnings.push("UNAPPLIED_BALANCE");
      }
    } else if (!anyOpen && clientInvoices.some((i) => i.outstandingMinor <= 0)) {
      warnings.push("INVOICE_FULLY_PAID");
    }

    if (!hadExactReceiptMatch && allocations.length === 0) {
      const nearReceipt = currencyReceipts.some(
        (r) => !r.alreadyReconciled && amountIsNear(r.amountMinor, movement.amountMinor, tol)
      );
      const nearInvoice = openInvoices.some((i) =>
        amountIsNear(i.outstandingMinor, movement.amountMinor, tol)
      );
      if (nearReceipt || nearInvoice) warnings.push("AMOUNT_DIFFERENCE");
    }
  }

  const allocated = invoiceAllocations.reduce((s, a) => s + a.amountMinor, 0);
  if (allocated > movement.amountMinor + tol) {
    return reject([], [...warnings, "AMOUNT_DIFFERENCE"]);
  }

  if (
    clientId &&
    !hadExactReceiptMatch &&
    invoiceAllocations.length === 0 &&
    !warnings.includes("AMOUNT_DIFFERENCE")
  ) {
    warnings.push("UNAPPLIED_BALANCE");
  }

  if (tiedReceiptCandidates.length > 0) {
    confidence = Math.min(confidence, MAX_TIED_RECEIPT_CONFIDENCE);
  }
  confidence = clampConfidence(confidence);

  const blockedAuto =
    warnings.includes("SHARED_PAYER") ||
    warnings.includes("MULTIPLE_STRONG_CANDIDATES") ||
    warnings.includes("AMOUNT_DIFFERENCE") ||
    warnings.includes("OUT_OF_DATE_RANGE") ||
    warnings.includes("RECEIPT_CANDIDATE_COLLISION") ||
    tiedReceiptCandidates.length > 0;

  if (!clientId) {
    return {
      receiptId,
      invoiceAllocations: [],
      confidence,
      reasons,
      warnings,
      recommendedAction: ambiguous || hadExactReceiptMatch ? "REVIEW" : "UNIDENTIFIED",
      tiedReceiptCandidates,
      ambiguityReason,
      collisionDetected: false,
    };
  }

  let recommendedAction: RecommendedAction;
  if (confidence >= 95 && !blockedAuto) recommendedAction = "AUTO_RECONCILE_CANDIDATE";
  else if (confidence >= 40 || ambiguous) recommendedAction = "REVIEW";
  else recommendedAction = "UNIDENTIFIED";

  // Empate de recibos nunca es AUTO.
  if (tiedReceiptCandidates.length > 0) {
    recommendedAction = "REVIEW";
  }

  return {
    clientId,
    receiptId,
    invoiceAllocations,
    confidence,
    reasons,
    warnings,
    recommendedAction,
    tiedReceiptCandidates,
    ambiguityReason,
    collisionDetected: false,
  };
}

/** Importe "cercano" (misma operación probable) pero no exacto: entre tol y 10%. */
function amountIsNear(a: number, b: number, tol: number): boolean {
  const diff = Math.abs(a - b);
  if (diff <= tol) return false;
  const band = Math.max(tol, Math.round(Math.max(a, b) * 0.1));
  return diff <= band;
}
