/**
 * Dry-run de importación Zeta → proto_companies: clasificación sin escritura en base.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ProtoCompanyMappingPreview } from "@/lib/integrations/zeta/zeta-client-mapper";

/** Columnas candidatas en `proto_companies` para código cliente Zeta (orden de preferencia). */
export const PROTO_ZETA_EXTERNAL_ID_COLUMNS = [
  "Codigo",
  "external_id_zeta",
  "zeta_client_code",
  "zeta_codigo",
  "cliente_codigo",
  "erp_external_id",
  "external_id",
] as const;

/** Columnas candidatas para documento / RUT en `proto_companies`. */
export const PROTO_RUT_COLUMNS = [
  "RUT",
  "rut",
  "tax_id",
  "company_rut",
  "document_id",
] as const;

/** Tope de filas `proto_companies` leídas por dry-run (evita lecturas descontroladas). */
export const PROTO_COMPANIES_FETCH_CAP = 10_000;

export type ZetaImportDryRunCategory =
  | "would_insert"
  | "would_update_by_external_id"
  | "would_update_by_rut"
  | "unmatched_without_rut";

export type ZetaImportDryRunMatch = {
  proto_company_id: string;
  /** Columna usada para leer el identificador Zeta en proto (si aplica). */
  proto_external_column?: string;
  proto_external_value?: string;
  proto_rut_column?: string;
  proto_rut_normalized?: string;
};

export type ZetaImportDryRunRow = {
  category: ZetaImportDryRunCategory;
  zeta: ProtoCompanyMappingPreview;
  match?: ZetaImportDryRunMatch;
  flags: string[];
};

export type ZetaImportDryRunSummary = {
  would_insert: number;
  would_update_by_external_id: number;
  would_update_by_rut: number;
  unmatched_without_rut: number;
};

