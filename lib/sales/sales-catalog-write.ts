/**
 * FASE 9 — Esquemas Zod + builders de inserción para la gestión del catálogo
 * de ventas (admin). Puros: no tocan DB; solo validan y normalizan.
 */

import { z } from "zod";

import { normalizeConceptText, conceptKey } from "@/lib/sales/canonical/sales-normalization";

export const catalogCategoryCreateSchema = z.object({
  kind: z.literal("category"),
  name: z.string().trim().min(1).max(120),
  active: z.boolean().optional(),
});

export const catalogItemCreateSchema = z.object({
  kind: z.literal("item"),
  name: z.string().trim().min(1).max(160),
  categoryId: z.string().uuid().nullable().optional(),
  type: z.enum(["product", "service"]).optional(),
  defaultCurrency: z.enum(["UYU", "USD"]).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  /** Si true, crea un alias normalized_exact con el nombre del item. */
  createSelfAlias: z.boolean().optional(),
});

export const catalogCreateSchema = z.discriminatedUnion("kind", [
  catalogCategoryCreateSchema,
  catalogItemCreateSchema,
]);
export type CatalogCreateInput = z.infer<typeof catalogCreateSchema>;

export const catalogItemUpdateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  type: z.enum(["product", "service"]).optional(),
  active: z.boolean().optional(),
  defaultCurrency: z.enum(["UYU", "USD"]).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
});
export type CatalogItemUpdateInput = z.infer<typeof catalogItemUpdateSchema>;

export const classificationCreateSchema = z.object({
  /** Concepto original + código Zeta (se normaliza a conceptKey server-side). */
  originalDescription: z.string().trim().min(1).max(500),
  originalCode: z.string().trim().max(120).nullable().optional(),
  catalogItemId: z.string().uuid().nullable().optional(),
  status: z.enum(["classified", "ignored"]),
});
export type ClassificationCreateInput = z.infer<typeof classificationCreateSchema>;

export const aliasCreateSchema = z.object({
  catalogItemId: z.string().uuid(),
  originalValue: z.string().trim().min(1).max(300),
  matchType: z.enum(["exact", "normalized_exact", "contains", "code"]).optional(),
  priority: z.number().int().min(0).max(1000).optional(),
});
export type AliasCreateInput = z.infer<typeof aliasCreateSchema>;

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

export function buildCategoryInsert(input: z.infer<typeof catalogCategoryCreateSchema>, workspaceId: string, userId: string | null) {
  return {
    workspace_id: workspaceId,
    name: input.name,
    active: input.active ?? true,
    created_by: userId,
  };
}

export function buildItemInsert(input: z.infer<typeof catalogItemCreateSchema>, workspaceId: string, userId: string | null) {
  return {
    workspace_id: workspaceId,
    name: input.name,
    category_id: input.categoryId ?? null,
    item_type: input.type ?? "service",
    default_currency: input.defaultCurrency ?? null,
    description: input.description ?? null,
    created_by: userId,
  };
}

export function buildSelfAliasInsert(itemId: string, name: string, workspaceId: string, userId: string | null) {
  return {
    workspace_id: workspaceId,
    catalog_item_id: itemId,
    original_value: name,
    normalized_value: normalizeConceptText(name),
    match_type: "normalized_exact" as const,
    priority: 100,
    active: true,
    created_by: userId,
  };
}

export function buildItemUpdate(input: CatalogItemUpdateInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.categoryId !== undefined) patch.category_id = input.categoryId;
  if (input.type !== undefined) patch.item_type = input.type;
  if (input.active !== undefined) patch.active = input.active;
  if (input.defaultCurrency !== undefined) patch.default_currency = input.defaultCurrency;
  if (input.description !== undefined) patch.description = input.description;
  return patch;
}

export function buildClassificationUpsert(input: ClassificationCreateInput, workspaceId: string, userId: string | null) {
  return {
    workspace_id: workspaceId,
    concept_key: conceptKey(input.originalDescription, input.originalCode ?? null),
    catalog_item_id: input.status === "ignored" ? null : (input.catalogItemId ?? null),
    status: input.status,
    created_by: userId,
  };
}

export function buildAliasInsert(input: AliasCreateInput, workspaceId: string, userId: string | null) {
  const matchType = input.matchType ?? "normalized_exact";
  const normalized =
    matchType === "code" ? input.originalValue.trim().toLowerCase() : normalizeConceptText(input.originalValue);
  return {
    workspace_id: workspaceId,
    catalog_item_id: input.catalogItemId,
    original_value: input.originalValue,
    normalized_value: normalized,
    match_type: matchType,
    priority: input.priority ?? 100,
    active: true,
    created_by: userId,
  };
}
