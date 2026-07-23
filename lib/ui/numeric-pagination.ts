/**
 * FASE BANK-2026-CLEANUP — paginación numérica con ellipsis.
 * Puro: genera la secuencia de botones a renderizar.
 */

export type PageToken = number | "ellipsis";

/**
 * Devuelve tokens para render: números de página y "ellipsis".
 * Siempre incluye 1 y totalPages cuando totalPages > 1.
 * `window` = vecinos a cada lado de la página actual (default 1 → ~7 slots).
 */
export function buildNumericPageTokens(
  currentPage: number,
  totalPages: number,
  window = 1
): PageToken[] {
  const total = Math.max(1, Math.floor(totalPages));
  const current = Math.min(Math.max(1, Math.floor(currentPage) || 1), total);
  if (total <= 1) return [1];

  const siblings = Math.max(0, Math.floor(window));
  const set = new Set<number>();
  set.add(1);
  set.add(total);
  for (let p = current - siblings; p <= current + siblings; p += 1) {
    if (p >= 1 && p <= total) set.add(p);
  }
  // Si hay hueco chico cerca de los extremos, rellenar
  if (current - siblings <= 3) {
    for (let p = 2; p <= Math.min(total - 1, 3 + siblings); p += 1) set.add(p);
  }
  if (current + siblings >= total - 2) {
    for (let p = Math.max(2, total - 2 - siblings); p <= total - 1; p += 1) set.add(p);
  }

  const sorted = [...set].sort((a, b) => a - b);
  const tokens: PageToken[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) tokens.push("ellipsis");
    tokens.push(p);
    prev = p;
  }
  return tokens;
}
