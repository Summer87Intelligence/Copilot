/**
 * Contratos de escritura del módulo Movimientos bancarios (Sprint B).
 * Schemas Zod + builders puros para insert/patch. El workspace_id nunca viene
 * del cliente (rejectWorkspaceId); lo fija el servidor desde la sesión.
 */
import { z } from "zod";

import {
  BANK_MOVEMENT_DIRECTIONS,
  BANK_MOVEMENT_MATCH_TYPES,
  BANK_MOVEMENT_STATUSES,
} from "@/lib/bank-movements/bank-movements-types";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD).");
const positiveAmount = z.number().finite().positive("El monto debe ser mayor a 0.");
const currency = z.enum(["UYU", "USD"]);
const optionalNullableString = z.union([z.string(), z.null()]).optional();
const optionalNullableUuid = z.union([z.string().uuid(), z.null()]).optional();
const optionalMetadata = z.record(z.string(), z.unknown()).nullable().optional();
const rejectWorkspaceId = z.never().optional();

export const bankMovementCreateBodySchema = z
  .object({
    workspace_id: rejectWorkspaceId,
    import_id: optionalNullableUuid,
    bank_name: z.string().trim().min(1).max(120).optional(),
    account_label: optionalNullableString,
    movement_date: ymd,
    description: z.string().trim().min(1).max(500),
    raw_description: optionalNullableString,
    amount: positiveAmount,
    currency,
    direction: z.enum(BANK_MOVEMENT_DIRECTIONS),
    bank_reference: optionalNullableString,
    status: z.enum(BANK_MOVEMENT_STATUSES).optional(),
    metadata: optionalMetadata,
  })
  .strict();

export const bankMovementUpdateBodySchema = z
  .object({
    workspace_id: rejectWorkspaceId,
    account_label: optionalNullableString,
    movement_date: ymd.optional(),
    description: z.string().trim().min(1).max(500).optional(),
    raw_description: optionalNullableString,
    amount: positiveAmount.optional(),
    currency: currency.optional(),
    direction: z.enum(BANK_MOVEMENT_DIRECTIONS).optional(),
    bank_reference: optionalNullableString,
    status: z.enum(BANK_MOVEMENT_STATUSES).optional(),
    matched_type: z.union([z.enum(BANK_MOVEMENT_MATCH_TYPES), z.null()]).optional(),
    matched_id: optionalNullableUuid,
    metadata: optionalMetadata,
  })
  .strict()
  .refine((o) => Object.keys(o).some((k) => k !== "workspace_id"), {
    message: "Enviá al menos un campo para actualizar.",
  });

export type BankMovementCreateBody = z.infer<typeof bankMovementCreateBodySchema>;
export type BankMovementUpdateBody = z.infer<typeof bankMovementUpdateBodySchema>;

/** Fila lista para insertar. workspace_id lo impone el servidor, nunca el cliente. */
export function buildBankMovementInsert(
  body: BankMovementCreateBody,
  workspaceId: string
): Record<string, unknown> {
  return {
    workspace_id: workspaceId,
    import_id: body.import_id ?? null,
    bank_name: body.bank_name?.trim() || "Santander",
    account_label: body.account_label ?? null,
    movement_date: body.movement_date,
    description: body.description.trim(),
    raw_description: body.raw_description ?? null,
    amount: body.amount,
    currency: body.currency,
    direction: body.direction,
    bank_reference: body.bank_reference ?? null,
    status: body.status ?? "pending",
    metadata: body.metadata ?? {},
  };
}

/** Patch parcial. Al pasar a 'matched' sella auditoría (matched_at/matched_by). */
export function buildBankMovementPatch(
  body: BankMovementUpdateBody,
  opts: { userId: string; now?: Date }
): Record<string, unknown> {
  const now = (opts.now ?? new Date()).toISOString();
  const patch: Record<string, unknown> = { updated_at: now };

  if ("account_label" in body) patch.account_label = body.account_label ?? null;
  if (body.movement_date !== undefined) patch.movement_date = body.movement_date;
  if (body.description !== undefined) patch.description = body.description.trim();
  if ("raw_description" in body) patch.raw_description = body.raw_description ?? null;
  if (body.amount !== undefined) patch.amount = body.amount;
  if (body.currency !== undefined) patch.currency = body.currency;
  if (body.direction !== undefined) patch.direction = body.direction;
  if ("bank_reference" in body) patch.bank_reference = body.bank_reference ?? null;
  if ("matched_type" in body) patch.matched_type = body.matched_type ?? null;
  if ("matched_id" in body) patch.matched_id = body.matched_id ?? null;
  if ("metadata" in body && body.metadata !== undefined) patch.metadata = body.metadata ?? {};

  if (body.status !== undefined) {
    patch.status = body.status;
    if (body.status === "matched") {
      patch.matched_at = now;
      patch.matched_by = opts.userId;
    } else {
      // Al salir de 'matched' se limpia la auditoría para no dejar rastro inconsistente.
      patch.matched_at = null;
      patch.matched_by = null;
    }
  }

  return patch;
}
