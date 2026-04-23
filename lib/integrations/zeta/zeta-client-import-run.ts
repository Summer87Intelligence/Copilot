/**
 * Importación controlada Zeta → proto_companies (solo INSERT, tenant-scoped).
 * Sin UPDATE/UPSERT/delete ni proto_contacts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchZetaClients, type FetchZetaClientsOptions } from "@/lib/integrations/zeta/zeta-clients";
import {
  cleanZetaString,
  mapRutField,
  mapZetaClientToProtoCompanyPreview,
  scrubZetaMappedString,
  type ProtoCompanyMappingPreview,
} from "@/lib/integrations/zeta/zeta-client-mapper";
import { normalizeRutForMatch } from "@/lib/integrations/zeta/zeta-client-import-preview";

/**
 * Sin `limit` en options → procesa todas las filas que devolvió Zeta en esta llamada.
 * Con `limit` explícito → recorte acotado 1..500 (modo debug / lotes pequeños).
 */
function resolveEffectiveBatchLimit(totalRows: number, limitOption: number | undefined): number {
  if (limitOption === undefined) return totalRows;
  const n = Math.floor(Number(limitOption));
  if (!Number.isFinite(n)) return totalRows;
  return Math.min(500, Math.max(1, n));
}

/** Campos Zeta CORE: solo se persisten si existe la columna homónima en proto_companies. */
const ZETA_CORE_COLUMN_KEYS = [
  "Codigo",
  "RazonSocial",
  "Nombre",
  "RUT",
  "Documento",
  "DocumentoSigla",
  "DocumentoTipo",
  "Email1",
  "Telefono",
  "Celular",
  "Direccion",
  "DireccionCompleta",
  "Localidad",
  "GiroNombre",
  "ContactoActivo",
] as const;

const ZETA_METADATA_EXTRA_KEYS = [
  "GrupoCodigo",
  "GrupoNombre",
  "ZonaCodigo",
  "ZonaNombre",
  "PropietarioCodigo",
  "PropietarioNombre",
  "OrigenCodigo",
  "OrigenNombre",
  "NotasCFEs",
  "GiroCodigo",
  "FechaRegistro",
  "EsCliente",
  "EsProveedor",
] as const;

const ZETA_METADATA_SNAPSHOT_KEYS = [
  "Codigo",
  "Documento",
  "DocumentoSigla",
  "DocumentoTipo",
] as const;

export type ZetaCompaniesInitialImportOptions = Omit<
  FetchZetaClientsOptions,
  "page" | "esCliente" | "search"
> & {
  limit?: number;
  page?: string;
  esCliente?: string;
  search?: string;
};

export type ZetaCompaniesInitialImportResult = {
  ok: boolean;
  workspace_company_id: string;
  total_zeta_rows: number;
  batch_limit: number;
  processed: number;
  inserted: number;
  skipped_duplicate_codigo: number;
  skipped_missing_codigo: number;
  skipped_no_codigo_column: number;
  skipped_errors: number;
  columns_detected: string[];
  warnings: string[];
  errors: string[];
  inserted_ids: string[];
  zeta_request_url: string;
  zeta_http_status: number | null;
  /** Dónde el cliente Zeta encontró el array de filas (ver `fetchZetaClients`). */
  zeta_rows_extraction_path: string | null;
};

function asRecord(input: unknown): Record<string, unknown> | null {
  if (input === null || input === undefined) return null;
  if (typeof input !== "object" || Array.isArray(input)) return null;
  return input as Record<string, unknown>;
}

function mapFreeText(raw: unknown): string | null {
  return scrubZetaMappedString(cleanZetaString(raw));
}

function mapZetaCode(raw: unknown): string | null {
  return cleanZetaString(raw);
}

function parseContactoActivo(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s.length === 0) return null;
  const u = s.toUpperCase();
  if (u === "S") return true;
  if (u === "N") return false;
  return null;
}

function valueForCoreColumn(key: (typeof ZETA_CORE_COLUMN_KEYS)[number], raw: Record<string, unknown>): unknown {
  switch (key) {
    case "Codigo":
    case "Documento":
    case "DocumentoSigla":
    case "DocumentoTipo":
      return mapZetaCode(raw[key]);
    case "RUT":
      return mapRutField(raw.RUT);
    case "ContactoActivo":
      return mapZetaCode(raw.ContactoActivo);
    case "Email1":
      return mapFreeText(raw.Email1);
    case "Telefono":
    case "Celular":
    case "Direccion":
    case "DireccionCompleta":
    case "Localidad":
    case "GiroNombre":
    case "RazonSocial":
    case "Nombre":
      return mapFreeText(raw[key]);
    default:
      return null;
  }
}

