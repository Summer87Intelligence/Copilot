/**
 * Contrato de integración Zeta API — reglas canónicas del tenant.
 *
 * Fuente de verdad para:
 *  - Moneda: MonedaCodigo 1=UYU, 2=USD
 *  - RegistroId: siempre preservar; normalizar a string
 *  - Saldos pendientes con Numero=0: no descartar si tiene RegistroId+Saldo+Total
 *  - CFETipo=0 + Lineas positivas sin FormasPago: factura interna válida
 *  - Notas de crédito: CFETipo 181 / 182
 *  - ClienteCodigo VARIOS/VARIOS USD: recibo sin cliente — pending_review
 *  - Shadow duplicado: no duplicar CCV1 si existe RegistroId equivalente
 *  - Tipos desconocidos: alerta, nunca datos inventados
 *
 * Documentación completa: docs/integrations/zeta-api-contract.md
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export type ZetaRegistroId = string;
export type ZetaISOCurrency = "USD" | "UYU";

/** MonedaCodigo canónico del tenant Zeta Uruguay. */
const MONEDA_UYU = new Set(["1", "UYU"]);
const MONEDA_USD = new Set(["2", "USD", "U$S", "US$"]);

/**
 * Normaliza MonedaCodigo → ISO 4217.
 * Retorna null si el código es desconocido (debe generarse alerta externa).
 */
export function resolveMonedaCodigo(monedaCodigo: unknown): ZetaISOCurrency | null {
  const s = String(monedaCodigo ?? "").trim().toUpperCase();
  if (!s) return null;
  if (MONEDA_UYU.has(s)) return "UYU";
  if (MONEDA_USD.has(s)) return "USD";
  return null;
}

/**
 * Normaliza RegistroId a string no vacío, o null si está ausente.
 * Zeta puede devolver int o string según endpoint.
 */
export function normalizeRegistroId(raw: unknown): ZetaRegistroId | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s.length > 0 ? s : null;
}

// ---------------------------------------------------------------------------
// Ventas Detalladas (RESTFacturaClienteV4VentasDetalladas)
// ---------------------------------------------------------------------------

export type ZetaVentaDetalladaRow = {
  RegistroId: string | null;
  FacturaSerie: string | null;
  FacturaNumero: string | null;
  ClienteCodigo: string | null;
  MonedaCodigo: string | null;
  currency_iso: ZetaISOCurrency | null;
  CFETipo: number | null;
  ComprobanteCodigo: string | null;
};

function readStr(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (v !== null && v !== undefined) {
      const s = String(v).trim();
      if (s.length > 0) return s;
    }
  }
  return null;
}

