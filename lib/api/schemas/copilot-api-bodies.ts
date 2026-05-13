import { z } from "zod";

import { OUTCOME_TYPES } from "@/lib/ai/outcome-types";

const optionalNullableString = z.union([z.string(), z.null()]).optional();

/** restore / archive de entidades proto_* y documentos. */
export const copilotDataIdBodySchema = z.object({
  id: z.string().trim().min(1),
});

export const copilotOutcomePostBodySchema = z.object({
  action_id: z.string().trim().min(1),
  initiative_id: z.string().trim().min(1),
  outcome_type: z.enum(OUTCOME_TYPES),
  revenue_amount: z.number().finite().nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  after_note: z.string().max(4000).nullable().optional(),
});

/** LOOP-01: actualizar seguimiento en la acción (responsable, esperado, antes). */
export const copilotActionPatchBodySchema = z
  .object({
    assignee_name: z.union([z.string().max(200), z.null()]).optional(),
    expected_result: z.union([z.string().max(4000), z.null()]).optional(),
    before_note: z.union([z.string().max(4000), z.null()]).optional(),
  })
  .refine(
    (o) =>
      o.assignee_name !== undefined ||
      o.expected_result !== undefined ||
      o.before_note !== undefined,
    { message: "Enviá al menos un campo para actualizar." }
  );

export const protoCompanyCreateBodySchema = z.object({
  name: z.string().trim().min(1),
  industry: optionalNullableString,
  city: optionalNullableString,
  status: optionalNullableString,
  risk_level: optionalNullableString,
});

export const protoCompanyUpdateBodySchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().optional(),
  industry: optionalNullableString,
  city: optionalNullableString,
  status: optionalNullableString,
  risk_level: optionalNullableString,
});

/** Import server-side Zeta → proto (no UI interactiva; solo jobs / operador). */
export const zetaSyncSaldosPendientesBodySchema = z.object({
  proto_company_id: z.string().uuid(),
  cliente_codigo: z.string().trim().min(1).max(64),
  mode: z.enum(["bootstrap", "incremental"]),
  max_pages_per_run: z.number().int().min(1).max(50).optional(),
  page_delay_ms: z.number().int().min(0).max(30_000).optional(),
  overlap_seconds: z.number().int().min(0).max(60 * 24 * 3600).optional(),
  idempotency_key: z.string().trim().max(200).optional().nullable(),
});

export const protoInvoiceCreateBodySchema = z.object({
  company_id: z.string().trim().min(1),
  invoice_number: z.string().trim().min(1),
  issue_date: z.string().trim().min(1),
  due_date: z.string().trim().min(1),
  total_amount: z.number().finite(),
  balance_amount: z.number().finite().optional(),
  collection_probability: z.number().finite().nullable().optional(),
  status: z.string().optional(),
  category: optionalNullableString,
  notes: optionalNullableString,
});

export const protoInvoiceUpdateBodySchema = z.object({
  id: z.string().trim().min(1),
  company_id: z.string().trim().min(1).optional(),
  invoice_number: z.string().optional(),
  issue_date: z.string().optional(),
  due_date: z.string().optional(),
  total_amount: z.number().finite().optional(),
  balance_amount: z.number().finite().optional(),
  collection_probability: z.number().finite().nullable().optional(),
  status: z.string().optional(),
  category: optionalNullableString,
  notes: optionalNullableString,
});

export const protoReceiptCreateBodySchema = z.object({
  company_id: z.string().trim().min(1),
  invoice_id: z.union([z.string().trim().min(1), z.null()]),
  receipt_number: z.string().trim().min(1),
  receipt_date: z.string().trim().min(1),
  amount: z.number().finite(),
  payment_method: optionalNullableString,
  status: z.string().optional(),
  reference: optionalNullableString,
  notes: optionalNullableString,
});