function strCell(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function pickFirstStringColumn(
  row: Record<string, unknown>,
  columns: readonly string[]
): { column: string; value: string } | null {
  for (const col of columns) {
    if (!(col in row)) continue;
    const v = strCell(row[col]);
    if (v) return { column: col, value: v };
  }
  return null;
}

/** Normaliza RUT / documento para comparar (sin espacios, puntos ni guiones). */
export function normalizeRutForMatch(value: string): string {
  return value.replace(/[\s.\-_/]/g, "").toUpperCase();
}

export type ProtoCompaniesColumnHints = {
  hasAnyExternalColumn: boolean;
  hasAnyRutColumn: boolean;
  /** Claves observadas en la primera fila (solo diagnóstico). */
  sampleKeys: string[];
};

function inferColumnHints(sampleRow: Record<string, unknown> | null): ProtoCompaniesColumnHints {
  if (!sampleRow) {
    return {
      hasAnyExternalColumn: false,
      hasAnyRutColumn: false,
      sampleKeys: [],
    };
  }
  const keys = Object.keys(sampleRow);
  const hasAnyExternalColumn = PROTO_ZETA_EXTERNAL_ID_COLUMNS.some((c) => keys.includes(c));
  const hasAnyRutColumn = PROTO_RUT_COLUMNS.some((c) => keys.includes(c));
  return { hasAnyExternalColumn, hasAnyRutColumn, sampleKeys: keys.slice(0, 40) };
}

/**
 * Lee `proto_companies` del workspace (solo SELECT). Respeta tope para no traer tablas enormes sin aviso.
 */
export async function fetchProtoCompaniesForWorkspaceDryRun(
  client: SupabaseClient,
  workspaceCompanyId: string
): Promise<{
  rows: Record<string, unknown>[];
  truncated: boolean;
  error: string | null;
  hints: ProtoCompaniesColumnHints;
}> {
  const wid = workspaceCompanyId.trim();
  const { data, error } = await client
    .from("proto_companies")
    .select("*")
    .eq("workspace_company_id", wid)
    .limit(PROTO_COMPANIES_FETCH_CAP + 1);

  if (error) {
    return {
      rows: [],
      truncated: false,
      error: error.message,
      hints: inferColumnHints(null),
    };
  }

  const list = (data ?? []) as Record<string, unknown>[];
  const truncated = list.length > PROTO_COMPANIES_FETCH_CAP;
  const rows = truncated ? list.slice(0, PROTO_COMPANIES_FETCH_CAP) : list;
  const hints = inferColumnHints(rows[0] ?? null);

  return { rows, truncated, error: null, hints };
}

type IndexMaps = {
  byExternal: Map<string, Record<string, unknown>>;
  byRut: Map<string, Record<string, unknown>>;
  duplicateExternal: string[];
  duplicateRut: string[];
};

function buildProtoIndexes(rows: Record<string, unknown>[]): IndexMaps {
  const byExternal = new Map<string, Record<string, unknown>>();
  const byRut = new Map<string, Record<string, unknown>>();
  const duplicateExternal: string[] = [];
  const duplicateRut: string[] = [];

  for (const row of rows) {
    const extPick = pickFirstStringColumn(row, PROTO_ZETA_EXTERNAL_ID_COLUMNS);
    if (extPick) {
      const k = extPick.value.trim();
      if (byExternal.has(k)) duplicateExternal.push(k);
      else byExternal.set(k, row);
    }

    const rutPick = pickFirstStringColumn(row, PROTO_RUT_COLUMNS);
    if (rutPick) {
      const k = normalizeRutForMatch(rutPick.value);
      if (!k) continue;
      if (byRut.has(k)) duplicateRut.push(rutPick.value);
      else byRut.set(k, row);
    }
  }

  return { byExternal, byRut, duplicateExternal, duplicateRut };
}

function protoId(row: Record<string, unknown>): string {
  return strCell(row.id) ?? "";
}

function buildMatchFromProtoRow(row: Record<string, unknown>): ZetaImportDryRunMatch {
  const extPick = pickFirstStringColumn(row, PROTO_ZETA_EXTERNAL_ID_COLUMNS);
  const rutPick = pickFirstStringColumn(row, PROTO_RUT_COLUMNS);
  return {
    proto_company_id: protoId(row),
    ...(extPick
      ? { proto_external_column: extPick.column, proto_external_value: extPick.value }
      : {}),
    ...(rutPick
      ? {
          proto_rut_column: rutPick.column,
          proto_rut_normalized: normalizeRutForMatch(rutPick.value),
        }
      : {}),
  };
}

/**
 * Clasifica cada preview Zeta contra filas `proto_companies` del tenant.
 * Orden: coincidencia por identificador Zeta en proto; si no, por RUT normalizado; sin ambos → sin matcheo por RUT.
 * No usa `name` como clave de actualización.
 */
export function classifyZetaImportDryRun(
  previews: ProtoCompanyMappingPreview[],
  protoRows: Record<string, unknown>[]
): { rows: ZetaImportDryRunRow[]; summary: ZetaImportDryRunSummary; indexWarnings: string[] } {
  const { byExternal, byRut, duplicateExternal, duplicateRut } = buildProtoIndexes(protoRows);
  const indexWarnings: string[] = [];
  if (duplicateExternal.length > 0) {
    indexWarnings.push(
      `proto_companies: códigos Zeta duplicados en tenant (primer valor gana): ${duplicateExternal.slice(0, 8).join(", ")}${duplicateExternal.length > 8 ? "…" : ""}`
    );
  }
  if (duplicateRut.length > 0) {
    indexWarnings.push(
      `proto_companies: RUT/documento duplicado en tenant (primer valor gana): ${duplicateRut.slice(0, 6).join(", ")}${duplicateRut.length > 6 ? "…" : ""}`
    );
  }

  const out: ZetaImportDryRunRow[] = [];

  for (const zeta of previews) {
    const flags: string[] = [];
    const ext = zeta.external_id?.trim() ?? "";
    const rutNorm = zeta.rut ? normalizeRutForMatch(zeta.rut) : "";

    const rowExt = ext ? byExternal.get(ext) : undefined;
    const rowRut = rutNorm ? byRut.get(rutNorm) : undefined;

    if (rowExt && rowRut && protoId(rowExt) !== protoId(rowRut)) {
      flags.push(
        "conflict: mismo Codigo Zeta matchea una fila y el RUT otra; se aplica regla prioritaria por identificador Zeta (external)."
      );
    }

    if (ext && rowExt) {
      out.push({
        category: "would_update_by_external_id",
        zeta,
        match: buildMatchFromProtoRow(rowExt),
        flags,
      });
      continue;
    }

    if (rutNorm && rowRut) {
      out.push({
        category: "would_update_by_rut",
        zeta,
        match: buildMatchFromProtoRow(rowRut),
        flags,
      });
      continue;
    }

    if (!ext && !rutNorm) {
      out.push({
        category: "unmatched_without_rut",
        zeta,
        flags,
      });
      continue;
    }

    out.push({
      category: "would_insert",
      zeta,
      flags,
    });
  }

  const summary: ZetaImportDryRunSummary = {
    would_insert: 0,
    would_update_by_external_id: 0,
    would_update_by_rut: 0,
    unmatched_without_rut: 0,
  };
  for (const r of out) {
    summary[r.category] += 1;
  }

  return { rows: out, summary, indexWarnings };
}

export function sliceSamplesByCategory(
  rows: ZetaImportDryRunRow[],
  limitPerCategory: number
): Record<ZetaImportDryRunCategory, ZetaImportDryRunRow[]> {
  const buckets: Record<ZetaImportDryRunCategory, ZetaImportDryRunRow[]> = {
    would_insert: [],
    would_update_by_external_id: [],
    would_update_by_rut: [],
    unmatched_without_rut: [],
  };
  for (const r of rows) {
    const b = buckets[r.category];
    if (b.length < limitPerCategory) b.push(r);
  }
  return buckets;
}
