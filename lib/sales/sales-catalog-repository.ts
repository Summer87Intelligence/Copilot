/**
 * FASE 9 — Repositorio del catálogo de ventas (server-side).
 * Mapea filas DB → tipos canónicos y carga la vista de catálogo por workspace.
 * SIEMPRE filtra por workspace_id (defensa app-level, además de RLS).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  SalesCatalogAlias,
  SalesCatalogCategory,
  SalesCatalogItem,
  SalesCatalogView,
  SalesLineClassification,
} from "@/lib/sales/canonical/catalog-types";

/** Código Postgres para "relación inexistente" (migración no aplicada). */
export const SALES_TABLE_MISSING_CODE = "42P01";

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function mapCategory(row: Record<string, unknown>): SalesCatalogCategory {
  return {
    id: str(row.id),
    workspaceId: str(row.workspace_id),
    name: str(row.name),
    active: row.active !== false,
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

function mapItem(row: Record<string, unknown>): SalesCatalogItem {
  const type = str(row.item_type) === "product" ? "product" : "service";
  const dc = str(row.default_currency).toUpperCase();
  return {
    id: str(row.id),
    workspaceId: str(row.workspace_id),
    name: str(row.name),
    categoryId: row.category_id ? str(row.category_id) : null,
    type,
    active: row.active !== false,
    defaultCurrency: dc === "UYU" || dc === "USD" ? dc : null,
    description: row.description ? str(row.description) : null,
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

function mapAlias(row: Record<string, unknown>): SalesCatalogAlias {
  const mt = str(row.match_type);
  const matchType =
    mt === "exact" || mt === "normalized_exact" || mt === "contains" || mt === "code"
      ? mt
      : "normalized_exact";
  return {
    id: str(row.id),
    workspaceId: str(row.workspace_id),
    catalogItemId: str(row.catalog_item_id),
    originalValue: str(row.original_value),
    normalizedValue: str(row.normalized_value),
    matchType,
    priority: typeof row.priority === "number" ? row.priority : parseInt(str(row.priority), 10) || 100,
    active: row.active !== false,
    createdByUserId: row.created_by ? str(row.created_by) : null,
    createdAt: str(row.created_at),
  };
}

function mapClassification(row: Record<string, unknown>): SalesLineClassification {
  const status = str(row.status) === "ignored" ? "ignored" : "classified";
  return {
    id: str(row.id),
    workspaceId: str(row.workspace_id),
    conceptKey: str(row.concept_key),
    catalogItemId: row.catalog_item_id ? str(row.catalog_item_id) : null,
    status,
    createdByUserId: row.created_by ? str(row.created_by) : null,
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

/**
 * Carga la vista completa del catálogo para un workspace. Si las tablas no
 * existen todavía (migración no aplicada), degrada a vista vacía en vez de
 * romper el módulo.
 */
export async function loadSalesCatalogView(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<{ view: SalesCatalogView; migrationPending: boolean }> {
  const empty: SalesCatalogView = { categories: [], items: [], aliases: [], classifications: [] };

  const [catRes, itemRes, aliasRes, clsRes] = await Promise.all([
    supabase.from("sales_catalog_categories").select("*").eq("workspace_id", workspaceId),
    supabase.from("sales_catalog_items").select("*").eq("workspace_id", workspaceId),
    supabase.from("sales_catalog_aliases").select("*").eq("workspace_id", workspaceId),
    supabase.from("sales_line_classifications").select("*").eq("workspace_id", workspaceId),
  ]);

  const anyMissing = [catRes, itemRes, aliasRes, clsRes].some(
    (r) => r.error && (r.error as { code?: string }).code === SALES_TABLE_MISSING_CODE
  );
  if (anyMissing) return { view: empty, migrationPending: true };

  const firstError = [catRes, itemRes, aliasRes, clsRes].find((r) => r.error);
  if (firstError?.error) throw new Error(firstError.error.message);

  return {
    view: {
      categories: (catRes.data ?? []).map((r) => mapCategory(r as Record<string, unknown>)),
      items: (itemRes.data ?? []).map((r) => mapItem(r as Record<string, unknown>)),
      aliases: (aliasRes.data ?? []).map((r) => mapAlias(r as Record<string, unknown>)),
      classifications: (clsRes.data ?? []).map((r) => mapClassification(r as Record<string, unknown>)),
    },
    migrationPending: false,
  };
}