export const protoReceiptUpdateBodySchema = z.object({
  id: z.string().trim().min(1),
  company_id: z.string().trim().min(1).optional(),
  invoice_id: z.union([z.string().trim().min(1), z.null()]).optional(),
  receipt_number: z.string().optional(),
  receipt_date: z.string().optional(),
  amount: z.number().finite().optional(),
  payment_method: optionalNullableString,
  status: z.string().optional(),
  reference: optionalNullableString,
  notes: optionalNullableString,
});

export const protoPaymentCreateBodySchema = z.object({
  company_id: z.string().trim().min(1),
  payment_number: z.string().trim().min(1),
  payment_date: z.string().trim().min(1),
  amount: z.number().finite(),
  category: z.string().trim().min(1),
  vendor_name: optionalNullableString,
  status: z.string().optional(),
  reference: optionalNullableString,
  notes: optionalNullableString,
  obligation_id: optionalNullableString,
});

export const protoPaymentUpdateBodySchema = z.object({
  id: z.string().trim().min(1),
  company_id: z.string().trim().min(1).optional(),
  payment_number: z.string().optional(),
  payment_date: z.string().optional(),
  amount: z.number().finite().optional(),
  category: z.string().optional(),
  vendor_name: optionalNullableString,
  status: z.string().optional(),
  reference: optionalNullableString,
  notes: optionalNullableString,
  obligation_id: optionalNullableString,
});

export const protoTaxObligationCreateBodySchema = z.object({
  tax_type: z.string().trim().min(1),
  period_label: z.string().trim().min(1),
  due_date: z.string().trim().min(1),
  estimated_amount: z.number().finite(),
  confirmed_amount: z.number().finite().nullable().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  notes: optionalNullableString,
  confirm_duplicate: z.boolean().optional(),
});

export const protoTaxObligationUpdateBodySchema = z.object({
  id: z.string().trim().min(1),
  tax_type: z.string().optional(),
  period_label: z.string().optional(),
  due_date: z.string().optional(),
  estimated_amount: z.number().finite().optional(),
  confirmed_amount: z.number().finite().nullable().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  notes: optionalNullableString,
  confirm_duplicate: z.boolean().optional(),
});

export const operationalActionCreateBodySchema = z.object({
  origin: z.enum(["alert", "treasury", "finance", "customer", "insight", "manual"]),
  action_type: z.string().trim().min(1).max(120),
  priority: z.enum(["critical", "high", "medium", "low"]).optional(),
  title: z.string().trim().min(1).max(300),
  summary: z.string().max(4000).nullable().optional(),
  related_entity_type: z.string().max(120).nullable().optional(),
  related_entity_id: z.string().max(200).nullable().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  due_at: z.string().datetime().nullable().optional(),
  assigned_to: z.string().max(200).nullable().optional(),
  owner_id: z.string().max(200).nullable().optional(),
});

export const operationalActionFromAlertBodySchema = z.object({
  alert_id: z.string().trim().min(1),
  title: z.string().trim().min(1).max(300),
  summary: z.string().max(4000),
  priority: z.enum(["critical", "high", "medium"]),
  alert_type: z.enum(["fiscalidad", "liquidez", "cobertura", "conciliacion"]),
  obligation_id: z.string().nullable().optional(),
  detail: z.string().max(8000).optional(),
});

export const operationalActionPatchBodySchema = z
  .object({
    operational_status: z
      .enum(["pending", "in_progress", "blocked", "resolved", "dismissed"])
      .optional(),
    assigned_to: z.union([z.string().max(200), z.null()]).optional(),
    owner_id: z.union([z.string().max(200), z.null()]).optional(),
    due_at: z.union([z.string().datetime(), z.null()]).optional(),
    resolution_notes: z.union([z.string().max(4000), z.null()]).optional(),
    summary: z.union([z.string().max(4000), z.null()]).optional(),
  })
  .refine(
    (body) =>
      body.operational_status !== undefined ||
      body.assigned_to !== undefined ||
      body.owner_id !== undefined ||
      body.due_at !== undefined ||
      body.resolution_notes !== undefined ||
      body.summary !== undefined,
    { message: "Enviá al menos un campo para actualizar." }
  );