function buildZetaMetadataPayload(raw: Record<string, unknown>): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  for (const k of ZETA_METADATA_EXTRA_KEYS) {
    if (!(k in raw)) continue;
    const v = cleanZetaString(raw[k]);
    if (v != null) meta[k] = v;
  }
  const snap: Record<string, unknown> = {};
  for (const k of ZETA_METADATA_SNAPSHOT_KEYS) {
    if (!(k in raw)) continue;
    const v = k === "Codigo" ? mapZetaCode(raw[k]) : cleanZetaString(raw[k]);
    if (v != null) snap[k] = v;
  }
  if (Object.keys(snap).length > 0) meta.zeta_snapshot = snap;
  return meta;
}

async function loadProtoCompaniesColumns(
  supabase: SupabaseClient
): Promise<{ columns: string[]; warnings: string[] }> {
  const warnings: string[] = [];
  const { data, error } = await supabase.rpc("copilot_proto_companies_column_names");
  if (!error && Array.isArray(data)) {
    return { columns: data.filter((x): x is string => typeof x === "string"), warnings };
  }
  if (error) {
    warnings.push(
      `No se pudo ejecutar copilot_proto_companies_column_names (${error.message}); se infieren columnas desde una fila de muestra.`
    );
  }
  const { data: sample, error: selErr } = await supabase
    .from("proto_companies")
    .select("*")
    .limit(1);
  if (selErr) {
    warnings.push(`No se pudo leer muestra de proto_companies: ${selErr.message}`);
    return { columns: [], warnings };
  }
  const row = (sample ?? [])[0] as Record<string, unknown> | undefined;
  if (!row) {
    return { columns: [], warnings };
  }
  return { columns: Object.keys(row), warnings };
}

async function fetchExistingCodigosForWorkspace(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  hasCodigoColumn: boolean
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!hasCodigoColumn) return out;
  const { data, error } = await supabase
    .from("proto_companies")
    .select("Codigo")
    .eq("workspace_company_id", workspaceCompanyId);
  if (error || !data) return out;
  for (const row of data as Record<string, unknown>[]) {
    const c = mapZetaCode(row.Codigo);
    if (c) out.add(c);
  }
  return out;
}

async function fetchRutDiagnostics(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  hasRutColumn: boolean
): Promise<Map<string, string>> {
  const byRut = new Map<string, string>();
  if (!hasRutColumn) return byRut;
  const { data, error } = await supabase
    .from("proto_companies")
    .select("id,RUT,Codigo")
    .eq("workspace_company_id", workspaceCompanyId);
  if (error || !data) return byRut;
  for (const row of data as Record<string, unknown>[]) {
    const rut = mapRutField(row.RUT);
    const id = cleanZetaString(row.id);
    if (!rut || !id) continue;
    const norm = normalizeRutForMatch(rut);
    if (!norm) continue;
    if (!byRut.has(norm)) byRut.set(norm, id);
  }
  return byRut;
}

/**
 * Primera importación real: solo empresas nuevas, sin UPDATE.
 * Matching por columna `Codigo` únicamente (no por nombre). RUT solo diagnóstico (warnings).
 */
