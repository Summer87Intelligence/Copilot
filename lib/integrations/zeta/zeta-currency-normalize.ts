/**
 * Normalización de moneda Zeta → ISO 4217 (UYU / USD).
 *
 * Zeta puede devolver la moneda en múltiples formatos según el endpoint:
 *   - MonedaNombre: "Peso Uruguayo", "Dólar", "Dólares", "Dolar", "Peso"
 *   - MonedaSimbolo: "$", "U$S", "US$", "USD", "UYU"
 *   - MonedaCodigo: "1" (UYU por defecto Zeta UY), "2" (USD), "USD", "UYU"
 *
 * Reglas de prioridad: Nombre → Símbolo → Código.
 * No retorna "ARS" — este sistema es Uruguay.
 */

export type ZetaISOCurrency = "USD" | "UYU";

/**
 * Normaliza cualquier combinación de campos de moneda Zeta a ISO 4217.
 * Retorna null si ningún campo permite determinar la moneda con certeza.
 */
function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function normalizeZetaCurrency(
  monedaNombre: string | null | undefined,
  monedaSimbolo?: string | null | undefined,
  monedaCodigo?: string | null | undefined
): ZetaISOCurrency | null {
  // 1. MonedaNombre (más descriptivo) — quitar tildes para comparar
  const n = stripDiacritics((monedaNombre ?? "").trim()).toUpperCase();
  if (n) {
    if (
      n.includes("DOLAR") ||
      n.includes("DOLLAR") ||
      n.includes("USD") ||
      n.includes("U$S") ||
      n.includes("US$")
    )
      return "USD";
    if (
      n.includes("PESO") ||
      n.includes("UYU") ||
      n.includes("URUGUAYO") ||
      n.includes("URUGUAYA")
    )
      return "UYU";
  }

  // 2. MonedaSimbolo
  const s = (monedaSimbolo ?? "").trim().toUpperCase();
  if (s) {
    if (s === "U$S" || s === "US$" || s === "USD" || s.includes("DOLAR") || s.includes("DOLLAR"))
      return "USD";
    if (s === "$" || s === "UYU" || s.includes("PESO")) return "UYU";
  }

  // 3. MonedaCodigo
  const c = (monedaCodigo ?? "").trim().toUpperCase();
  if (c) {
    if (c === "2" || c === "USD" || c === "U$S" || c.includes("DOLAR") || c.includes("DOLLAR"))
      return "USD";
    if (c === "1" || c === "UYU" || c.includes("PESO")) return "UYU";
  }

  return null;
}
