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

export type ReconciliationListFilters = {
  confidence?: "high" | "medium" | "low" | "none" | "all";
  currency?: "UYU" | "USD";
  status?: "pending" | "matched" | "ignored" | "all";
};

export function parseReconciliationListFilters(searchParams: URLSearchParams): ReconciliationListFilters {
  const confidence = searchParams.get("confidence");
  const currency = searchParams.get("currency");
  const status = searchParams.get("status");

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
  };
}
