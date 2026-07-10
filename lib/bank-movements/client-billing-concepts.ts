/**
 * Conceptos habituales de cobro (client_billing_concepts): tipos, Zod y builders.
 */
import { z } from "zod";

export const BILLING_TYPES = ["recurring", "one_time", "installment", "variable"] as const;
export type BillingType = (typeof BILLING_TYPES)[number];

export const BILLING_TYPE_LABELS: Record<BillingType, string> = {
  recurring: "Mensual / recurrente",
  one_time: "Único",
  installment: "Cuotas",
  variable: "Variable",
};

export const BILLING_FREQUENCIES = ["monthly", "weekly", "yearly", "none"] as const;
export type BillingFrequency = (typeof BILLING_FREQUENCIES)[number];

export type ClientBillingConcept = {
  id: string;
  workspace_id: string;
  client_id: string;
  label: string;
  currency: "UYU" | "USD";
  expected_amount: number | null;
  billing_type: BillingType;
  frequency: BillingFrequency | null;
  expected_day: number | null;
  active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

const currency = z.enum(["UYU", "USD"]);

export const clientBillingConceptCreateSchema = z
  .object({
    label: z.string().trim().min(2, "Mínimo 2 caracteres.").max(120),
    currency,
    expected_amount: z.union([z.number().finite().nonnegative(), z.null()]).optional(),
    billing_type: z.enum(BILLING_TYPES).optional(),
    frequency: z.union([z.enum(BILLING_FREQUENCIES), z.null()]).optional(),
    expected_day: z.union([z.number().int().min(1).max(31), z.null()]).optional(),
    active: z.boolean().optional(),
    notes: z.union([z.string().trim().max(500), z.null()]).optional(),
  })
  .strict();

export const clientBillingConceptUpdateSchema = z
  .object({
    label: z.string().trim().min(2).max(120).optional(),
    currency: currency.optional(),
    expected_amount: z.union([z.number().finite().nonnegative(), z.null()]).optional(),
    billing_type: z.enum(BILLING_TYPES).optional(),
    frequency: z.union([z.enum(BILLING_FREQUENCIES), z.null()]).optional(),
    expected_day: z.union([z.number().int().min(1).max(31), z.null()]).optional(),
    active: z.boolean().optional(),
    notes: z.union([z.string().trim().max(500), z.null()]).optional(),
    archived: z.boolean().optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, { message: "Nada para actualizar." });

export type ClientBillingConceptCreateBody = z.infer<typeof clientBillingConceptCreateSchema>;
export type ClientBillingConceptUpdateBody = z.infer<typeof clientBillingConceptUpdateSchema>;

export function buildClientBillingConceptInsert(
  body: ClientBillingConceptCreateBody,
  ctx: { workspaceId: string; clientId: string; userId: string | null }
): Record<string, unknown> {
  return {
    workspace_id: ctx.workspaceId,
    client_id: ctx.clientId,
    label: body.label.trim(),
    currency: body.currency,
    expected_amount: body.expected_amount ?? null,
    billing_type: body.billing_type ?? "recurring",
    frequency: body.frequency ?? null,
    expected_day: body.expected_day ?? null,
    active: body.active ?? true,
    notes: body.notes?.trim() || null,
    created_by: ctx.userId,
  };
}

export function buildClientBillingConceptPatch(
  body: ClientBillingConceptUpdateBody,
  opts: { now?: Date } = {}
): Record<string, unknown> {
  const now = (opts.now ?? new Date()).toISOString();
  const patch: Record<string, unknown> = { updated_at: now };
  if (body.label !== undefined) patch.label = body.label.trim();
  if (body.currency !== undefined) patch.currency = body.currency;
  if ("expected_amount" in body) patch.expected_amount = body.expected_amount ?? null;
  if (body.billing_type !== undefined) patch.billing_type = body.billing_type;
  if ("frequency" in body) patch.frequency = body.frequency ?? null;
  if ("expected_day" in body) patch.expected_day = body.expected_day ?? null;
  if (body.active !== undefined) patch.active = body.active;
  if ("notes" in body) patch.notes = body.notes?.trim() || null;
  if (body.archived !== undefined) patch.archived_at = body.archived ? now : null;
  return patch;
}
