/**
 * Importación Zeta → proto_contacts (solo INSERT, tenant-scoped).
 * Relaciona cada fila Zeta con `proto_companies` por Codigo Zeta o RUT normalizado (tax_id equivalente).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchZetaContacts, type FetchZetaContactsOptions } from "@/lib/integrations/zeta/zeta-contacts-fetch";
import {
  cleanZetaString,
  mapRutField,
  mapZetaClientToProtoCompanyPreview,
  scrubZetaMappedString,
} from "@/lib/integrations/zeta/zeta-client-mapper";
import { normalizeRutForMatch } from "@/lib/integrations/zeta/zeta-client-import-preview";

function resolveEffectiveBatchLimit(totalRows: number, limitOption: number | undefined): number {
  if (limitOption === undefined) return totalRows;
  const n = Math.floor(Number(limitOption));
  if (!Number.isFinite(n)) return totalRows;
  return Math.min(500, Math.max(1, n));
}

export type ZetaContactsInitialImportOptions = Omit<
  FetchZetaContactsOptions,
  "page" | "esCliente" | "search"
> & {
  limit?: number;
  page?: string;
  esCliente?: string;
  search?: string;
};

export type ZetaContactsInitialImportResult = {
  ok: boolean;
  workspace_company_id: string;
  total_zeta_rows: number;
  batch_limit: number;
  processed: number;
  inserted: number;
  skipped_duplicate: number;
  skipped_no_company: number;
  skipped_missing_identity: number;
  skipped_errors: number;
  warnings: string[];
  errors: string[];
  inserted_ids: string[];
  zeta_request_url: string;
  zeta_http_status: number | null;
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

function normalizeEmail(raw: unknown): string | null {
  const s = cleanZetaString(raw);
  if (!s) return null;
  return s.toLowerCase();
}

function normalizeDedupeName(s: string | null): string | null {
  if (!s) return null;
  const t = s.trim().toLowerCase().replace(/\s+/g, " ");
  return t.length ? t : null;
}

function buildContactFullName(
  raw: Record<string, unknown> | null,
  preview: ReturnType<typeof mapZetaClientToProtoCompanyPreview>
): string | null {
  const nombre = raw ? mapFreeText(raw.Nombre) : null;
  const razon = raw ? mapFreeText(raw.RazonSocial) : null;
  const fromPreview = preview.display_name ?? preview.name;
  return nombre ?? razon ?? (fromPreview ? fromPreview.trim() : null) ?? null;
}

function dedupeKey(companyId: string, email: string | null, fullName: string | null): string | null {
  const em = normalizeEmail(email);
  if (em) return `e:${companyId}|${em}`;
  const nm = normalizeDedupeName(fullName);
  if (nm) return `n:${companyId}|${nm}`;
  return null;
}

async function loadProtoContactsColumns(
  supabase: SupabaseClient
): Promise<{ columns: string[]; warnings: string[] }> {
  const warnings: string[] = [];
  const { data: sample, error: selErr } = await supabase.from("proto_contacts").select("*").limit(1);
  if (selErr) {
    warnings.push(`No se pudo leer muestra de proto_contacts: ${selErr.message}`);
    return { columns: [], warnings };
  }
  const row = (sample ?? [])[0] as Record<string, unknown> | undefined;
  if (!row) {
    return { columns: [], warnings };
  }
  return { columns: Object.keys(row), warnings };
}

export async function loadCompanyLinksForTenant(
  supabase: SupabaseClient,
  workspaceCompanyId: string
): Promise<{
  byCodigo: Map<string, string>;
  byRutNorm: Map<string, string>;
  warnings: string[];
}> {
  const warnings: string[] = [];
  const byCodigo = new Map<string, string>();
  const byRutNorm = new Map<string, string>();
  const { data, error } = await supabase
    .from("proto_companies")
    .select("id,Codigo,RUT")
    .eq("workspace_company_id", workspaceCompanyId);
  if (error || !data) {
    warnings.push(`No se pudieron cargar proto_companies para vínculo: ${error?.message ?? "sin datos"}`);
    return { byCodigo, byRutNorm, warnings };
  }
  for (const row of data as Record<string, unknown>[]) {
    const id = cleanZetaString(row.id);
    if (!id) continue;
    const codigo = mapZetaCode(row.Codigo);
    if (codigo) byCodigo.set(codigo, id);
    const rut = mapRutField(row.RUT);
    const norm = rut ? normalizeRutForMatch(rut) : null;
    if (norm && !byRutNorm.has(norm)) byRutNorm.set(norm, id);
  }
  return { byCodigo, byRutNorm, warnings };
}

async function loadExistingContactDedupeKeys(
  supabase: SupabaseClient,
  workspaceCompanyId: string
): Promise<Set<string>> {
  const keys = new Set<string>();
  const { data, error } = await supabase
    .from("proto_contacts")
    .select("company_id,email,full_name")
    .eq("workspace_company_id", workspaceCompanyId);
  if (error || !data) return keys;
  for (const row of data as Record<string, unknown>[]) {
    const cid = cleanZetaString(row.company_id);
    if (!cid) continue;
    const k = dedupeKey(cid, normalizeEmail(row.email), cleanZetaString(row.full_name));
    if (k) keys.add(k);
  }
  return keys;
}

export function resolveCompanyId(
  raw: Record<string, unknown> | null,
  preview: ReturnType<typeof mapZetaClientToProtoCompanyPreview>,
  byCodigo: Map<string, string>,
  byRutNorm: Map<string, string>
): string | null {
  const codigo = raw ? mapZetaCode(raw.Codigo) : preview.external_id;
  if (codigo && byCodigo.has(codigo)) return byCodigo.get(codigo)!;
  const rut = preview.rut ?? (raw ? mapRutField(raw.RUT) : null);
  const norm = rut ? normalizeRutForMatch(rut) : null;
  if (norm && byRutNorm.has(norm)) return byRutNorm.get(norm)!;
  return null;
}

function firstExistingColumn(columnSet: Set<string>, candidates: string[]): string | undefined {
  for (const c of candidates) {
    if (columnSet.has(c)) return c;
  }
  return undefined;
}

/**
 * Import inicial de contactos desde Zeta (misma fuente que empresas).
 * Dedupe: email + company_id si hay email; si no, full_name normalizado + company_id.
 */
