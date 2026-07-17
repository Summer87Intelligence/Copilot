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
} from "@/lib/bank/intelligence/reconciliation-matching";
import { RECONCILIATION_ENGINE_VERSION } from "@/lib/bank/intelligence/reconciliation-matching";

export { RECONCILIATION_ENGINE_VERSION };

export type ShadowRecommendedAction = RecommendedAction;

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
  invoiceAllocationIds: string[];
  historicalLinkStatuses: string[];
  dateWindowDays: number;
  reasons: ReconciliationReason[];
  warnings: ReconciliationWarning[];
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
  confirmedLinkId: string | null;
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
  | "suggestion_superseded";

export type ShadowWriteTarget = "bank_reconciliation_suggestions" | "reconciliation_events";
