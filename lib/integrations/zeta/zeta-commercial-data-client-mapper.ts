/**
 * Mapeo Zeta (fila datos comerciales cliente) → payload versionado para Copilot / `proto_companies.zeta_metadata`.
 */

import type { ZetaCommercialClientRecord } from "@/lib/integrations/zeta/contracts/zeta-commercial-data-client.contract";
import { cleanZetaString, mapRutField, scrubZetaMappedString } from "@/lib/integrations/zeta/zeta-client-mapper";

export const COPILOT_COMMERCIAL_CLIENT_METADATA_KEY = "commercial_client_v1" as const;

export type CopilotCommercialClientV1 = {
  schema_version: 1;
  zeta_codigo: string | null;
  categoria_codigo: string | null;
  categoria_nombre: string | null;
  condicion_pago_codigo: string | null;
  condicion_pago_nombre: string | null;
  vendedor_codigo: string | null;
  lista_precios_codigo: string | null;
  moneda_codigo: string | null;
  limite_credito_monto: string | null;
  limite_credito_dias: string | null;
  estado_comercial_activo: boolean | null;
  rut_documento: string | null;
  nombre_display: string | null;
  local_codigo: string | null;
  local_nombre: string | null;
  observaciones: string | null;
  descuento_pct_1: number | null;
  descuento_pct_2: number | null;
  descuento_pct_3: number | null;
  raw_payload: Record<string, unknown>;
};

function readOwn(row: ZetaCommercialClientRecord, names: readonly string[]): unknown {
  for (const n of names) {
    if (Object.prototype.hasOwnProperty.call(row, n)) return row[n];
    const want = n.toLowerCase();
    for (const k of Object.keys(row)) {
      if (k.toLowerCase() === want) return row[k];
    }
  }
  return undefined;
}

function mapFreeText(raw: unknown): string | null {
  return scrubZetaMappedString(cleanZetaString(raw));
}

function yn(raw: unknown): boolean | null {
  const s = cleanZetaString(raw);
  if (!s) return null;
  const u = s.toUpperCase();
  if (u === "S" || u === "Y" || u === "1" || u === "TRUE") return true;
  if (u === "N" || u === "0" || u === "FALSE") return false;
  return null;
}

function parsePct(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function readRutFromRow(row: ZetaCommercialClientRecord): string | null {
  const direct = mapRutField(readOwn(row, ["Rut", "RUT", "rut", "Documento", "documento"]));
  if (direct) return direct;
  return null;
}

/**
 * Estructura interna estable para enriquecer CRM / riesgo / cobranza (sin tablas nuevas).
 */
export function mapZetaCommercialClientToCopilot(row: ZetaCommercialClientRecord): CopilotCommercialClientV1 {
  const raw_payload: Record<string, unknown> = {};
  for (const k of Object.keys(row)) {
    raw_payload[k] = row[k];
  }

  const codigo = cleanZetaString(readOwn(row, ["Codigo", "codigo"]));

  return {
    schema_version: 1,
    zeta_codigo: codigo,
    categoria_codigo: cleanZetaString(readOwn(row, ["CategoriaCodigo", "categoriaCodigo"])),
    categoria_nombre: mapFreeText(readOwn(row, ["CategoriaNombre", "categoriaNombre"])),
    condicion_pago_codigo: cleanZetaString(readOwn(row, ["CondicionCodigo", "condicionCodigo"])),
    condicion_pago_nombre: mapFreeText(readOwn(row, ["CondicionNombre", "condicionNombre"])),
    vendedor_codigo: cleanZetaString(readOwn(row, ["VendedorCodigo", "vendedorCodigo"])),
    lista_precios_codigo: cleanZetaString(
      readOwn(row, ["PrecioVentaCodigo", "precioVentaCodigo", "ListaPrecioCodigo", "listaPrecioCodigo"])
    ),
    moneda_codigo: cleanZetaString(readOwn(row, ["MonedaCodigo", "monedaCodigo"])),
    limite_credito_monto: cleanZetaString(readOwn(row, ["TopeCreditoMonto", "topeCreditoMonto", "LimiteCredito", "limiteCredito"])),
    limite_credito_dias: cleanZetaString(
      readOwn(row, ["TopACreditoDias", "topACreditoDias", "CTopeCreditoDias", "cTopeCreditoDias", "TopeCreditoDias", "topeCreditoDias"])
    ),
    estado_comercial_activo: yn(readOwn(row, ["Activo", "activo", "ContactoActivo", "contactoActivo"])),
    rut_documento: readRutFromRow(row),
    nombre_display: mapFreeText(readOwn(row, ["Nombre", "nombre", "RazonSocial", "razonSocial"])),
    local_codigo: cleanZetaString(readOwn(row, ["LocalCodigo", "localCodigo"])),
    local_nombre: mapFreeText(readOwn(row, ["LocalNombre", "localNombre"])),
    observaciones: mapFreeText(readOwn(row, ["Notas", "notas", "Observaciones", "observaciones"])),
    descuento_pct_1: parsePct(readOwn(row, ["PorcentajeDto1", "porcentajeDto1"])),
    descuento_pct_2: parsePct(readOwn(row, ["PorcentajeDto2", "porcentajeDto2"])),
    descuento_pct_3: parsePct(readOwn(row, ["PorcentajeDto3", "porcentajeDto3"])),
    raw_payload,
  };
}
