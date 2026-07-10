/**
 * Alias bancarios de clientes (client_bank_aliases): tipos, Zod y builders.
 * normalized_alias lo calcula el servidor con normalizeAliasText.
 */
import { z } from "zod";

import { normalizeAliasText } from "@/lib/bank-movements/bank-text-normalization";

export const CLIENT_BANK_ALIAS_TYPES = [
  "bank_name",
  "legal_name",
  "rut",
  "transfer_reference",
  "contact_name",
  "manual",
  "learned",
] as const;
export type ClientBankAliasType = (typeof CLIENT_BANK_ALIAS_TYPES)[number];

export const CLIENT_BANK_ALIAS_TYPE_LABELS: Record<ClientBankAliasType, string> = {
  bank_name: "Nombre bancario",
  legal_name: "Razón social",
  rut: "RUT",
  transfer_reference: "Referencia",
  contact_name: "Contacto",
  manual: "Manual",
  learned: "Aprendido",
};

export type ClientBankAlias = {
  id: string;
  workspace_id: string;
  client_id: string;
  alias_text: string;
  normalized_alias: string;
  alias_type: ClientBankAliasType;
  currency: "UYU" | "USD" | null;
  usual_amount: number | null;
  confidence_weight: number;
  learned_from_bank_movement_id: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

const currency = z.enum(["UYU", "USD"]);
const optionalNullableUuid = z.union([z.string().uuid(), z.null()]).optional();

export const clientBankAliasCreateSchema = z
  .object({
    alias_text: z.string().trim().min(3, "Mínimo 3 caracteres.").max(200),
    alias_type: z.enum(CLIENT_BANK_ALIAS_TYPES).optional(),
    currency: z.union([currency, z.null()]).optional(),
    usual_amount: z.union([z.number().finite().nonnegative(), z.null()]).optional(),
    learned_from_bank_movement_id: optionalNullableUuid,
  })
  .strict();

export const clientBankAliasUpdateSchema = z
  .object({
    alias_text: z.string().trim().min(3).max(200).optional(),
    alias_type: z.enum(CLIENT_BANK_ALIAS_TYPES).optional(),
    currency: z.union([currency, z.null()]).optional(),
    usual_amount: z.union([z.number().finite().nonnegative(), z.null()]).optional(),
    archived: z.boolean().optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, { message: "Nada para actualizar." });

export type ClientBankAliasCreateBody = z.infer<typeof clientBankAliasCreateSchema>;
export type ClientBankAliasUpdateBody = z.infer<typeof clientBankAliasUpdateSchema>;

export function buildClientBankAliasInsert(
  body: ClientBankAliasCreateBody,
  ctx: { workspaceId: string; clientId: string; userId: string | null }
): Record<string, unknown> {
  return {
    workspace_id: ctx.workspaceId,
    client_id: ctx.clientId,
    alias_text: body.alias_text.trim(),
    normalized_alias: normalizeAliasText(body.alias_text),
    alias_type: body.alias_type ?? "manual",
    currency: body.currency ?? null,
    usual_amount: body.usual_amount ?? null,
    learned_from_bank_movement_id: body.learned_from_bank_movement_id ?? null,
    created_by: ctx.userId,
    metadata: {},
  };
}

export function buildClientBankAliasPatch(
  body: ClientBankAliasUpdateBody,
  opts: { now?: Date } = {}
): Record<string, unknown> {
  const now = (opts.now ?? new Date()).toISOString();
  const patch: Record<string, unknown> = { updated_at: now };
  if (body.alias_text !== undefined) {
    patch.alias_text = body.alias_text.trim();
    patch.normalized_alias = normalizeAliasText(body.alias_text);
  }
  if (body.alias_type !== undefined) patch.alias_type = body.alias_type;
  if ("currency" in body) patch.currency = body.currency ?? null;
  if ("usual_amount" in body) patch.usual_amount = body.usual_amount ?? null;
  if (body.archived !== undefined) patch.archived_at = body.archived ? now : null;
  return patch;
}
