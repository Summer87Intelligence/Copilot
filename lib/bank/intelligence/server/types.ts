/**
 * FASE BANK-SHADOW-SERVER-IMPLEMENTATION-001 — Contratos de la capa shadow.
 *
 * Propuestas explicables del motor; NUNCA ejecutan conciliación financiera.
 * AUTO_RECONCILE_CANDIDATE es solo una recomendación shadow.
 */

import type {
  RecommendedAction,
  ReconciliationReason,
  ReconciliationWarning,
  TiedReceiptCandidate,
} from "@/lib/bank/intelligence/reconciliation-matching";
import { RECONCILIATION_ENGINE_VERSION } from "@/lib/bank/intelligence/reconciliation-matching";

export { RECONCILIATION_ENGINE_VERSION };
export type { TiedReceiptCandidate };

export type ShadowRecommendedAction = RecommendedAction;

/**
 * Ámbito canónico de una sugerencia (columna `suggestion_scope`). Estructurado, no JSON.
 * - operational: flujo post-corte normal.
 * - historical_review: movimiento `[2026-01-01, 2026-07-01)`, audit-only, nunca AUTO,
 *   sin trabajo operativo (tarea/alerta/notificación/conciliación).
 * - matched_audit: movimiento `matched` analizado explícito (reservado; contrato futuro).
 */
export const SHADOW_SUGGESTION_SCOPES = [
  "operational",
  "historical_review",
  "matched_audit",
] as const;
export type SuggestionScope = (typeof SHADOW_SUGGESTION_SCOPES)[number];

export const SHADOW_ACTIVE_STATUSES = ["generated", "pending_review"] as const;
export type ShadowActiveStatus = (typeof SHADOW_ACTIVE_STATUSES)[number];

export const SHADOW_TERMINAL_STATUSES = [
  "confirmed",
  "rejected",
  "superseded",
  "expired",
  "reversed",
] as const;
export type ShadowTerminalStatus = (typeof SHADOW_TERMINAL_STATUSES)[number];

export type ShadowSuggestionStatus = ShadowActiveStatus | ShadowTerminalStatus;

/** Límite por defecto / máximo del runner (no escanea los 951). */
export const SHADOW_DEFAULT_LIMIT = 10;
export const SHADOW_MAX_LIMIT = 25;

/** Umbral de cambio de confianza para considerar cambio sustancial. */
export const SHADOW_SUBSTANTIAL_CONFIDENCE_DELTA = 5;

/** Evidencia insuficiente: no persistir. */
export const SHADOW_MIN_PERSIST_CONFIDENCE = 40;

export type ShadowCandidateEvidence = {
  payerFingerprintStrength: string;
  matchedClientIds: string[];
  matchedReceiptIds: string[];
  /** Recibos empatados en el tier máximo (evidencia completa). */
  tiedCandidates: TiedReceiptCandidate[];
  invoiceAllocationIds: string[];
  historicalLinkStatuses: string[];
  dateWindowDays: number;
  reasons: ReconciliationReason[];
  warnings: ReconciliationWarning[];
  ambiguityReason: string | null;
  collisionDetected: boolean;
};

export type ShadowProposal = {
  workspaceId: string;
  bankMovementId: string;
  payerIdentityId: string | null;
  proposedClientId: string | null;
  proposedReceiptId: string | null;
  confidence: number;
  reasons: ReconciliationReason[];
  warnings: ReconciliationWarning[];
  recommendedAction: ShadowRecommendedAction;
  engineVersion: number;
  movementFingerprint: string;
  payerFingerprint: string;
  candidateEvidence: ShadowCandidateEvidence;
  generatedAt: string;
  /** Aplicaciones a factura propuestas (solo evidencia; no se escriben en payment_allocations). */
  proposedInvoiceAllocations: Array<{ invoiceId: string; amountMinor: number }>;
  tiedCandidates: TiedReceiptCandidate[];
  ambiguityReason: string | null;
  collisionDetected: boolean;
  /**
   * true ⇒ propuesta audit-only (movimiento `matched` o histórico). NUNCA se persiste,
   * nunca AUTO. Default (ausente) = false.
   */
  auditOnly?: boolean;
  /**
   * true ⇒ movimiento histórico (`< 2026-07-01`) analizado en modo audit. Implica
   * `auditOnly=true`, warning HISTORICAL_SHADOW_AUDIT y nunca AUTO. Default (ausente) = false.
   */
  historicalAudit?: boolean;
  /**
   * Ámbito con el que se persiste (columna `suggestion_scope`). Default (ausente) = 'operational'.
   * Lo fija el runner: historical-audit → 'historical_review'; matched-audit → 'matched_audit'.
   */
  suggestionScope?: SuggestionScope;
};

