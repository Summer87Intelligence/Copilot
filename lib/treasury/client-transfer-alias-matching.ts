/**
 * Resuelve las formas de transferencia usadas en matching Santander.
 * Aliases activos primero; fallback a proto_companies.transfer_method legacy.
 */
export function resolveClientTransferAliasesForMatching(
  activeAliases: readonly string[],
  legacyTransferMethod: string | null | undefined
): string[] {
  const normalizedActive = activeAliases
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (normalizedActive.length > 0) {
    return normalizedActive;
  }

  const legacy = legacyTransferMethod?.trim();
  return legacy ? [legacy] : [];
}
