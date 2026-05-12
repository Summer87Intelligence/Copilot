/**
 * copilot-numeric-parse
 * ---------------------
 * Helpers para normalizar valores numéricos provenientes de Supabase / Postgres
 * a `number | null` de forma segura.
 *
 * Motivación:
 *  PostgreSQL serializa las columnas `numeric` / `decimal` como STRING en el
 *  driver JavaScript de Supabase (para preservar precisión decimal exacta).
 *  Si una capa de API hace `typeof v === "number" ? v : null`, todos los
 *  importes (`total_amount`, `balance_amount`, etc.) se truncan a `null` y
 *  los reportes financieros agregados quedan en cero — aunque los counts
 *  parezcan correctos en otras partes del UI alimentadas por la misma data.
 *
 *  Este módulo provee una sola fuente de verdad para ese parseo y se usa en
 *  los routes que mapean filas crudas de Supabase a `InvoiceInput` para el
 *  motor `generateFinancialConsistencyReport`.
 *
 * Reglas:
 *  - `null`, `undefined`, `""`, NaN, Infinity → `null`.
 *  - `number` finito → tal cual.
 *  - `string` numérico (acepta `1.234,56` formato es-UY y `1234.56`) → number.
 *  - cualquier otro tipo (boolean, object, array) → `null`.
 */

export function toSafeNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed) return null;
    // Soporta tanto `"1234.56"` como `"1.234,56"` (formato es-UY con punto de
    // mil + coma decimal). Si la cadena contiene coma decimal y/o puntos de
    // mil, normalizamos a JS Number (`1234.56`).
    const looksEsUY =
      trimmed.includes(",") &&
      // Detecta `1.234,56` o `123,45` pero NO `1234.56` (que ya es JS-native).
      /[0-9]\.[0-9]{3}(?:[\.,]|$)|[0-9],[0-9]/.test(trimmed);
    const normalized = looksEsUY
      ? trimmed.replace(/\./g, "").replace(/,/g, ".")
      : trimmed;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
