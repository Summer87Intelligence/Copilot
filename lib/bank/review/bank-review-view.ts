/**
 * FASE BANK-HISTORICAL-REVIEW-UI-001 — capa de presentación PURA (sin DB, sin React).
 *
 * Construye el view-model de revisión bancaria a partir de datos ya cargados y
 * aplica filtros/búsqueda. No consulta la base, no depende de `warnings` JSON para
 * el ÁMBITO (el scope viene estructurado) ni de `movement_date` para clasificar scope.
 */

import type { SuggestionScope } from "@/lib/bank/intelligence/server/types";

export type BankReviewTab = "operational" | "historical" | "matched";

export const BANK_REVIEW_SCOPE_LABELS: Record<SuggestionScope, string> = {
  operational: "Operational",
  historical_review: "Historical Review",
  matched_audit: "Matched Audit",
};

export function scopeForTab(tab: BankReviewTab): SuggestionScope {
  if (tab === "historical") return "historical_review";
  if (tab === "matched") return "matched_audit";
  return "operational";
}

// ── Entradas (datos ya cargados, primitivos) ─────────────────────────────────

export type BankReviewSuggestionInput = {
  id: string;
  bankMovementId: string;
  suggestionScope: SuggestionScope;
  status: string;
  recommendedAction: string;
  confidence: number;
  proposedReceiptId: string | null;
  proposedClientId: string | null;
  reasons: string[];
  warnings: string[];
  engineVersion: number;
  reviewedAt: string | null;
  rejectedReason: string | null;
};

/** Estado de revisión derivado (Modelo A): rejected > reviewed > pending. */
export type BankReviewState = "pending" | "reviewed" | "rejected";

export function deriveReviewState(status: string, reviewedAt: string | null): BankReviewState {
  if (status === "rejected") return "rejected";
  if (reviewedAt) return "reviewed";
  return "pending";
}

export type BankReviewMovementInput = {
  movementDate: string;
  amount: number;
  currency: string;
  description: string | null;
  direction: string;
  status: string;
  bankReference: string | null;
  movementFingerprint: string;
  payerFingerprint: string;
};

export type BankReviewReceiptInput = {
  receiptDate: string;
  amount: number;
  currencyCode: string;
} | null;

export type BankReviewClientInput = { name: string | null } | null;

// ── View-model ───────────────────────────────────────────────────────────────

export type BankReviewEvidence = {
  exactAmount: boolean;
  dateProximityDays: number | null;
  receiptDateDominance: boolean;
  multipleCandidates: boolean;
  historicalAudit: boolean;
  auditOnly: boolean;
  suggestedAction: string;
};

export type BankReviewRow = {
  id: string;
  suggestionScope: SuggestionScope;
  status: string;
  recommendedAction: string;
  confidence: number;
  reasons: string[];
  warnings: string[];
  engineVersion: number;
  reviewState: BankReviewState;
  reviewedAt: string | null;
  rejectedReason: string | null;
  bankMovementId: string;
  movementIdShort: string;
  proposedReceiptId: string | null;
  receiptIdShort: string | null;
  proposedClientId: string | null;
  clientIdShort: string | null;
  clientName: string | null;
  movement: {
    date: string;
    amount: number;
    currency: string;
    descriptionMasked: string;
    direction: string;
    bankReferenceMasked: string | null;
    fingerprintShort: string;
    payerFingerprintShort: string;
  };
  receipt: { date: string; amount: number; currencyCode: string } | null;
  evidence: BankReviewEvidence;
  flags: { hasReceipt: boolean; isTie: boolean; isSinEvidencia: boolean };
};

// ── Helpers puros ────────────────────────────────────────────────────────────

export function shortId(id: string | null | undefined): string | null {
  if (!id) return null;
  return String(id).slice(0, 8);
}

/** Enmascara una descripción: colapsa espacios y deja extremos visibles. */
export function maskDescription(value: string | null | undefined): string {
  const clean = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "—";
  if (clean.length <= 14) return clean;
  return `${clean.slice(0, 6)}…${clean.slice(-6)}`;
}

/** Enmascara una referencia bancaria dejando visibles los últimos 4. */
export function maskReference(value: string | null | undefined): string | null {
  const clean = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  if (clean.length <= 4) return `••${clean}`;
  return `••••${clean.slice(-4)}`;
}

function ymd(value: string): string {
  return String(value ?? "").slice(0, 10);
}

/** Diferencia absoluta en días entre dos fechas YYYY-MM-DD. null si inválidas. */
export function daysBetween(a: string, b: string): number | null {
  const da = ymd(a);
  const db = ymd(b);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(da) || !/^\d{4}-\d{2}-\d{2}$/.test(db)) return null;
  const ms = Date.parse(`${da}T00:00:00Z`) - Date.parse(`${db}T00:00:00Z`);
  return Math.abs(Math.round(ms / 86_400_000));
}

