/**
 * FASE 9 — Normalización y matching de conceptos de venta.
 *
 * Reglas (del pedido §8):
 *   - Conservar el texto original (nunca se muta).
 *   - Normalizar espacios, mayúsculas/minúsculas y tildes SOLO para matching.
 *   - No hacer fuzzy match silencioso.
 *   - No clasificar por coincidencia ambigua: si varias reglas de igual
 *     prioridad matchean a items distintos → conflicto (no se clasifica).
 *   - No sobreescribir clasificación manual.
 *   - Prioridad determinística y estable ante el orden de entrada.
 *   - Nunca se usa IA para clasificar cifras financieras.
 */

import type {
  SalesCatalogAlias,
  SalesCatalogItem,
  SalesCatalogView,
  SalesLineClassification,
} from "@/lib/sales/canonical/catalog-types";
import type {
  SalesClassificationSource,
  SalesClassificationStatus,
} from "@/lib/sales/canonical/types";

/** Normaliza texto para matching: trim + colapsar espacios + minúsculas + sin tildes. */
export function normalizeConceptText(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita diacríticos (combining marks)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Clave estable de concepto para agrupar líneas equivalentes y anclar
 * clasificación manual. Combina descripción normalizada + código Zeta.
 */
export function conceptKey(
  description: string | null | undefined,
  code: string | null | undefined
): string {
  const desc = normalizeConceptText(description);
  const c = (code ?? "").trim().toLowerCase();
  return `${desc}::${c}`;
}

export type LineClassificationResult = {
  productId: string | null;
  productName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  status: SalesClassificationStatus;
  source: SalesClassificationSource;
};

const UNCLASSIFIED: LineClassificationResult = {
  productId: null,
  productName: null,
  categoryId: null,
  categoryName: null,
  status: "unclassified",
  source: "fallback",
};

function resolveItemNames(
  item: SalesCatalogItem | undefined,
  view: SalesCatalogView
): { categoryId: string | null; categoryName: string | null } {
  if (!item || !item.categoryId) return { categoryId: null, categoryName: null };
  const cat = view.categories.find((c) => c.id === item.categoryId);
  return { categoryId: item.categoryId, categoryName: cat?.name ?? null };
}

/**
 * Intenta matchear una línea contra los aliases activos del catálogo.
 * Devuelve el catalogItemId ganador o `{ conflict: true }` si hay ambigüedad
 * entre items distintos a la máxima prioridad.
 */
export function matchAliasForConcept(
  description: string,
  code: string | null,
  aliases: readonly SalesCatalogAlias[]
): { itemId: string; matchType: SalesCatalogAlias["matchType"] } | { conflict: true } | null {
  const normDesc = normalizeConceptText(description);
  const normCode = (code ?? "").trim().toLowerCase();

  type Hit = { itemId: string; priority: number; matchType: SalesCatalogAlias["matchType"] };
  const hits: Hit[] = [];

  for (const alias of aliases) {
    if (!alias.active) continue;
    const target = alias.normalizedValue;
    let matched = false;
    switch (alias.matchType) {
      case "code":
        matched = normCode !== "" && normCode === target;
        break;
      case "exact":
      case "normalized_exact":
        matched = normDesc === target;
        break;
      case "contains":
        matched = target !== "" && normDesc.includes(target);
        break;
    }
    if (matched) hits.push({ itemId: alias.catalogItemId, priority: alias.priority, matchType: alias.matchType });
  }

  if (hits.length === 0) return null;

  // Orden determinístico: mayor prioridad primero; empate → itemId asc (estable).
  hits.sort((a, b) => (b.priority - a.priority) || (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0));
  const top = hits[0]!;
  const topContenders = hits.filter((h) => h.priority === top.priority);
  const distinctItems = new Set(topContenders.map((h) => h.itemId));
  if (distinctItems.size > 1) return { conflict: true };
  return { itemId: top.itemId, matchType: top.matchType };
}

/**
 * Clasifica una línea. Orden de resolución (determinístico):
 *   1. Clasificación manual (por conceptKey) — máxima prioridad, nunca se pisa.
 *      status "ignored" ⇒ línea marcada como ignorada.
 *   2. Alias exacto/normalizado/código/contains por prioridad (sin ambigüedad).
 *   3. Fallback: sin clasificar.
 */
export function classifyLine(
  description: string,
  code: string | null,
  view: SalesCatalogView
): LineClassificationResult {
  const key = conceptKey(description, code);

  // 1. Manual override
  const manual = view.classifications.find((c) => c.conceptKey === key);
  if (manual) {
    if (manual.status === "ignored") {
      return { ...UNCLASSIFIED, status: "ignored", source: "manual_rule" };
    }
    const item = view.items.find((i) => i.id === manual.catalogItemId);
    if (item && item.active) {
      const { categoryId, categoryName } = resolveItemNames(item, view);
      return {
        productId: item.id,
        productName: item.name,
        categoryId,
        categoryName,
        status: "classified",
        source: "manual_rule",
      };
    }
  }

  // 2. Alias
  const aliasMatch = matchAliasForConcept(description, code, view.aliases);
  if (aliasMatch && !("conflict" in aliasMatch)) {
    const item = view.items.find((i) => i.id === aliasMatch.itemId);
    if (item && item.active) {
      const { categoryId, categoryName } = resolveItemNames(item, view);
      const source: SalesClassificationSource =
        aliasMatch.matchType === "code"
          ? "zeta_code"
          : aliasMatch.matchType === "exact"
            ? "exact_alias"
            : "normalized_alias";
      return {
        productId: item.id,
        productName: item.name,
        categoryId,
        categoryName,
        status: "classified",
        source,
      };
    }
  }

  // 3. Sin clasificar (o conflicto → se deja sin clasificar y se expone en bandeja)
  return UNCLASSIFIED;
}

/**
 * Sugerencia no-vinculante para la bandeja de "Clasificación pendiente":
 * un match de alias no-ambiguo produce sugerencia aunque el usuario deba
 * confirmarla. No clasifica automáticamente.
 */
export function suggestForConcept(
  description: string,
  code: string | null,
  view: SalesCatalogView
): { productId: string; productName: string } | null {
  const aliasMatch = matchAliasForConcept(description, code, view.aliases);
  if (aliasMatch && !("conflict" in aliasMatch)) {
    const item = view.items.find((i) => i.id === aliasMatch.itemId);
    if (item && item.active) return { productId: item.id, productName: item.name };
  }
  return null;
}

/** Helper para construir una clasificación manual normalizada. */
export function buildConceptKeyForClassification(
  description: string,
  code: string | null
): string {
  return conceptKey(description, code);
}

export type { SalesLineClassification };
