/**
 * lib/copilot-zeta-credit-note.ts
 *
 * Helper PURO y testeable para detectar Notas de Crédito (NC) desde la
 * metadata sincronizada por el pipeline de comprobantes cliente Zeta. El
 * dato `cfe_tipo` ya está persistido en `proto_invoices.zeta_metadata.
 * zeta_customer_voucher_v1.cfe_tipo` por el mapper actual; lo que hacía falta
 * era CLASIFICAR esa fila como crédito (en lugar de cargarla como factura
 * con total positivo y sumarla al saldo).
 *
 * Catálogo CFE (DGI Uruguay) — códigos de Nota de Crédito:
 *
 *   102 — e-Factura Nota de Crédito
 *   112 — e-Boleta de Contado Nota de Crédito
 *   122 — e-Ticket Nota de Crédito
 *   132 — e-Remito Nota de Crédito (raro)
 *   142 — e-Resguardo Nota de Crédito
 *   182 — e-Factura de Exportación Nota de Crédito
 *   202, 212, 222, 232, 242, 282 — variantes de Contingencia
 *
 * Fuente: `lib/integrations/zeta/zeta-customer-vouchers-invoice-classifier.ts`
 * (mismo set de tipos persistibles del pipeline).
 *
 * Reglas:
 *   - NO toca DB, mapper, pipeline, sync, RLS ni schema.
 *   - NO inventa NC: si la metadata no expone `cfe_tipo`, retorna `false`.
 *   - Defensivo: tolera variaciones de capitalización (camel/snake) y
 *     formato numérico (number/string).
 *   - Use case primario: motor financiero (`copilot-financial-reconciliation`)
 *     y estado de cuenta (`copilot-client-account-statement`) para tratar NCs
 *     como crédito (signo opuesto) y eliminar la divergencia documentada en
 *     `docs/vendors/z/KNOWN-DIVERGENCES.md` DIV-CONT-002.
 */

/**
 * Códigos CFE (DGI) que corresponden a Notas de Crédito en el catálogo
 * `CFE_TIPOS_DGI_FACTURA_O_DOCUMENTO_FISCAL` del classifier de vouchers.
 * Solo se incluyen los tipos NC; el classifier acepta también facturas
 * regulares con otros códigos del mismo set.
 */
export const CFE_NC_TIPOS_DGI: ReadonlySet<number> = new Set([
  102,
  112,
  122,
  132,
  142,
  182,
  202,
  212,
  222,
  232,
  242,
  282,
]);

/**
 * Lee defensivamente `cfe_tipo` desde un objeto `zeta_metadata` Supabase.
 * Soporta los caminos:
 *   - `metadata.zeta_customer_voucher_v1.cfe_tipo` (camel-ish, lo que escribe el mapper)
 *   - `metadata.zeta_customer_voucher_v1.cfeTipo` (variante)
 *   - `metadata.zeta_customer_voucher_v1.CFETipo` (raw Zeta, por si algún caller olvida snake_case)
 *
 * Acepta `cfe_tipo` como number o string numérico. Devuelve `null` si
 * la metadata es inválida, está ausente, o el valor no es un número finito.
 *
 * Nunca lanza: cualquier shape inesperado degrada a `null`.
 */
export function readCfeTipoFromZetaMetadata(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const root = metadata as Record<string, unknown>;
  const v1raw = root.zeta_customer_voucher_v1;
  if (!v1raw || typeof v1raw !== "object" || Array.isArray(v1raw)) {
    return null;
  }
  const v1 = v1raw as Record<string, unknown>;
  const raw = v1.cfe_tipo ?? v1.cfeTipo ?? v1.CFETipo;
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? Math.trunc(raw) : null;
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return null;
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * `true` si la metadata identifica la fila como Nota de Crédito por
 * catálogo DGI. Defensivo y puro: nunca lanza, default `false`.
 */
export function isCreditNoteFromMetadata(metadata: unknown): boolean {
  const tipo = readCfeTipoFromZetaMetadata(metadata);
  if (tipo === null) return false;
  return CFE_NC_TIPOS_DGI.has(tipo);
}
