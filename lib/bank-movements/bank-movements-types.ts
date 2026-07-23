/**
 * Tipos del módulo Movimientos bancarios (Sprint A).
 * Espeja el esquema de bank_statement_imports / bank_movements /
 * bank_movement_match_suggestions. Importar movimientos NO modifica caja:
 * la conciliación siempre la confirma el usuario.
 */

export const BANK_IMPORT_STATUSES = ["uploaded", "parsed", "failed", "archived"] as const;
export type BankImportStatus = (typeof BANK_IMPORT_STATUSES)[number];

export const BANK_MOVEMENT_DIRECTIONS = ["inflow", "outflow"] as const;
export type BankMovementDirection = (typeof BANK_MOVEMENT_DIRECTIONS)[number];

export const BANK_MOVEMENT_STATUSES = [
  "pending",
  "suggested",
  "matched",
  "ignored",
  "needs_review",
] as const;
export type BankMovementStatus = (typeof BANK_MOVEMENT_STATUSES)[number];

export const BANK_MOVEMENT_MATCH_TYPES = [
  "zeta_receipt",
  "manual_movement",
  "planned_payment",
  "client",
  "internal",
  "other",
] as const;
export type BankMovementMatchType = (typeof BANK_MOVEMENT_MATCH_TYPES)[number];

export const BANK_MATCH_SUGGESTION_STATUSES = [
  "open",
  "accepted",
  "rejected",
  "expired",
] as const;
export type BankMatchSuggestionStatus = (typeof BANK_MATCH_SUGGESTION_STATUSES)[number];

export const BANK_MOVEMENT_STATUS_LABELS: Record<BankMovementStatus, string> = {
  pending: "Pendiente",
  suggested: "Sugerido",
  matched: "Conciliado",
  ignored: "Ignorado",
  needs_review: "Revisar",
};

export const BANK_MOVEMENT_DIRECTION_LABELS: Record<BankMovementDirection, string> = {
  inflow: "Ingreso",
  outflow: "Egreso",
};

export const BANK_IMPORT_STATUS_LABELS: Record<BankImportStatus, string> = {
  uploaded: "Subido",
  parsed: "Procesado",
  failed: "Falló",
  archived: "Archivado",
};

export type BankStatementImport = {
  id: string;
  workspace_id: string;
  bank_name: string;
  account_label: string | null;
  file_name: string | null;
  file_type: string | null;
  imported_by: string | null;
  imported_at: string;
  status: BankImportStatus;
  row_count: number;
  created_at: string;
  updated_at: string;
};

export type BankMovement = {
  id: string;
  workspace_id: string;
  import_id: string | null;
  bank_name: string;
  account_label: string | null;
  movement_date: string;
  description: string;
  raw_description: string | null;
  normalized_description?: string | null;
  amount: number;
  currency: string;
  direction: BankMovementDirection;
  bank_reference: string | null;
  status: BankMovementStatus;
  matched_type: BankMovementMatchType | null;
  matched_id: string | null;
  matched_confidence: number | null;
  matched_by: string | null;
  matched_at: string | null;
  metadata: Record<string, unknown> | null;
  fingerprint_v1?: string | null;
  fingerprint_version?: number | null;
  duplicate_of?: string | null;
  excluded_from_operations?: boolean | null;
  created_at: string;
  updated_at: string;
};

export type BankMovementMatchSuggestion = {
  id: string;
  workspace_id: string;
  bank_movement_id: string;
  candidate_type: BankMovementMatchType;
  candidate_id: string | null;
  confidence: number;
  reason: string | null;
  amount_delta: number | null;
  date_delta_days: number | null;
  status: BankMatchSuggestionStatus;
  created_at: string;
  updated_at: string;
};

export function isValidBankMovementStatus(v: unknown): v is BankMovementStatus {
  return typeof v === "string" && (BANK_MOVEMENT_STATUSES as readonly string[]).includes(v);
}

export function isValidBankMovementDirection(v: unknown): v is BankMovementDirection {
  return typeof v === "string" && (BANK_MOVEMENT_DIRECTIONS as readonly string[]).includes(v);
}
