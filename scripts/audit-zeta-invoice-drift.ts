/**
 * Auditoría read-only: drift de invoices Zeta vs proto_invoices.
 *
 * Objetivo: identificar las N facturas locales que existen en proto_invoices
 * pero no aparecen (ni como raw ni como aceptadas) en el fetch actual de Zeta.
 *
 * Uso:
 *   npx tsx scripts/audit-zeta-invoice-drift.ts
 *   npx tsx scripts/audit-zeta-invoice-drift.ts --mes 4 --anio 2026
 *   npx tsx scripts/audit-zeta-invoice-drift.ts --mes 4 --anio 2026 --workspace <uuid>
 *   npx tsx scripts/audit-zeta-invoice-drift.ts --mes 4 --anio 2026 --output drift-abril-2026.json
 *
 * Env (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   ZETA_EMPRESA_CODIGO / ZETA_COMPANY_CODE
 *   ZETA_EMPRESA_CLAVE  / ZETA_COMPANY_KEY
 *   ZETA_DESARROLLADOR_CODIGO / ZETA_DEVELOPER_CODE
 *   ZETA_DESARROLLADOR_CLAVE  / ZETA_DEVELOPER_KEY
 *   AUDIT_WORKSPACE_ID (override workspace, opcional)
 *
 * GARANTÍAS:
 *   - 100% read-only. No escribe en Supabase ni en Zeta.
 *   - No crea resync jobs.
 *   - No toca pipelines ni tablas.
 *   - No aplica heurísticas destructivas.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { fetchZetaCustomerVouchers } from "@/lib/integrations/zeta/zeta-customer-vouchers-fetch";
import type { ZetaCustomerVoucherRecord } from "@/lib/integrations/zeta/zeta-customer-vouchers-fetch";
import type { ZetaCallContext } from "@/lib/integrations/zeta/zeta-http-client";
import {
  resolveZetaCustomerVouchersRestMethod,
  resolveZetaCustomerVouchersRootInKey,
} from "@/lib/integrations/zeta/zeta-customer-vouchers-rest-method";
import { resolveInvokePack } from "@/lib/integrations/zeta/zeta-invoke-resolve-pack";

// ── Cargar .env.local ─────────────────────────────────────────────────────────

function loadEnvLocal(): void {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.ZETA_EMPRESA_CODIGO) return;
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) { console.warn("[env] .env.local no encontrado, usando process.env"); return; }
  for (const raw of fs.readFileSync(p, "utf-8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (k && !process.env[k]) process.env[k] = v;
  }
}

loadEnvLocal();

// ── Args ──────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]) {
  let mes = 4;
  let anio = 2026;
  let workspace = process.env.AUDIT_WORKSPACE_ID ?? "040321ff-10fd-4da3-aeca-f1865f879986";
  let outputFile: string | null = null;

  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--mes"       && argv[i + 1]) { mes = parseInt(argv[++i], 10); }
    if (argv[i] === "--anio"      && argv[i + 1]) { anio = parseInt(argv[++i], 10); }
    if (argv[i] === "--workspace" && argv[i + 1]) { workspace = argv[++i]; }
    if (argv[i] === "--output"    && argv[i + 1]) { outputFile = argv[++i]; }
  }

  if (isNaN(mes) || mes < 1 || mes > 12) { console.error("--mes inválido"); process.exit(1); }
  if (isNaN(anio) || anio < 2020)        { console.error("--anio inválido"); process.exit(1); }

  return { mes, anio, workspace, outputFile };
}

const args = parseArgs(process.argv);
const { mes, anio, workspace: WORKSPACE_ID, outputFile: OUTPUT_FILE } = args;

// ── Supabase ──────────────────────────────────────────────────────────────────

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const supabaseKey  = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
if (!supabaseUrl || !supabaseKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configurados.");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

// ── Tipos ─────────────────────────────────────────────────────────────────────

type RawZetaRow = Record<string, unknown>;

type ClassifierRejectReason = "recibo_text" | "cfe_type_not_dgi" | "no_identity";

type OrphanClassification =
  | "historical_legacy_untraceable" // ZETA:CCV1: + null zeta_registro_id — no es drift operacional
  | "cfe_type_not_dgi"              // en Zeta raw pero rechazado por CFETipo fuera del catálogo DGI
  | "unsupported_document"          // en Zeta raw pero rechazado por texto de recibo
  | "archived_in_zeta"              // no aparece en Zeta raw (probable baja/archivado en Zeta)
  | "stale_local_record"            // no en Zeta, registro local muy viejo vs issue_date
  | "unknown";                      // ninguna de las anteriores

type OrphanRecord = {
  invoice_number:    string;
  registro_id:       string | null;
  issue_date:        string | null;
  is_active:         boolean;
  zeta_cfe_tipo:     string | null;
  zeta_tipo_nombre:  string | null;
  classification:    OrphanClassification;
  classification_reason: string;
  zeta_raw_matched:  boolean;        // el registro_id aparece en el raw fetch de Zeta
  local_created_at:  string | null;
  zeta_metadata_summary: Record<string, unknown>;
};

type AuditReport = {
  period:            string;
  workspace_id:      string;
  executed_at:       string;
  zeta_raw_count:    number;
  zeta_accepted_count: number;
  zeta_classifier_skipped: number;
  local_total_count: number;
  local_accepted_count: number;  // matched to zeta_accepted set
  orphan_count:      number;
  drift_net:         number;     // local_accepted - zeta_accepted
  zeta_pages_fetched: number;
  classifier_skip_breakdown: Record<string, number>;
  orphans:           OrphanRecord[];
  summary:           string;
};

// ── CFE catálogo DGI (idéntico al clasificador de producción) ─────────────────

const CFE_TIPOS_DGI = new Set([
  101, 102, 103,
  111, 112, 113,
  121, 122, 123, 124,
  131, 132, 133,
  141, 142, 143,
  181, 182,
  201, 202, 203,
  211, 212, 213,
  221, 222, 223, 224,
  231, 232, 233,
  241, 242, 243,
  281, 282,
]);

function readOwn(row: RawZetaRow, names: string[]): unknown {
  for (const n of names) {
    if (Object.prototype.hasOwnProperty.call(row, n)) return row[n];
    const want = n.toLowerCase();
    for (const k of Object.keys(row)) {
      if (k.toLowerCase() === want) return row[k];
    }
  }
  return undefined;
}

function parseCfeTipo(row: RawZetaRow): number | null {
  const raw = readOwn(row, ["CFETipo", "cfeTipo", "CfeTipo", "TipoCFE", "tipoCFE", "TipoCfe"]);
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw);
  const n = parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function looksLikeReciboCobranza(row: RawZetaRow): boolean {
  const candidates = [
    readOwn(row, ["TipoComprobanteNombre", "tipoComprobanteNombre"]),
    readOwn(row, ["NombreComprobante", "nombreComprobante"]),
    readOwn(row, ["ComprobanteTipoNombre", "comprobanteTipoNombre"]),
    readOwn(row, ["TipoNombre", "tipoNombre"]),
    readOwn(row, ["Nombre", "nombre"]),
    readOwn(row, ["Descripcion", "descripcion"]),
    readOwn(row, ["TipoComprobante", "tipoComprobante"]),
    readOwn(row, ["ComprobanteNombre", "comprobanteNombre"]),
  ];
  for (const c of candidates) {
    const s = String(c ?? "").toLowerCase();
    if (!s.trim()) continue;
    if (s.includes("recibo de cobranza") || s.includes("recibo de cobro")) return true;
    if (s.includes("recibo") && (s.includes("cobranza") || s.includes("cobro"))) return true;
    const t = s.trim();
    if (t === "recibo" || t.startsWith("recibo ")) return true;
  }
  return false;
}

function classifyZetaRow(row: RawZetaRow): ClassifierRejectReason | null {
  if (looksLikeReciboCobranza(row)) return "recibo_text";
  const cfe = parseCfeTipo(row);
  if (cfe != null && !CFE_TIPOS_DGI.has(cfe)) return "cfe_type_not_dgi";
  return null; // pasa el clasificador
}

function getRegistroId(row: RawZetaRow): string | null {
  const raw = readOwn(row, ["RegistroId", "registroId"]);
  if (raw == null) return null;
  const s = String(raw).trim();
  return s || null;
}

// ── Fetch Zeta usando el fetcher productivo ───────────────────────────────────

async function fetchAllZetaRows(mesStr: string, anioStr: string): Promise<{
  rows: RawZetaRow[];
  pages: number;
}> {
  // Diagnostic: log what will be sent before the first call
  const method   = resolveZetaCustomerVouchersRestMethod();
  const rootKey  = resolveZetaCustomerVouchersRootInKey();
  const packResult = resolveInvokePack();

  if (!packResult.ok) {
    throw new Error(`resolveInvokePack falló: ${packResult.errors.join(", ")}`);
  }

  const { credentials, config } = packResult.pack;
  const url = `${config.baseUrl.replace(/\/+$/, "")}/${method}`;

  console.log("\n[AUDIT DEBUG] ── Zeta request que se enviará ─────────────────");
  console.log("[AUDIT DEBUG] zeta_method :", method);
  console.log("[AUDIT DEBUG] root_in_key :", rootKey);
  console.log("[AUDIT DEBUG] url         :", url);
  console.log("[AUDIT DEBUG] body (sanitizado):", JSON.stringify({
    [rootKey]: {
      Connection: {
        DesarrolladorCodigo: credentials.desarrolladorCodigo,
        DesarrolladorClave:  "[REDACTED]",
        EmpresaCodigo:       credentials.empresaCodigo,
        EmpresaClave:        "[REDACTED]",
        RolCodigo:           credentials.rolCodigo,
      },
      Data: {
        ClienteCodigo: "",
        Mes: mesStr.padStart(2, "0"),
        Anio: anioStr,
        FechaDesde: "",
        FechaHasta: "",
      },
    },
  }, null, 2));
  console.log("[AUDIT DEBUG] ──────────────────────────────────────────────────\n");

  const allRows: RawZetaRow[] = [];
  let pageNum = 1;
  const MAX_PAGES = 200;

  const ctx: ZetaCallContext = { requestId: `audit-${Date.now()}` };
  const filters = { mes: mesStr, anio: anioStr };

  while (pageNum <= MAX_PAGES) {
    process.stdout.write(`  [Zeta] página ${pageNum}…\r`);

    const result = await fetchZetaCustomerVouchers({ ctx, page: String(pageNum), filters });

    if (!result.ok) {
      console.error("\n[AUDIT ERROR] ── Zeta respondió con error ──────────────");
      console.error("[AUDIT ERROR] zeta_method  :", result.zeta_method);
      console.error("[AUDIT ERROR] root_in_key  :", result.root_in_key);
      console.error("[AUDIT ERROR] url          :", result.requestUrl);
      console.error("[AUDIT ERROR] httpStatus   :", result.httpStatus);
      console.error("[AUDIT ERROR] error_code   :", result.error_code);
      console.error("[AUDIT ERROR] errors       :", result.errors);
      console.error("[AUDIT ERROR] raw_response :", JSON.stringify(result.raw, null, 2));
      console.error("[AUDIT ERROR] ──────────────────────────────────────────\n");
      throw new Error(
        `Zeta HTTP ${result.httpStatus ?? "?"} en página ${pageNum} — error_code: ${result.error_code} — ${result.errors.join("; ")}`
      );
    }

    // ZetaCustomerVoucherRecord is Readonly<Record<string,unknown>>; safe to cast for read-only use
    const pageRows = result.rows as RawZetaRow[];
    allRows.push(...pageRows);

    if (!result.hasMore || pageRows.length === 0) break;
    pageNum++;
    await new Promise(r => setTimeout(r, 300)); // pausa cortés entre páginas
  }

  process.stdout.write("\n");
  return { rows: allRows, pages: pageNum };
}

// ── Consulta local ────────────────────────────────────────────────────────────

type LocalInvoice = {
  id:             string;
  invoice_number: string;
  issue_date:     string | null;
  is_active:      boolean;
  created_at:     string;
  zeta_metadata:  Record<string, unknown> | null;
  status:         string | null;
  currency_code:  string | null;
};

async function fetchLocalInvoices(workspaceId: string, mes: number, anio: number): Promise<LocalInvoice[]> {
  const dateFrom = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const dateThru = mes < 12
    ? `${anio}-${String(mes + 1).padStart(2, "0")}-01`
    : `${anio + 1}-01-01`;

  const BATCH = 1000;
  const all: LocalInvoice[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("proto_invoices")
      .select("id, invoice_number, issue_date, is_active, created_at, zeta_metadata, status, currency_code")
      .eq("workspace_company_id", workspaceId)
      .like("invoice_number", "ZETA:%")
      .gte("issue_date", dateFrom)
      .lt("issue_date", dateThru)
      .order("issue_date", { ascending: true })
      .range(from, from + BATCH - 1);

    if (error) throw new Error(`Supabase: ${error.message}`);
    const batch = (data ?? []) as LocalInvoice[];
    all.push(...batch);
    if (batch.length < BATCH) break;
    from += BATCH;
  }

  return all;
}

// ── Extracción de registro_id local ──────────────────────────────────────────

function extractLocalRegistroId(inv: LocalInvoice): string | null {
  const zm = inv.zeta_metadata;
  if (!zm || typeof zm !== "object") return null;

  // Ruta 1: zeta_customer_voucher_v1.zeta_registro_id
  const v1 = (zm as Record<string, unknown>).zeta_customer_voucher_v1;
  if (v1 && typeof v1 === "object") {
    const rid = (v1 as Record<string, unknown>).zeta_registro_id;
    if (rid != null && String(rid).trim()) return String(rid).trim();
    // raw_payload embebido
    const rp = (v1 as Record<string, unknown>).raw_payload;
    if (rp && typeof rp === "object") {
      const rpRid = readOwn(rp as RawZetaRow, ["RegistroId", "registroId"]);
      if (rpRid != null && String(rpRid).trim()) return String(rpRid).trim();
    }
  }

  // Ruta 2: zeta_comprobante_identity_v1.registro_id
  const id_v1 = (zm as Record<string, unknown>).zeta_comprobante_identity_v1;
  if (id_v1 && typeof id_v1 === "object") {
    const rid = (id_v1 as Record<string, unknown>).registro_id;
    if (rid != null && String(rid).trim()) return String(rid).trim();
  }

  return null;
}

function extractZetaMetadataSummary(inv: LocalInvoice): Record<string, unknown> {
  const zm = inv.zeta_metadata;
  if (!zm) return {};
  const v1 = (zm as Record<string, unknown>).zeta_customer_voucher_v1 as Record<string, unknown> | undefined;
  if (!v1) return {};
  return {
    zeta_registro_id:      v1.zeta_registro_id    ?? null,
    zeta_comprobante_codigo: v1.zeta_comprobante_codigo ?? null,
    serie:                 v1.serie               ?? null,
    numero:                v1.numero              ?? null,
    cfe_tipo:              v1.cfe_tipo             ?? null,
    cfe_estado:            v1.cfe_estado           ?? null,
    moneda_codigo:         v1.moneda_codigo        ?? null,
    zeta_cliente_codigo:   v1.zeta_cliente_codigo  ?? null,
    zeta_empresa_codigo:   v1.zeta_empresa_codigo  ?? null,
  };
}

// ── Clasificación de orphans ──────────────────────────────────────────────────

function classifyOrphan(
  inv: LocalInvoice,
  zetaRawRow: RawZetaRow | undefined,
): { classification: OrphanClassification; reason: string } {
  // Historical legacy untraceable: ZETA:CCV1: + no zeta_registro_id.
  // Must be checked first — these are not operational drift, just historical gaps.
  if (
    inv.invoice_number.startsWith("ZETA:CCV1:") &&
    extractLocalRegistroId(inv) === null
  ) {
    return {
      classification: "historical_legacy_untraceable",
      reason: "ZETA:CCV1: sin zeta_registro_id — registro histórico previo a trazabilidad moderna",
    };
  }

  if (zetaRawRow) {
    // Está en Zeta raw pero fue rechazado por el clasificador
    const rejectReason = classifyZetaRow(zetaRawRow);
    if (rejectReason === "recibo_text") {
      return { classification: "unsupported_document", reason: "Zeta raw detectado como recibo de cobranza por texto de tipo" };
    }
    if (rejectReason === "cfe_type_not_dgi") {
      const cfe = parseCfeTipo(zetaRawRow);
      return { classification: "cfe_type_not_dgi", reason: `CFETipo ${cfe} no está en catálogo DGI — rechazado por clasificador` };
    }
    // Tiene registro_id en Zeta raw pero no fue clasificado como rechazado → inconsistencia
    return { classification: "unknown", reason: "En Zeta raw y pasa el clasificador, pero no está en set aceptado local" };
  }

  // No está en Zeta raw en absoluto
  const registroId = extractLocalRegistroId(inv);

  if (!registroId) {
    return { classification: "unknown", reason: "Sin zeta_registro_id en zeta_metadata — origen desconocido" };
  }

  // Detectar si es muy viejo vs issue_date
  const issueDate   = inv.issue_date ? new Date(inv.issue_date).getTime()  : null;
  const createdAt   = inv.created_at ? new Date(inv.created_at).getTime()  : null;
  const daysDelta   = issueDate && createdAt ? Math.abs(createdAt - issueDate) / (86_400_000) : null;
  const isVeryStale = daysDelta !== null && daysDelta > 180;

  if (isVeryStale) {
    return {
      classification: "stale_local_record",
      reason: `No aparece en Zeta, y fue creado ${Math.round(daysDelta!)} días después de issue_date — posible registro obsoleto`,
    };
  }

  // Tiene registro_id, no está en Zeta → probablemente archivado/borrado en Zeta
  return {
    classification: "archived_in_zeta",
    reason: "Tiene RegistroId Zeta pero no aparece en fetch actual — probablemente archivado o eliminado en Zeta",
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const mesStr  = String(mes);
  const anioStr = String(anio);
  const periodLabel = `${anio}-${String(mes).padStart(2, "0")}`;

  console.log("\n════════════════════════════════════════════════════════════");
  console.log(` AUDIT — drift de invoices Zeta vs proto_invoices`);
  console.log(` Período  : ${periodLabel}`);
  console.log(` Workspace: ${WORKSPACE_ID}`);
  console.log("════════════════════════════════════════════════════════════\n");

  // 1. Fetch Zeta raw (todas las páginas, via fetcher productivo)
  console.log("▸ Fetching Zeta…");
  const { rows: zetaRawRows, pages: zetaPages } = await fetchAllZetaRows(mesStr, anioStr);
  console.log(`  → ${zetaRawRows.length} filas raw en ${zetaPages} página(s)`);

  // 2. Clasificar todas las filas Zeta
  const zetaRawByRegistroId = new Map<string, RawZetaRow>();
  const zetaAcceptedRegistroIds = new Set<string>();
  const classifierSkipBreakdown: Record<string, number> = {};

  for (const row of zetaRawRows) {
    const rid = getRegistroId(row);
    if (rid) zetaRawByRegistroId.set(rid, row);

    const reject = classifyZetaRow(row);
    if (reject) {
      classifierSkipBreakdown[reject] = (classifierSkipBreakdown[reject] ?? 0) + 1;
    } else {
      if (rid) zetaAcceptedRegistroIds.add(rid);
    }
  }

  const zetaSkippedCount = Object.values(classifierSkipBreakdown).reduce((a, b) => a + b, 0);
  const zetaAcceptedCount = zetaRawRows.length - zetaSkippedCount;

  console.log(`  → ${zetaAcceptedCount} aceptados por clasificador`);
  console.log(`  → ${zetaSkippedCount} rechazados:`, classifierSkipBreakdown);

  // 3. Fetch local
  console.log("\n▸ Consultando proto_invoices local…");
  const localInvoices = await fetchLocalInvoices(WORKSPACE_ID, mes, anio);
  console.log(`  → ${localInvoices.length} registros locales ZETA: para ${periodLabel}`);

  // 4. Identificar orphans (locales no en set aceptado Zeta)
  const orphans: OrphanRecord[] = [];
  let localAcceptedCount = 0;

  for (const inv of localInvoices) {
    const rid = extractLocalRegistroId(inv);
    if (rid && zetaAcceptedRegistroIds.has(rid)) {
      localAcceptedCount++;
      continue; // OK — está en Zeta aceptado
    }

    // Orphan: en local pero NO en Zeta aceptado
    const zetaRawMatch = rid ? zetaRawByRegistroId.get(rid) : undefined;
    const { classification, reason } = classifyOrphan(inv, zetaRawMatch);

    const v1 = (inv.zeta_metadata as Record<string, unknown> | null)
      ?.zeta_customer_voucher_v1 as Record<string, unknown> | undefined;

    orphans.push({
      invoice_number:    inv.invoice_number,
      registro_id:       rid,
      issue_date:        inv.issue_date,
      is_active:         inv.is_active,
      zeta_cfe_tipo:     v1?.cfe_tipo != null ? String(v1.cfe_tipo) : null,
      zeta_tipo_nombre:  null,
      classification,
      classification_reason: reason,
      zeta_raw_matched:  zetaRawMatch !== undefined,
      local_created_at:  inv.created_at,
      zeta_metadata_summary: extractZetaMetadataSummary(inv),
    });

    // Enriquecer tipo_nombre desde raw si disponible
    if (zetaRawMatch) {
      const tipoNombre = readOwn(zetaRawMatch, [
        "TipoComprobanteNombre", "tipoComprobanteNombre",
        "NombreComprobante", "ComprobanteNombre",
        "TipoNombre", "tipoNombre",
      ]);
      if (tipoNombre != null) {
        orphans[orphans.length - 1].zeta_tipo_nombre = String(tipoNombre);
      }
    }
  }

  const driftNet = localAcceptedCount - zetaAcceptedCount;

  // 5. Imprimir tabla
  console.log(`\n▸ Resultados`);
  console.log(`  Zeta raw total    : ${zetaRawRows.length}`);
  console.log(`  Zeta aceptados    : ${zetaAcceptedCount}`);
  console.log(`  Local total       : ${localInvoices.length}`);
  console.log(`  Local en Zeta OK  : ${localAcceptedCount}`);
  console.log(`  Orphans locales   : ${orphans.length}`);
  console.log(`  Drift neto        : ${driftNet > 0 ? "+" : ""}${driftNet} (local_accepted - zeta_accepted)`);
  console.log();

  if (orphans.length === 0) {
    console.log("✅ Sin orphans — drift es puramente por registros faltantes localmente (missing_registro_ids).\n");
  } else {
    console.log(`⚠  ${orphans.length} orphan(s) locales — detalle:\n`);
    orphans.forEach((o, i) => {
      console.log(`  [${i + 1}] ${o.invoice_number}`);
      console.log(`       registro_id     : ${o.registro_id ?? "—"}`);
      console.log(`       issue_date      : ${o.issue_date ?? "—"}`);
      console.log(`       is_active       : ${o.is_active}`);
      console.log(`       cfe_tipo        : ${o.zeta_cfe_tipo ?? "—"}`);
      console.log(`       tipo_nombre     : ${o.zeta_tipo_nombre ?? "—"}`);
      console.log(`       clasificación   : ${o.classification}`);
      console.log(`       razón           : ${o.classification_reason}`);
      console.log(`       en Zeta raw     : ${o.zeta_raw_matched ? "sí" : "no"}`);
      console.log(`       local_created_at: ${o.local_created_at ?? "—"}`);
      if (Object.keys(o.zeta_metadata_summary).length > 0) {
        console.log(`       zeta_metadata   :`, JSON.stringify(o.zeta_metadata_summary));
      }
      console.log();
    });

    // Resumen por clasificación
    const byClass: Record<string, number> = {};
    for (const o of orphans) byClass[o.classification] = (byClass[o.classification] ?? 0) + 1;
    console.log("  Resumen por clasificación:");
    for (const [cls, count] of Object.entries(byClass).sort(([, a], [, b]) => b - a)) {
      console.log(`    ${cls.padEnd(25)} ${count}`);
    }
    console.log();
  }

  // 6. Recomendación
  console.log("▸ Recomendación de acción:");
  const byClass: Record<string, OrphanRecord[]> = {};
  for (const o of orphans) {
    byClass[o.classification] = byClass[o.classification] ?? [];
    byClass[o.classification].push(o);
  }

  if ((byClass["historical_legacy_untraceable"] ?? []).length > 0) {
    console.log("  historical_legacy → No representan drift operacional. Excluidos del cálculo de severidad.");
    console.log("                      Acción: ninguna. Solo visibilidad histórica.");
  }
  if ((byClass["cfe_type_not_dgi"] ?? []).length > 0) {
    console.log("  cfe_type_not_dgi  → Si son tipos esperados (p.ej. recibos de cobranza cfe), agregar al acknowledged_drift.");
    console.log("                      Si son tipos nuevos de DGI, ampliar CFE_TIPOS_DGI_FACTURA_O_DOCUMENTO_FISCAL.");
  }
  if ((byClass["unsupported_document"] ?? []).length > 0) {
    console.log("  unsupported_doc   → Recibos de cobranza persistidos por error. Evaluar is_active=false + acknowledged_drift.");
  }
  if ((byClass["archived_in_zeta"] ?? []).length > 0) {
    console.log("  archived_in_zeta  → Baja/archivado en Zeta. Evaluar is_active=false en proto_invoices.");
    console.log("                      NO eliminar — preservar auditoría.");
  }
  if ((byClass["stale_local_record"] ?? []).length > 0) {
    console.log("  stale_local_record → Registro muy antiguo vs issue_date. Investigar origen antes de actuar.");
  }
  if ((byClass["unknown"] ?? []).length > 0) {
    console.log("  unknown           → Sin registro_id trazable. Revisar manualmente.");
  }
  console.log();

  // 7. Guardar JSON si se pidió output
  const report: AuditReport = {
    period:                 periodLabel,
    workspace_id:           WORKSPACE_ID,
    executed_at:            new Date().toISOString(),
    zeta_raw_count:         zetaRawRows.length,
    zeta_accepted_count:    zetaAcceptedCount,
    zeta_classifier_skipped: zetaSkippedCount,
    local_total_count:      localInvoices.length,
    local_accepted_count:   localAcceptedCount,
    orphan_count:           orphans.length,
    drift_net:              driftNet,
    zeta_pages_fetched:     zetaPages,
    classifier_skip_breakdown: classifierSkipBreakdown,
    orphans,
    summary: orphans.length === 0
      ? `Sin orphans. Drift de ${Math.abs(driftNet)} registros está en missing_registro_ids (en Zeta, no locales).`
      : `${orphans.length} orphan(s) en local. Ver campo "orphans" para detalle.`,
  };

  if (OUTPUT_FILE) {
    const outPath = path.isAbsolute(OUTPUT_FILE) ? OUTPUT_FILE : path.join(process.cwd(), OUTPUT_FILE);
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8");
    console.log(`▸ Reporte JSON guardado en: ${outPath}`);
  }

  console.log("════════════════════════════════════════════════════════════\n");
}

main().catch(err => {
  console.error("\n[ERROR FATAL]", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
