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
 *   181 — e-Nota de Crédito de e-Factura
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
  181,
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
  if (raw !== null && raw !== undefined && raw !== "") {
    if (typeof raw === "number") {
      return Number.isFinite(raw) ? Math.trunc(raw) : null;
    }
    if (typeof raw === "string") {
      const s = raw.trim();
      if (s) {
        const n = parseInt(s, 10);
        if (Number.isFinite(n)) return n;
      }
    }
  }
  const payload = v1.raw_payload;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const rawCfe = (payload as Record<string, unknown>).CFETipo;
    if (rawCfe != null && rawCfe !== "") {
      const n = typeof rawCfe === "number" ? rawCfe : parseInt(String(rawCfe).trim(), 10);
      if (Number.isFinite(n)) return n;
    }
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

function readZetaVoucherV1(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const v1raw = (metadata as Record<string, unknown>).zeta_customer_voucher_v1;
  if (!v1raw || typeof v1raw !== "object" || Array.isArray(v1raw)) return null;
  return v1raw as Record<string, unknown>;
}

/** Serie+Numero desde metadata Zeta (misma regla que Datos / vouchers). */
export function readCreditNoteSerieNumeroFromMetadata(
  metadata: unknown
): { serie: string; numero: string } | null {
  const v1 = readZetaVoucherV1(metadata);
  if (!v1) return null;
  const serieRaw = v1.serie ?? v1.Serie;
  const numRaw = v1.numero ?? v1.Numero;
  const serie =
    typeof serieRaw === "string" ? serieRaw.trim() : serieRaw != null ? String(serieRaw).trim() : "";
  const numero =
    typeof numRaw === "string"
      ? numRaw.trim()
      : numRaw != null && String(numRaw).trim() !== ""
        ? String(numRaw).trim()
        : "";
  if (serie && numero) return { serie, numero };
  return null;
}

/**
 * Etiqueta visible de la NC: prioriza Serie-Numero; fallback a `invoice_number`.
 */
export function formatCreditNoteVoucherLabel(
  metadata: unknown,
  invoiceNumber?: string | null
): string {
  const pair = readCreditNoteSerieNumeroFromMetadata(metadata);
  if (pair) return `${pair.serie}-${pair.numero}`;
  const v1 = readZetaVoucherV1(metadata);
  if (v1) {
    const serieRaw = v1.serie ?? v1.Serie;
    const numRaw = v1.numero ?? v1.Numero;
    const serie =
      typeof serieRaw === "string" ? serieRaw.trim() : serieRaw != null ? String(serieRaw).trim() : "";
    const numero =
      typeof numRaw === "string"
        ? numRaw.trim()
        : numRaw != null && String(numRaw).trim() !== ""
          ? String(numRaw).trim()
          : "";
    if (numero) return serie ? `${serie}-${numero}` : numero;
    if (serie) return serie;
  }
  const inv = String(invoiceNumber ?? "").trim();
  return inv || "—";
}

const ASSOCIATED_INVOICE_KEYS = [
  "ComprobanteReferencia",
  "comprobanteReferencia",
  "FacturaAsociada",
  "facturaAsociada",
  "DocumentoOrigen",
  "documentoOrigen",
  "ComprobanteOrigen",
  "comprobanteOrigen",
  "ReferenciaComprobante",
  "referenciaComprobante",
  "ComprobanteRelacionado",
  "comprobanteRelacionado",
] as const;

/**
 * Factura asociada a la NC si Zeta la expone en metadata. Defensivo: retorna
 * `null` cuando no hay dato documentado en el payload sincronizado.
 */
export function readAssociatedInvoiceFromZetaMetadata(metadata: unknown): string | null {
  const v1 = readZetaVoucherV1(metadata);
  if (!v1) return null;

  const payload = v1.raw_payload;
  const sources: Record<string, unknown>[] = [v1];
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    sources.push(payload as Record<string, unknown>);
  }

  for (const src of sources) {
    for (const key of ASSOCIATED_INVOICE_KEYS) {
      const val = src[key];
      if (typeof val === "string" && val.trim()) return val.trim();
      if (typeof val === "number" && Number.isFinite(val)) return String(Math.trunc(val));
    }
    const serie =
      src.SerieReferencia ??
      src.serieReferencia ??
      src.ReferenciaSerie ??
      src.referenciaSerie;
    const numero =
      src.NumeroReferencia ??
      src.numeroReferencia ??
      src.ReferenciaNumero ??
      src.referenciaNumero;
    if (serie != null && numero != null) {
      const s = String(serie).trim();
      const n = String(numero).trim();
      if (s && n) return `${s}-${n}`;
    }
  }

  return null;
}
