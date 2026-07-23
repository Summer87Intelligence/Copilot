/**
 * Enmascara cuenta/token para UI sin exponer el dato completo.
 * Sin dependencias Node — usable en Client Components.
 */
export function maskAccountOrReference(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length <= 4) return "•".repeat(trimmed.length);
  return `${"•".repeat(Math.max(trimmed.length - 4, 3))}${trimmed.slice(-4)}`;
}
