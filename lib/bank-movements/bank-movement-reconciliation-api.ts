/**
 * Contratos API de conciliación bancaria (Sprint F).
 */
import { z } from "zod";

const rejectWorkspaceId = z.never().optional();

export const bankMovementReconcileBodySchema = z
  .object({
    workspace_id: rejectWorkspaceId,
    target_type: z.literal("planned_cash_obligation"),
    target_id: z.string().uuid(),
    confidence: z.enum(["high", "medium", "low"]),
    score: z.number().finite().min(35).max(200),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export const bankMovementIgnoreBodySchema = z
  .object({
    workspace_id: rejectWorkspaceId,
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export type BankMovementReconcileBody = z.infer<typeof bankMovementReconcileBodySchema>;
export type BankMovementIgnoreBody = z.infer<typeof bankMovementIgnoreBodySchema>;

export const bankMovementHideBodySchema = z
  .object({
    workspace_id: rejectWorkspaceId,
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export type BankMovementHideBody = z.infer<typeof bankMovementHideBodySchema>;

export const bankMovementRestoreBodySchema = z
  .object({
    workspace_id: rejectWorkspaceId,
  })
  .strict();

export type BankMovementRestoreBody = z.infer<typeof bankMovementRestoreBodySchema>;

/**
 * FASE E — Alta de relación de conciliación N:M auditable.
 * `applied_amount` es opcional: para `ignored` no aplica importe; para el resto
 * la validación de dominio exige > 0 (devuelve INVALID_AMOUNT → 400).
 * Nunca acepta `workspace_id` del cliente.
 */
export const bankReconciliationLinkCreateBodySchema = z
  .object({
    workspace_id: rejectWorkspaceId,
    target_type: z.enum([
      "receipt",
      "planned_cash_obligation",
      "treasury_income",
      "treasury_expense",
      "bank_movement",
      "manual",
      "ignored",
    ]),
    target_id: z.string().trim().min(1).max(160).nullable().optional(),
    applied_amount: z.number().finite().optional(),
    // Moneda/dirección de la operación destino (las conoce quien concilia): permiten
    // que el servidor rechace cruces con 422 en lugar de asumir las del movimiento.
    target_currency: z.enum(["UYU", "USD"]).optional(),
    target_direction: z.enum(["inflow", "outflow"]).optional(),
    method: z.enum(["manual", "suggested_confirmed"]).optional(),
    confidence: z.enum(["high", "medium", "low"]).nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

export type BankReconciliationLinkCreateBody = z.infer<typeof bankReconciliationLinkCreateBodySchema>;

export type ReconciliationListFilters = {
  confidence?: "high" | "medium" | "low" | "none" | "all";
  currency?: "UYU" | "USD";
  status?: "pending" | "matched" | "ignored" | "all";
  /**
   * Incluir movimientos históricos (< BANK_OPERATIONAL_START_DATE) en el set
   * operativo. Por defecto false: los históricos NO alimentan tareas ni alertas.
   */
  includeHistorical?: boolean;
};

export function parseReconciliationListFilters(searchParams: URLSearchParams): ReconciliationListFilters {
  const confidence = searchParams.get("confidence");
  const currency = searchParams.get("currency");
  const status = searchParams.get("status");
  const scope = searchParams.get("scope");
  const includeHistorical =
    scope === "all" ||
    scope === "historical" ||
    searchParams.get("include_historical") === "1";

  return {
    confidence:
      confidence === "high" ||
      confidence === "medium" ||
      confidence === "low" ||
      confidence === "none" ||
      confidence === "all"
        ? confidence
        : "all",
    currency: currency === "UYU" || currency === "USD" ? currency : undefined,
    status:
      status === "pending" || status === "matched" || status === "ignored" || status === "all"
        ? status
        : "pending",
    includeHistorical,
  };
}
