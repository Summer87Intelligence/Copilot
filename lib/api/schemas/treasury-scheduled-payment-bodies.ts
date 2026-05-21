import { z } from "zod";

import { PLANNED_OBLIGATION_RECURRENCE } from "@/lib/treasury/treasury-types";
const rejectWorkspaceId = z.never().optional();
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD).");
const positiveAmount = z.number().finite().positive("Monto debe ser > 0.");
const currencyCode = z.enum(["UYU", "USD"]);
const category = z.enum([
  "DGI",
  "BPS",
  "Sueldos",
  "Proveedores",
  "Alquiler",
  "Préstamos",
  "Servicios",
  "Otros",
]);

export const scheduledPaymentCreateBodySchema = z
  .object({
    workspace_id: rejectWorkspaceId,
    name: z.string().trim().min(1),
    category,
    currency: currencyCode,
    amount: positiveAmount,
    due_date: ymd,
    recurrence: z.enum(PLANNED_OBLIGATION_RECURRENCE).optional(),
    notes: z.string().nullable().optional(),
  })
  .strict();

export const scheduledPaymentUpdateBodySchema = z
  .object({
    workspace_id: rejectWorkspaceId,
    name: z.string().trim().min(1).optional(),
    category: category.optional(),
    currency: currencyCode.optional(),
    amount: positiveAmount.optional(),
    due_date: ymd.optional(),
    recurrence: z.enum(PLANNED_OBLIGATION_RECURRENCE).optional(),
    notes: z.string().nullable().optional(),
    status: z.enum(["scheduled", "paid", "cancelled"]).optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).some((k) => k !== "workspace_id"), {
    message: "Enviá al menos un campo para actualizar.",
  });

export const scheduledPaymentCancelBodySchema = z
  .object({
    workspace_id: rejectWorkspaceId,
    notes: z.string().nullable().optional(),
  })
  .strict();

export const scheduledPaymentMarkPaidBodySchema = z
  .object({
    workspace_id: rejectWorkspaceId,
    amount_final: positiveAmount.optional(),
    register_cash_movement: z.boolean().optional(),
  })
  .strict();

export type ScheduledPaymentCreateBody = z.infer<typeof scheduledPaymentCreateBodySchema>;
export type ScheduledPaymentUpdateBody = z.infer<typeof scheduledPaymentUpdateBodySchema>;
export type ScheduledPaymentCancelBody = z.infer<typeof scheduledPaymentCancelBodySchema>;
export type ScheduledPaymentMarkPaidBody = z.infer<typeof scheduledPaymentMarkPaidBodySchema>;
