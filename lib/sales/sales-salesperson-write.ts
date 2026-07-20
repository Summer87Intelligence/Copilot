/**
 * FASE 9B — Esquemas Zod + builders para comerciales y asignaciones.
 */

import { z } from "zod";

export const salespersonCreateSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  appUserId: z.string().uuid().nullable().optional(),
  active: z.boolean().optional(),
});
export type SalespersonCreateInput = z.infer<typeof salespersonCreateSchema>;

export const salespersonUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  active: z.boolean().optional(),
});
export type SalespersonUpdateInput = z.infer<typeof salespersonUpdateSchema>;

export const assignmentSchema = z.object({
  documentId: z.string().uuid(),
  /** null = des-asignar (Sin asignar). */
  salespersonId: z.string().uuid().nullable(),
});
export type AssignmentInput = z.infer<typeof assignmentSchema>;

export function buildSalespersonInsert(input: SalespersonCreateInput, workspaceId: string, userId: string | null) {
  return {
    workspace_id: workspaceId,
    display_name: input.displayName,
    app_user_id: input.appUserId ?? null,
    active: input.active ?? true,
    created_by: userId,
  };
}

export function buildSalespersonUpdate(input: SalespersonUpdateInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.displayName !== undefined) patch.display_name = input.displayName;
  if (input.active !== undefined) patch.active = input.active;
  return patch;
}

export function buildAssignmentUpsert(input: AssignmentInput, workspaceId: string, userId: string | null) {
  return {
    workspace_id: workspaceId,
    document_id: input.documentId,
    salesperson_id: input.salespersonId,
    assigned_by: userId,
    assigned_at: new Date().toISOString(),
  };
}

/**
 * FASE SALES-DOCUMENT-SELLER-CORRECTION-001 — asignación de VENDEDOR por
 * documento (manual, distinto del ejecutivo del cliente).
 */
export const documentSellerSchema = z.object({
  /** null = "Sin asignar" → el documento queda "Sin vendedor identificado". */
  sellerId: z.string().uuid().nullable(),
});
export type DocumentSellerInput = z.infer<typeof documentSellerSchema>;

/** FASE 9D — asignación comercial por cliente (historial temporal). */
export const clientAssignmentSchema = z.object({
  customerId: z.string().uuid(),
  /** null = Sin asignar (cierra la vigencia abierta). */
  salespersonId: z.string().uuid().nullable(),
  /** Inicio de vigencia (YYYY-MM-DD). Default = hoy o SALESPERSON_START_DATE. */
  validFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type ClientAssignmentInput = z.infer<typeof clientAssignmentSchema>;