export async function runZetaCompaniesInitialImport(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  options: ZetaCompaniesInitialImportOptions = {}
): Promise<ZetaCompaniesInitialImportResult> {
  const wid = workspaceCompanyId.trim();
  const warnings: string[] = [];
  const errors: string[] = [];
  const inserted_ids: string[] = [];

  if (!wid) {
    return {
      ok: false,
      workspace_company_id: "",
      total_zeta_rows: 0,
      batch_limit: resolveEffectiveBatchLimit(0, options.limit),
      processed: 0,
      inserted: 0,
      skipped_duplicate_codigo: 0,
      skipped_missing_codigo: 0,
      skipped_no_codigo_column: 0,
      skipped_errors: 0,
      columns_detected: [],
      warnings: ["workspace_company_id vacío: no se importa."],
      errors: ["Falta workspace_company_id (tenant)."],
      inserted_ids: [],
      zeta_request_url: "",
      zeta_http_status: null,
      zeta_rows_extraction_path: null,
    };
  }

  const zeta = await fetchZetaClients({
    page: options.page,
    esCliente: options.esCliente,
    search: options.search,
  });
  console.log("ZETA RAW ROWS:", zeta.extractedRows?.length);
  console.log("ZETA FULL RESPONSE:", zeta);
  errors.push(...zeta.errors);
  warnings.push(...zeta.warnings);

  const { columns: columns_detected, warnings: colWarn } = await loadProtoCompaniesColumns(supabase);
  warnings.push(...colWarn);

  const columnSet = new Set(columns_detected);
  const hasCodigo = columnSet.has("Codigo");
  const hasZetaMetadata = columnSet.has("zeta_metadata");
  const hasRut = columnSet.has("RUT");

  if (!hasCodigo) {
    warnings.push(
      'proto_companies: no existe la columna "Codigo"; no se puede deduplicar ni importar de forma segura. Operación sin inserciones.'
    );
  }
  if (!hasZetaMetadata) {
    warnings.push(
      "proto_companies: no existe la columna zeta_metadata; los campos extendidos de Zeta no se persistirán en JSON."
    );
  }

  const missingCore = ZETA_CORE_COLUMN_KEYS.filter((k) => !columnSet.has(k));
  if (missingCore.length > 0) {
    warnings.push(
      `proto_companies: faltan columnas Zeta CORE (${missingCore.length}): ${missingCore.join(", ")}. Se omiten en INSERT; datos no mapeados pueden quedar solo en zeta_metadata si la columna existe.`
    );
  }

  const total_zeta_rows = zeta.extractedRows.length;
  const batchLimit = resolveEffectiveBatchLimit(total_zeta_rows, options.limit);

  if (!zeta.ok) {
    return {
      ok: false,
      workspace_company_id: wid,
      total_zeta_rows,
      batch_limit: batchLimit,
      processed: 0,
      inserted: 0,
      skipped_duplicate_codigo: 0,
      skipped_missing_codigo: 0,
      skipped_no_codigo_column: hasCodigo ? 0 : zeta.extractedRows.length,
      skipped_errors: 0,
      columns_detected,
      warnings,
      errors,
      inserted_ids,
      zeta_request_url: zeta.requestUrl,
      zeta_http_status: zeta.httpStatus,
      zeta_rows_extraction_path: zeta.zetaRowsExtractionPath,
    };
  }

  const batch = zeta.extractedRows.slice(0, batchLimit);

  if (!hasCodigo) {
    console.info("[Zeta import companies initial]", {
      tenant: wid,
      total_zeta_rows,
      processed: 0,
      inserted: 0,
      columns_detected,
      warnings,
    });
    return {
      ok: false,
      workspace_company_id: wid,
      total_zeta_rows,
      batch_limit: batchLimit,
      processed: 0,
      inserted: 0,
      skipped_duplicate_codigo: 0,
      skipped_missing_codigo: 0,
      skipped_no_codigo_column: batch.length,
      skipped_errors: 0,
      columns_detected,
      warnings,
      errors: errors.length ? errors : ["Importación cancelada: falta columna Codigo."],
      inserted_ids,
      zeta_request_url: zeta.requestUrl,
      zeta_http_status: zeta.httpStatus,
      zeta_rows_extraction_path: zeta.zetaRowsExtractionPath,
    };
  }

  const existingCodigos = await fetchExistingCodigosForWorkspace(supabase, wid, hasCodigo);
  const rutIndex = await fetchRutDiagnostics(supabase, wid, hasRut);

  let inserted = 0;
  let skipped_duplicate_codigo = 0;
  let skipped_missing_codigo = 0;
  let skipped_errors = 0;
  const inBatchCodigos = new Set<string>();

  for (let i = 0; i < batch.length; i++) {
    const rawRow = batch[i];
    const raw = asRecord(rawRow);
    const preview = mapZetaClientToProtoCompanyPreview(rawRow);
    const codigo = hasCodigo ? mapZetaCode(raw?.Codigo ?? preview.external_id) : null;

    if (!codigo) {
      skipped_missing_codigo += 1;
      warnings.push(`Fila ${i + 1}: sin Codigo Zeta; omitida.`);
      continue;
    }

    if (existingCodigos.has(codigo) || inBatchCodigos.has(codigo)) {
      skipped_duplicate_codigo += 1;
      continue;
    }

    const name = buildCompanyName(preview, raw);
    if (!name) {
      skipped_errors += 1;
      warnings.push(`Fila ${i + 1} (Codigo=${codigo}): sin RazonSocial/Nombre para campo name; omitida.`);
      continue;
    }

    if (hasRut && preview.rut) {
      const norm = normalizeRutForMatch(preview.rut);
      const existingId = norm ? rutIndex.get(norm) : undefined;
      if (existingId) {
        warnings.push(
          `Diagnóstico RUT: Codigo ${codigo} tiene RUT que ya existe en otra fila proto_companies (${existingId}); se inserta igual (sin UPDATE; matching solo por Codigo).`
        );
      }
    }

    const insertRow = buildInsertRow({
      wid,
      raw,
      preview,
      name,
      codigo,
      columnSet,
      hasZetaMetadata,
    });

    const { data, error } = await supabase
      .from("proto_companies")
      .insert(insertRow as Record<string, unknown>)
      .select("id")
      .single();

    if (error || !data) {
      skipped_errors += 1;
      warnings.push(
        `INSERT falló Codigo=${codigo}: ${error?.message ?? "sin fila devuelta"}`
      );
      continue;
    }

    const id = String((data as { id?: unknown }).id ?? "");
    if (id) inserted_ids.push(id);
    inserted += 1;
    existingCodigos.add(codigo);
    inBatchCodigos.add(codigo);
    if (hasRut && preview.rut) {
      const norm = normalizeRutForMatch(preview.rut);
      if (norm) rutIndex.set(norm, id);
    }
  }

  const processed = batch.length;

  console.info("[Zeta import companies initial]", {
    tenant: wid,
    total_zeta_rows,
    processed,
    inserted,
    skipped_duplicate_codigo,
    skipped_missing_codigo,
    skipped_errors,
    columns_detected,
    warnings: warnings.length,
    zeta_rows_extraction_path: zeta.zetaRowsExtractionPath,
  });

  return {
    ok: errors.length === 0,
    workspace_company_id: wid,
    total_zeta_rows,
    batch_limit: batchLimit,
    processed,
    inserted,
    skipped_duplicate_codigo,
    skipped_missing_codigo,
    skipped_no_codigo_column: 0,
    skipped_errors,
    columns_detected,
    warnings,
    errors,
    inserted_ids,
    zeta_request_url: zeta.requestUrl,
    zeta_http_status: zeta.httpStatus,
    zeta_rows_extraction_path: zeta.zetaRowsExtractionPath,
  };
}

