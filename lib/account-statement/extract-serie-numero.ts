/**
 * Extrae el código de comprobante legible a partir de referencias técnicas de Zeta.
 *
 * Formatos conocidos:
 *   "A2934"                        → "A2934"
 *   "ZETA:CCV1:0:36:A2934"         → "A2934"
 *   "ZETA:CCV1:0:36:A:2934"        → "A2934"  (serie y número separados por ":")
 *   "prefix|A-2934"                → "A-2934"
 *   UUID                           → "—"
 *   null / undefined / ""          → "—"
 */
export function extractSerieNumero(input: string | null | undefined): string {
  if (!input) return "—";
  const s = String(input).trim();
  if (!s) return "—";

  // UUID → no es útil para mostrar al usuario
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return "—";

  // Separado por pipe: "prefix|A-2934" → tomar último segmento
  if (s.includes("|")) {
    const last = s.split("|").pop()?.trim() ?? "";
    return last || "—";
  }

  // Separado por dos puntos: "ZETA:CCV1:0:36:A2934" o "ZETA:CCV1:0:36:A:2934"
  if (s.includes(":")) {
    const parts = s.split(":");
    const last = parts[parts.length - 1].trim();
    const secondLast = parts.length >= 2 ? parts[parts.length - 2].trim() : "";

    // Patrón "SERIE:NUMERO" donde SERIE es una sola letra y NUMERO es dígitos
    if (/^\d+$/.test(last) && /^[A-Za-z]$/.test(secondLast)) {
      return `${secondLast.toUpperCase()}${last}`;
    }

    return last || "—";
  }

  // Ya viene limpio — truncar si es sospechosamente largo
  return s.length > 20 ? s.slice(0, 20) : s;
}