export type ShadowSuggestionRow = {
  id: string;
  workspaceId: string;
  bankMovementId: string;
  payerIdentityId: string | null;
  proposedClientId: string | null;
  proposedReceiptId: string | null;
  confidence: number;
  reasons: ReconciliationReason[];
  warnings: ReconciliationWarning[];
  recommendedAction: ShadowRecommendedAction;
  engineVersion: number;
  status: ShadowSuggestionStatus;
  suggestionScope: SuggestionScope;
  confirmedLinkId: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectedReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ShadowRunOptions = {
  workspaceId: string;
  /** Un solo movimiento. */
  movementId?: string;
  /** Lista explícita (prioridad sobre limit de pending). */
  movementIds?: string[];
  /** Límite pequeño explícito (obligatorio si no hay IDs). Máx SHADOW_MAX_LIMIT. */
  limit?: number;
  /** Default true — no escribe. */
  dryRun?: boolean;
  /** Default false — solo escribe si dryRun===false && persist===true. */
  persist?: boolean;
  /** Actor interno opcional (UUID app_users); no se aceptan actores arbitrarios sin validar. */
  actorUserId?: string | null;
  /**
   * Solo server-side. Default false. Incluye movimientos `matched` como audit-only:
   * genera propuesta marcada `auditOnly` (nunca AUTO, warning MATCHED_MOVEMENT_AUDIT)
   * que NUNCA se persiste ni modifica nada. Fuera de esta bandera, `matched` se excluye.
   */
  includeMatchedForAudit?: boolean;
  /**
   * Solo server-side. Default false. Habilita movimientos históricos (`< 2026-07-01`,
   * `>= 2026-01-01`) como historical-audit (dry-run only). **Incompatible con `persist=true`**
   * (falla con HISTORICAL_PERSIST_NOT_ALLOWED) y **exige IDs explícitos** (no escaneo/limit).
   * Marca `historicalAudit=true` + `auditOnly=true`, warning HISTORICAL_SHADOW_AUDIT, nunca AUTO.
   */
  includeHistoricalForShadow?: boolean;
  /**
   * Solo server-side. Default false. Persiste sugerencias HISTÓRICAS con
   * `suggestion_scope='historical_review'`. Requiere `includeHistoricalForShadow=true`,
   * `persist=true` e IDs explícitos. Solo escribe suggestions+events; nunca AUTO,
   * nunca matched, nunca post-corte, nunca selección automática ni cron.
   */
  persistHistoricalForReview?: boolean;
};

export type ShadowPersistStats = {
  created: number;
  updated: number;
  superseded: number;
  skipped: number;
  insufficientEvidence: number;
};

export type ShadowSkippedMovement = {
  movementId: string;
  reason: string;
};

export type ShadowRunResult = {
  mode: "dry-run" | "shadow-persist";
  workspaceId: string;
  engineVersion: number;
  proposals: ShadowProposal[];
  persisted: ShadowPersistStats;
  skippedMovements: ShadowSkippedMovement[];
  writesEnabled: boolean;
};

export type ShadowPersistDecision =
  | { action: "skip"; reason: string }
  | { action: "create" }
  | { action: "update"; existingId: string }
  | { action: "supersede"; existingId: string; previousStatus: ShadowSuggestionStatus };

export type ShadowSuggestionEventType =
  | "suggestion_created"
  | "suggestion_changed"
  | "suggestion_superseded"
  | "suggestion_reviewed"
  | "suggestion_note_added"
  | "suggestion_rejected";

export type ShadowWriteTarget = "bank_reconciliation_suggestions" | "reconciliation_events";