export async function runZetaContactsInitialImport(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  options: ZetaContactsInitialImportOptions = {}
): Promise<ZetaContactsInitialImportResult> {
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
      skipped_duplicate: 0,
      skipped_no_company: 0,
      skipped_missing_identity: 0,
      skipped_errors: 0,
      warnings: ["workspace_company_id vacío: no se importa."],
      errors: ["Falta workspace_company_id (tenant)."],
      inserted_ids: [],
      zeta_request_url: "",
      zeta_http_status: null,
      zeta_rows_extraction_path: null,
    };
  }

  const zeta = await fetchZetaContacts({
    page: options.page,
    esCliente: options.esCliente,
    search: options.search,
  });
  if (!zeta.ok) {
    errors.push(...zeta.errors);
  }
  warnings.push(...zeta.warnings);

  const zetaRows = zeta.ok ? zeta.contacts : [];
  const zetaRowsExtractionPath = zeta.ok ? "QueryOut.Contactos.Contacto" : null;

  console.info("[Zeta clients]", {
    extractedRowCount: zetaRows.length,
    path: zetaRowsExtractionPath,
  });

  const { columns: contactColumns, warnings: colWarn } = await loadProtoContactsColumns(supabase);
  warnings.push(...colWarn);
  const columnSet = new Set(contactColumns);
  if (!columnSet.has("email") && !columnSet.has("full_name") && !columnSet.has("name")) {
    warnings.push(
      "proto_contacts: no hay columnas email ni full_name/name; no se puede importar de forma segura."
    );
    return {
      ok: false,
      workspace_company_id: wid,
      total_zeta_rows: zetaRows.length,
      batch_limit: resolveEffectiveBatchLimit(zetaRows.length, options.limit),
      processed: 0,
      inserted: 0,
      skipped_duplicate: 0,
      skipped_no_company: 0,
      skipped_missing_identity: 0,
      skipped_errors: 0,
      warnings,
      errors: errors.length ? errors : ["Importación cancelada: esquema proto_contacts incompatible."],
      inserted_ids,
      zeta_request_url: zeta.requestUrl,
      zeta_http_status: zeta.httpStatus,
      zeta_rows_extraction_path: zetaRowsExtractionPath,
    };
  }

  const total_zeta_rows = zetaRows.length;
  const batchLimit = resolveEffectiveBatchLimit(total_zeta_rows, options.limit);

  if (!zeta.ok) {
    return {
      ok: false,
      workspace_company_id: wid,
      total_zeta_rows,
      batch_limit: batchLimit,
      processed: 0,
      inserted: 0,
      skipped_duplicate: 0,
      skipped_no_company: 0,
      skipped_missing_identity: 0,
      skipped_errors: 0,
      warnings,
      errors,
      inserted_ids,
      zeta_request_url: zeta.requestUrl,
      zeta_http_status: zeta.httpStatus,
      zeta_rows_extraction_path: zetaRowsExtractionPath,
    };
  }

  const { byCodigo, byRutNorm, warnings: linkWarn } = await loadCompanyLinksForTenant(supabase, wid);
  warnings.push(...linkWarn);

  const existingDedupe = await loadExistingContactDedupeKeys(supabase, wid);
  const batchInFlightDedupe = new Set<string>();

  const batch = zetaRows.slice(0, batchLimit);

  let inserted = 0;
  let skipped_duplicate = 0;
  let skipped_no_company = 0;
  let skipped_missing_identity = 0;
  let skipped_errors = 0;

  const phoneCol = firstExistingColumn(columnSet, ["phone", "telefono", "primary_phone", "mobile", "celular"]);
  const jobCol = firstExistingColumn(columnSet, ["job_title", "title", "role"]);

  for (let i = 0; i < batch.length; i++) {
    const rawRow = batch[i];
    const raw = asRecord(rawRow);
    const preview = mapZetaClientToProtoCompanyPreview(rawRow);
    const company_id = resolveCompanyId(raw, preview, byCodigo, byRutNorm);

    if (!company_id) {
      skipped_no_company += 1;
      warnings.push(
        `Fila ${i + 1}: sin empresa proto_companies vinculable (Codigo Zeta o RUT); omitida.`
      );
      continue;
    }

    const full_name = buildContactFullName(raw, preview);
    const email = preview.email_primary ?? (raw ? mapFreeText(raw.Email1) : null);
    const dk = dedupeKey(company_id, email, full_name);
    if (!dk) {
      skipped_missing_identity += 1;
      warnings.push(`Fila ${i + 1}: sin email ni nombre deduplicable; omitida.`);
      continue;
    }
    if (existingDedupe.has(dk) || batchInFlightDedupe.has(dk)) {
      skipped_duplicate += 1;
      continue;
    }

    const insertRow: Record<string, unknown> = {
      workspace_company_id: wid,
      company_id,
    };

    const displayName =
      full_name ??
      (email && email.includes("@") ? email.split("@")[0]!.trim() || null : null) ??
      "Contacto Zeta";

    if (columnSet.has("full_name")) insertRow.full_name = displayName;
    else if (columnSet.has("name")) insertRow.name = displayName;

    if (columnSet.has("email") && email) insertRow.email = email;

    if (phoneCol && preview.phone) {
      insertRow[phoneCol] = preview.phone;
    }

    if (jobCol && raw) {
      const job = mapFreeText(raw.PropietarioNombre) ?? mapFreeText(raw.GiroNombre);
      if (job) insertRow[jobCol] = job;
    }

    if (columnSet.has("status")) insertRow.status = "active";
    if (columnSet.has("is_active")) insertRow.is_active = true;

    const { data, error } = await supabase.from("proto_contacts").insert(insertRow).select("id").single();

    if (error || !data) {
      skipped_errors += 1;
      warnings.push(`INSERT contacto fila ${i + 1}: ${error?.message ?? "sin fila devuelta"}`);
      continue;
    }

    const id = String((data as { id?: unknown }).id ?? "");
    if (id) inserted_ids.push(id);
    inserted += 1;
    existingDedupe.add(dk);
    batchInFlightDedupe.add(dk);
  }

  const processed = batch.length;

  console.info("[Zeta import contacts initial]", {
    tenant: wid,
    total_zeta_rows,
    processed,
    inserted,
    skipped_duplicate,
    skipped_no_company,
    skipped_missing_identity,
    skipped_errors,
    warnings: warnings.length,
    zeta_rows_extraction_path: zetaRowsExtractionPath,
  });

  return {
    ok: errors.length === 0,
    workspace_company_id: wid,
    total_zeta_rows,
    batch_limit: batchLimit,
    processed,
    inserted,
    skipped_duplicate,
    skipped_no_company,
    skipped_missing_identity,
    skipped_errors,
    warnings,
    errors,
    inserted_ids,
    zeta_request_url: zeta.requestUrl,
    zeta_http_status: zeta.httpStatus,
    zeta_rows_extraction_path: zetaRowsExtractionPath,
  };
}
