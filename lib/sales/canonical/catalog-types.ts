/**
 * FASE 9 — Catálogo canónico de productos/servicios + aliases + clasificación.
 * Tipos puros que reflejan el esquema de la migración additive
 * `sales_catalog_categories/items/aliases` + `sales_line_classifications`.
 */

export type SalesCatalogCategory = {
  id: string;
  workspaceId: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SalesCatalogItem = {
  id: string;
  workspaceId: string;
  name: string;
  categoryId: string | null;
  type: "product" | "service";
  active: boolean;
  defaultCurrency: "UYU" | "USD" | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SalesAliasMatchType = "exact" | "normalized_exact" | "contains" | "code";

export type SalesCatalogAlias = {
  id: string;
  workspaceId: string;
  catalogItemId: string;
  /** Texto original tal cual se observó (nunca modificado). */
  originalValue: string;
  /** Valor normalizado usado para matching. */
  normalizedValue: string;
  matchType: SalesAliasMatchType;
  priority: number;
  active: boolean;
  createdByUserId: string | null;
  createdAt: string;
};

/**
 * Clasificación manual de una línea concreta (override determinístico).
 * Se ancla por (workspace, document_id, line_index) o por concepto normalizado.
 */
export type SalesLineClassification = {
  id: string;
  workspaceId: string;
  /** Clave de concepto normalizado — clasifica todas las líneas equivalentes. */
  conceptKey: string;
  catalogItemId: string | null;
  /** "ignored" marca el concepto como no-venta clasificable (excluir del catálogo). */
  status: "classified" | "ignored";
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Vista de catálogo pre-cargada para clasificación en memoria (una request). */
export type SalesCatalogView = {
  categories: SalesCatalogCategory[];
  items: SalesCatalogItem[];
  aliases: SalesCatalogAlias[];
  classifications: SalesLineClassification[];
};

export function emptyCatalogView(): SalesCatalogView {
  return { categories: [], items: [], aliases: [], classifications: [] };
}