export function buildBankReviewRow(input: {
  suggestion: BankReviewSuggestionInput;
  movement: BankReviewMovementInput;
  receipt: BankReviewReceiptInput;
  client: BankReviewClientInput;
}): BankReviewRow {
  const { suggestion: s, movement: m, receipt: r, client } = input;
  const reasons = s.reasons ?? [];
  const warnings = s.warnings ?? [];
  const isHistorical = s.suggestionScope === "historical_review";
  const auditOnly = s.suggestionScope !== "operational";
  const historicalAudit = isHistorical || warnings.includes("HISTORICAL_SHADOW_AUDIT");
  const hasReceipt = s.proposedReceiptId != null;

  return {
    id: s.id,
    suggestionScope: s.suggestionScope,
    status: s.status,
    recommendedAction: s.recommendedAction,
    confidence: s.confidence,
    reasons,
    warnings,
    engineVersion: s.engineVersion,
    reviewState: deriveReviewState(s.status, s.reviewedAt),
    reviewedAt: s.reviewedAt,
    rejectedReason: s.rejectedReason,
    bankMovementId: s.bankMovementId,
    movementIdShort: shortId(s.bankMovementId)!,
    proposedReceiptId: s.proposedReceiptId,
    receiptIdShort: shortId(s.proposedReceiptId),
    proposedClientId: s.proposedClientId,
    clientIdShort: shortId(s.proposedClientId),
    clientName: client?.name ?? null,
    movement: {
      date: ymd(m.movementDate),
      amount: m.amount,
      currency: m.currency,
      descriptionMasked: maskDescription(m.description),
      direction: m.direction,
      bankReferenceMasked: maskReference(m.bankReference),
      fingerprintShort: String(m.movementFingerprint ?? "").slice(0, 12),
      payerFingerprintShort: String(m.payerFingerprint ?? "").slice(0, 12),
    },
    receipt: r ? { date: ymd(r.receiptDate), amount: r.amount, currencyCode: r.currencyCode } : null,
    evidence: {
      exactAmount: reasons.includes("EXACT_AMOUNT"),
      dateProximityDays: r ? daysBetween(m.movementDate, r.receiptDate) : null,
      receiptDateDominance: reasons.includes("RECEIPT_DATE_DOMINANCE"),
      multipleCandidates: reasons.includes("MULTIPLE_CANDIDATES"),
      historicalAudit,
      auditOnly,
      suggestedAction: s.recommendedAction === "REVIEW" ? "Review" : s.recommendedAction,
    },
    flags: {
      hasReceipt,
      isTie: s.recommendedAction === "REVIEW" && !hasReceipt,
      isSinEvidencia: s.recommendedAction === "UNIDENTIFIED",
    },
  };
}

// ── Filtros / búsqueda (puro, client-side sobre la página del tab) ────────────

export type BankReviewFilters = {
  status?: string; // 'all' | status
  review?: string; // 'all' | 'pending' | 'reviewed' | 'rejected' (derivado de status + reviewed_at)
  currency?: string; // 'all' | 'UYU' | 'USD'
  confidence?: string; // 'all' | 'high' | 'mid' | 'low'
  evidence?: string; // 'all' | 'has_receipt' | 'no_receipt' | 'tie' | 'sin_evidencia'
  client?: string; // substring del nombre de cliente
  q?: string; // búsqueda global
};

export const BANK_REVIEW_FILTER_DEFAULTS: Required<Omit<BankReviewFilters, "client" | "q">> & {
  client: string;
  q: string;
} = {
  status: "all",
  review: "all",
  currency: "all",
  confidence: "all",
  evidence: "all",
  client: "",
  q: "",
};

function confidenceBucket(confidence: number): "high" | "mid" | "low" {
  if (confidence >= 50) return "high";
  if (confidence >= 25) return "mid";
  return "low";
}

function matchesQuery(row: BankReviewRow, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [
    row.bankMovementId,
    row.movementIdShort,
    row.proposedReceiptId ?? "",
    row.receiptIdShort ?? "",
    row.clientName ?? "",
    row.proposedClientId ?? "",
    row.movement.fingerprintShort,
    row.movement.payerFingerprintShort,
    String(row.movement.amount),
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}

/** Aplica filtros + búsqueda de forma pura y determinística. */
export function applyBankReviewFilters(
  rows: readonly BankReviewRow[],
  filters: BankReviewFilters
): BankReviewRow[] {
  const status = filters.status ?? "all";
  const review = filters.review ?? "all";
  const currency = filters.currency ?? "all";
  const confidence = filters.confidence ?? "all";
  const evidence = filters.evidence ?? "all";
  const client = (filters.client ?? "").trim().toLowerCase();
  const q = filters.q ?? "";

  return rows.filter((row) => {
    if (status !== "all" && row.status !== status) return false;
    if (review !== "all" && row.reviewState !== review) return false;
    if (currency !== "all" && row.movement.currency !== currency) return false;
    if (confidence !== "all" && confidenceBucket(row.confidence) !== confidence) return false;
    if (evidence === "has_receipt" && !row.flags.hasReceipt) return false;
    if (evidence === "no_receipt" && row.flags.hasReceipt) return false;
    if (evidence === "tie" && !row.flags.isTie) return false;
    if (evidence === "sin_evidencia" && !row.flags.isSinEvidencia) return false;
    if (client && !(row.clientName ?? "").toLowerCase().includes(client)) return false;
    if (!matchesQuery(row, q)) return false;
    return true;
  });
}

/** Busca una fila por id (apertura del drawer). Puro. */
export function findBankReviewRow(
  rows: readonly BankReviewRow[],
  id: string | null
): BankReviewRow | null {
  if (!id) return null;
  return rows.find((r) => r.id === id) ?? null;
}
