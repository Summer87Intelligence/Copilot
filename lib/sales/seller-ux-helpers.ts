/**
 * FASE SALES-SELLER-ROLLOUT-POLISH-001 — lógica pura de UX del selector de
 * vendedor y de la tab Vendedores. Sin DOM: el proyecto no usa
 * @testing-library/react, así que la lógica no trivial se extrae aquí para
 * poder testearla como el resto de lib/sales (funciones puras).
 */

export type SellerOption = { id: string; displayName: string; disabled?: boolean };

/**
 * Opciones del selector de vendedor, sin incluir "Sin asignar" (esa opción es
 * fija y se agrega aparte en la UI, siempre primero). Si el vendedor
 * actualmente asignado ya no está activo, se antepone como opción
 * deshabilitada (histórico visible, no seleccionable para asignaciones nuevas).
 * El orden de `activePeople` se preserva tal cual llega (ya viene alfabético
 * desde el repositorio) — esta función nunca reordena.
 */
export function buildSellerOptions(
  currentSellerId: string | null,
  currentSellerName: string | null,
  activePeople: readonly { id: string; displayName: string }[]
): SellerOption[] {
  const isCurrentActive = currentSellerId ? activePeople.some((p) => p.id === currentSellerId) : true;
  const options: SellerOption[] = [];
  if (currentSellerId && !isCurrentActive) {
    options.push({
      id: currentSellerId,
      displayName: `${currentSellerName ?? "Vendedor inactivo"} (inactivo)`,
      disabled: true,
    });
  }
  for (const p of activePeople) {
    options.push({ id: p.id, displayName: p.displayName });
  }
  return options;
}

/** `true` si al menos una fila de la tab Vendedores tiene un vendedor real con operaciones. */
export function hasAnySellerAssigned(
  rows: readonly { sellerId: string | null; invoiceCount: number }[]
): boolean {
  return rows.some((r) => r.sellerId !== null && r.invoiceCount > 0);
}

/** Fila "Sin vendedor identificado" (sellerId=null), si existe. */
export function findUnassignedSellerRow<T extends { sellerId: string | null }>(
  rows: readonly T[]
): T | undefined {
  return rows.find((r) => r.sellerId === null);
}

/**
 * FASE SALES-DOCUMENT-SELLER-INLINE-UX-AND-IDENTITY-FIX-001 — parcha
 * localmente las filas que pertenecen a un `documentId` (identidad única e
 * inmutable del documento; NUNCA número visible, cliente, importe ni índice).
 *
 * Si un documento tiene varias líneas de servicio, TODAS comparten el mismo
 * vendedor por diseño (misma factura) y todas se actualizan juntas aquí — eso
 * es intencional, no un bug de identidad. Filas de otros documentos, incluidas
 * las que compartan el mismo número visible pero un `documentId` distinto,
 * nunca se tocan.
 */
export function patchRowsByDocumentId<
  T extends { documentId: string; sellerId: string | null; sellerName: string | null },
>(rows: readonly T[], documentId: string, sellerId: string | null, sellerName: string | null): T[] {
  return rows.map((row) => (row.documentId === documentId ? { ...row, sellerId, sellerName } : row));
}
