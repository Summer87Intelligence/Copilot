/**
 * Normalización de texto para búsquedas en Cartera / Explorador.
 * Case-insensitive, sin acentos, espacios colapsados.
 */

export function normalizeSearchText(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