function buildCompanyName(preview: ProtoCompanyMappingPreview, raw: Record<string, unknown> | null): string {
  const n = preview.name?.trim();
  if (n) return n;
  const razon = mapFreeText(raw?.RazonSocial);
  const nom = mapFreeText(raw?.Nombre);
  return (razon ?? nom ?? "").trim();
}

function buildInsertRow(args: {
  wid: string;
  raw: Record<string, unknown> | null;
  preview: ProtoCompanyMappingPreview;
  name: string;
  codigo: string;
  columnSet: Set<string>;
  hasZetaMetadata: boolean;
}): Record<string, unknown> {
  const { wid, raw, preview, name, codigo, columnSet, hasZetaMetadata } = args;

  const row: Record<string, unknown> = {
    workspace_company_id: wid,
    name,
    status: "active",
    risk_level: "medium",
    is_active: preview.is_active ?? true,
    archived_at: null,
  };

  if (!raw) {
    if (columnSet.has("Codigo")) row.Codigo = codigo;
    if (hasZetaMetadata) row.zeta_metadata = { zeta_snapshot: { Codigo: codigo } };
    return row;
  }

  for (const key of ZETA_CORE_COLUMN_KEYS) {
    if (!columnSet.has(key)) continue;
    const v = valueForCoreColumn(key, raw);
    if (v !== null && v !== undefined) row[key] = v;
  }

  if (columnSet.has("is_active")) {
    const ca = parseContactoActivo(raw.ContactoActivo);
    if (ca !== null) row.is_active = ca;
  }

  if (hasZetaMetadata) {
    row.zeta_metadata = buildZetaMetadataPayload(raw);
  }

  return row;
}