function readNum(row: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = row[k];
    if (v === null || v === undefined) continue;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    const n = Number(String(v).trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function parseVentaDetalladaRow(raw: Record<string, unknown>): ZetaVentaDetalladaRow {
  const monedaCodigo = readStr(raw, "MonedaCodigo", "monedaCodigo");
  return {
    RegistroId: normalizeRegistroId(raw.RegistroId ?? raw.registroId),
    FacturaSerie: readStr(raw, "FacturaSerie", "facturaSerie", "Serie", "serie"),
    FacturaNumero: readStr(raw, "FacturaNumero", "facturaNumero", "Numero", "numero"),
    ClienteCodigo: readStr(raw, "ClienteCodigo", "clienteCodigo"),
    MonedaCodigo: monedaCodigo,
    currency_iso: resolveMonedaCodigo(monedaCodigo),
    CFETipo: readNum(raw, "CFETipo", "cfeTipo"),
    ComprobanteCodigo: readStr(raw, "ComprobanteCodigo", "comprobanteCodigo"),
  };
}

// ---------------------------------------------------------------------------
// Saldos Pendientes (RESTFacturaClienteV4QuerySaldosPendientes)
// ---------------------------------------------------------------------------

export type ZetaSaldoPendienteRow = {
  RegistroId: string | null;
  ClienteCodigo: string | null;
  MonedaCodigo: string | null;
  currency_iso: ZetaISOCurrency | null;
  Saldo: number | null;
  Total: number | null;
  Numero: string | null;
  Serie: string | null;
  Fecha: string | null;
  ComprobanteCodigo: string | null;
  ComprobanteTipo: string | null;
};

/** Resultado de la validación de una fila de saldo pendiente. */
export type ZetaSaldoPendienteValidation =
  | { ok: true }
  | { ok: false; reason: "missing_registro_id" | "missing_saldo" | "missing_total" | "missing_moneda" };

/**
 * Valida una fila de saldo pendiente.
 *
 * Regla crítica: Numero=0 NO es motivo de descarte si tiene RegistroId + Saldo + Total.
 * Los borradores CFE (Emitida="N") no llegan vía este endpoint REST.
 */
export function validateSaldoPendienteRow(row: ZetaSaldoPendienteRow): ZetaSaldoPendienteValidation {
  if (!row.RegistroId) return { ok: false, reason: "missing_registro_id" };
  if (row.Saldo === null) return { ok: false, reason: "missing_saldo" };
  if (row.Total === null) return { ok: false, reason: "missing_total" };
  if (!row.MonedaCodigo) return { ok: false, reason: "missing_moneda" };
  return { ok: true };
}

export function parseSaldoPendienteRow(raw: Record<string, unknown>): ZetaSaldoPendienteRow {
  const monedaCodigo = readStr(raw, "MonedaCodigo", "monedaCodigo");
  return {
    RegistroId: normalizeRegistroId(raw.RegistroId ?? raw.registroId),
    ClienteCodigo: readStr(raw, "ClienteCodigo", "clienteCodigo"),
    MonedaCodigo: monedaCodigo,
    currency_iso: resolveMonedaCodigo(monedaCodigo),
    Saldo: readNum(raw, "Saldo", "saldo"),
    Total: readNum(raw, "Total", "total"),
    Numero: readStr(raw, "Numero", "numero"),
    Serie: readStr(raw, "Serie", "serie"),
    Fecha: readStr(raw, "Fecha", "fecha"),
    ComprobanteCodigo: readStr(raw, "ComprobanteCodigo", "comprobanteCodigo"),
    ComprobanteTipo: readStr(raw, "ComprobanteTipo", "comprobanteTipo"),
  };
}

// ---------------------------------------------------------------------------
// Recibos de Cobro (RESTRecibosCobranzaV2QueryComprobantes)
// ---------------------------------------------------------------------------

export type ZetaReciboRow = {
  RegistroId: string | null;
  ClienteCodigo: string | null;
  MonedaCodigo: string | null;
  currency_iso: ZetaISOCurrency | null;
  Total: number | null;
  Fecha: string | null;
  ComprobanteCodigo: string | null;
  is_varios: boolean;
  review_required: boolean;
};

/** ClienteCodigo values that represent "generic/unassigned client" in Zeta receipts. */
export const ZETA_VARIOS_CLIENTE_CODES = new Set(["VARIOS", "VARIOS USD", "VARIOS UYU", "200"]);

/**
 * Detecta recibos con cliente "VARIOS" — no deben asignarse automáticamente.
 * Estos van a `pending_review`.
 */
export function zetaReciboIsVarios(clienteCodigo: string | null): boolean {
  if (!clienteCodigo) return false;
  const normalized = clienteCodigo.trim().toUpperCase();
  return ZETA_VARIOS_CLIENTE_CODES.has(normalized);
}

export function parseReciboRow(raw: Record<string, unknown>): ZetaReciboRow {
  const monedaCodigo = readStr(raw, "MonedaCodigo", "monedaCodigo");
  const clienteCodigo = readStr(raw, "ClienteCodigo", "clienteCodigo");
  const isVarios = zetaReciboIsVarios(clienteCodigo);
  return {
    RegistroId: normalizeRegistroId(raw.RegistroId ?? raw.registroId),
    ClienteCodigo: clienteCodigo,
    MonedaCodigo: monedaCodigo,
    currency_iso: resolveMonedaCodigo(monedaCodigo),
    Total: readNum(raw, "Total", "total"),
    Fecha: readStr(raw, "Fecha", "fecha"),
    ComprobanteCodigo: readStr(raw, "ComprobanteCodigo", "comprobanteCodigo"),
    is_varios: isVarios,
    review_required: isVarios,
  };
}

// ---------------------------------------------------------------------------
// Comprobantes por cliente (RESTComprobantesClienteV1Query / CCV1)
// ---------------------------------------------------------------------------

/** CFE DGI válidos que corresponden a facturas (no NC, no recibo). */
export const CFE_TIPOS_FACTURA = new Set([
  101, 102, 103,
  111, 112, 113,
  121, 122, 123, 124,
  131, 132, 133,
  141, 142, 143,
  201, 202, 203,
  211, 212, 213,
  221, 222, 223, 224,
  231, 232, 233,
  241, 242, 243,
]);

/** CFE DGI que corresponden a notas de crédito. */
export const CFE_TIPOS_NOTA_CREDITO = new Set([181, 182]);

/** Todos los CFE DGI reconocidos (factura + NC + ND). */
export const CFE_TIPOS_DGI_ALL = new Set([
  ...CFE_TIPOS_FACTURA,
  ...CFE_TIPOS_NOTA_CREDITO,
  281, 282,
]);

export type ZetaComprobanteCfeTipoClassification =
  | "factura"
  | "nota_credito"
  | "remito"
  | "factura_interna_cfe0"
  | "recibo"
  | "unknown";

/**
 * Clasifica el tipo de comprobante a partir de CFETipo + metadatos.
 *
 * Regla CFETipo=0 especial (PRESTIS): aceptar como factura_interna_cfe0 si tiene
 * Lineas con Total > 0 y sin FormasPago (documentado en KNOWN-DIVERGENCES.md NOTE-001).
 */
export function classifyComprobanteCfeTipo(
  cfeTipo: number | null,
  hasInvoiceLineas: boolean,
  hasFormasPago: boolean
): ZetaComprobanteCfeTipoClassification {
  if (cfeTipo === null) return "unknown";
  if (cfeTipo === 0) {
    if (hasInvoiceLineas && !hasFormasPago) return "factura_interna_cfe0";
    return "recibo";
  }
  if (CFE_TIPOS_NOTA_CREDITO.has(cfeTipo)) return "nota_credito";
  if (cfeTipo === 281 || cfeTipo === 282) return "remito";
  if (CFE_TIPOS_FACTURA.has(cfeTipo)) return "factura";
  return "unknown";
}

/** Devuelve true si el CFETipo corresponde a una nota de crédito DGI. */
export function isCreditNoteCfeTipo(cfeTipo: number | null | undefined): boolean {
  if (cfeTipo === null || cfeTipo === undefined) return false;
  return CFE_TIPOS_NOTA_CREDITO.has(cfeTipo);
}

// ---------------------------------------------------------------------------
// Shadow / deduplicación CCV1 ↔ saldos pendientes
// ---------------------------------------------------------------------------

/**
 * Detecta si dos filas representan el mismo comprobante vía RegistroId.
 * Se usa para evitar que el pipeline de saldos duplique una fila CCV1 existente.
 *
 * Regla: si ambas filas tienen el mismo RegistroId no vacío → son el mismo comprobante.
 */
export function zetaRowsShareRegistroId(
  registroIdA: string | null,
  registroIdB: string | null
): boolean {
  if (!registroIdA || !registroIdB) return false;
  return registroIdA.trim() === registroIdB.trim();
}

// ---------------------------------------------------------------------------
// Tipos desconocidos — códigos de alerta
// ---------------------------------------------------------------------------

export type ZetaContractAlertCode =
  | "UNKNOWN_MONEDA_CODIGO"
  | "UNKNOWN_CFE_TIPO"
  | "UNKNOWN_COMPROBANTE_CODIGO"
  | "INVOICE_MISSING_REGISTRO_ID"
  | "SALDO_MISSING_REGISTRO_ID"
  | "RECEIPT_VARIOS_USD"
  | "SHADOW_DUPLICATE_REGISTRO_ID"
  | "ZETA_SHAPE_UNKNOWN";

export type ZetaContractAlert = {
  code: ZetaContractAlertCode;
  detail: Record<string, unknown>;
};

/** Comprobantes activos en Zeta UY (catálogo conocido, no exhaustivo). */
export const KNOWN_COMPROBANTE_CODIGOS = new Set([
  "1", "2", "3", "4", "5", "6", "7", "8",
  "101", "102", "103",
  "701", "702",
  "200",
]);

/**
 * Genera alertas para una fila de comprobante con valores fuera del catálogo documentado.
 * Nunca muta la fila ni inventa datos.
 */
export function buildZetaContractAlerts(row: {
  RegistroId: string | null;
  MonedaCodigo: string | null;
  currency_iso: ZetaISOCurrency | null;
  CFETipo?: number | null;
  ComprobanteCodigo?: string | null;
}): ZetaContractAlert[] {
  const alerts: ZetaContractAlert[] = [];

  if (!row.RegistroId) {
    alerts.push({
      code: "INVOICE_MISSING_REGISTRO_ID",
      detail: { moneda: row.MonedaCodigo, comprobante: row.ComprobanteCodigo },
    });
  }

  if (row.MonedaCodigo && row.currency_iso === null) {
    alerts.push({
      code: "UNKNOWN_MONEDA_CODIGO",
      detail: { moneda_codigo: row.MonedaCodigo },
    });
  }

  if (row.CFETipo !== undefined && row.CFETipo !== null) {
    const cfe = row.CFETipo;
    if (cfe !== 0 && !CFE_TIPOS_DGI_ALL.has(cfe)) {
      alerts.push({
        code: "UNKNOWN_CFE_TIPO",
        detail: { cfe_tipo: cfe },
      });
    }
  }

  if (row.ComprobanteCodigo && !KNOWN_COMPROBANTE_CODIGOS.has(row.ComprobanteCodigo)) {
    alerts.push({
      code: "UNKNOWN_COMPROBANTE_CODIGO",
      detail: { comprobante_codigo: row.ComprobanteCodigo },
    });
  }

  return alerts;
}
