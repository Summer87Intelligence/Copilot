#!/usr/bin/env node
/**
 * Auditoría de drift Zeta API Contract — read-only.
 *
 * Revisa datos reales en proto_* y detecta:
 *  - CFETipo desconocido (fuera del catálogo DGI)
 *  - ComprobanteCodigo desconocido (fuera del catálogo conocido)
 *  - MonedaCodigo desconocido (distinto de 1/2/UYU/USD)
 *  - Recibo sin cliente válido (ClienteCodigo VARIOS / nulo)
 *  - Factura sin RegistroId en zeta_metadata
 *  - Saldo pendiente (category = "Zeta / saldos pendientes") sin RegistroId
 *  - Shadow duplicado: saldo pendiente con mismo RegistroId que un CCV1
 *  - ClienteCodigo que no matchea ninguna proto_company del workspace
 *
 * Uso:
 *   npx tsx scripts/audit-zeta-api-contract-drift.ts
 *   npx tsx scripts/audit-zeta-api-contract-drift.ts --workspace <uuid>
 *   npx tsx scripts/audit-zeta-api-contract-drift.ts --output tmp/drift-custom.csv
 *
 * Env (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   AUDIT_WORKSPACE_ID (opcional)
 *
 * Output: tmp/zeta-api-contract-drift.csv
 *
 * GARANTÍAS:
 *   100% read-only. No escribe en Supabase. No modifica tablas ni triggers.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  resolveMonedaCodigo,
  normalizeRegistroId,
  zetaReciboIsVarios,
  CFE_TIPOS_DGI_ALL,
  KNOWN_COMPROBANTE_CODIGOS,
} from "@/lib/integrations/zeta/zeta-api-contract";

// ── Env ───────────────────────────────────────────────────────────────────────

function loadEnvLocal(): void {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) {
    console.warn("[env] .env.local no encontrado, usando process.env");
    return;
  }
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

const args = process.argv.slice(2);
function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

const workspaceArg =
  getArg("--workspace") ??
  process.env.WORKSPACE_COMPANY_ID ??
  process.env.AUDIT_WORKSPACE_ID;
const outputPath = getArg("--output") ?? path.join(process.cwd(), "tmp", "zeta-api-contract-drift.csv");

// ── Supabase ──────────────────────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceKey) {
  console.error("[ERROR] Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

// ── Types ─────────────────────────────────────────────────────────────────────

type DriftRow = {
  drift_type: string;
  severity: "BLOCKER" | "WARNING" | "INFO";
  table_name: string;
  row_id: string;
  workspace_company_id: string;
  field_name: string;
  field_value: string;
  detail: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Facturas CCV1 con clave en invoice_number — sin RegistroId Zeta pero trazables localmente. */
function hasSyntheticInvoiceIdentity(invoiceNumber: string): boolean {
  const n = invoiceNumber.trim();
  return n.startsWith("ZETA:CCV1:") || n.startsWith("ZETA:CCV1:NOSER:");
}

function parseReceiptNotes(notes: unknown): Record<string, unknown> {
  if (!notes) return {};
  if (typeof notes === "object") return notes as Record<string, unknown>;
  try {
    return JSON.parse(String(notes)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function readReceiptClienteCodigo(notes: unknown): string | null {
  const parsed = parseReceiptNotes(notes);
  const v1 = parsed["zeta_collection_receipt_v1"] as Record<string, unknown> | undefined;
  const raw = (v1?.raw_payload ?? {}) as Record<string, unknown>;
  const cc =
    (raw["ClienteCodigo"] as string | undefined) ??
    (parsed["cliente_codigo"] as string | undefined) ??
    (parsed["ClienteCodigo"] as string | undefined) ??
    null;
  return cc?.trim() || null;
}

function readReceiptMonedaCodigo(notes: unknown): string | null {
  const parsed = parseReceiptNotes(notes);
  const v1 = parsed["zeta_collection_receipt_v1"] as Record<string, unknown> | undefined;
  const raw = (v1?.raw_payload ?? {}) as Record<string, unknown>;
  const mc =
    (v1?.moneda_codigo as string | undefined) ??
    (raw["MonedaCodigo"] as string | number | undefined) ??
    (parsed["moneda_codigo"] as string | undefined) ??
    null;
  if (mc == null) return null;
  return String(mc).trim() || null;
}

function readMetaRegistroId(zeta_metadata: unknown): string | null {
  if (!zeta_metadata || typeof zeta_metadata !== "object") return null;
  const meta = zeta_metadata as Record<string, unknown>;

  // CCV1 path
  const ccv1 = meta["zeta_customer_voucher_v1"] as Record<string, unknown> | undefined;
  if (ccv1?.zeta_registro_id) return normalizeRegistroId(ccv1.zeta_registro_id);

  // Identity path
  const identity = meta["zeta_comprobante_identity_v1"] as Record<string, unknown> | undefined;
  if (identity?.registro_id) return normalizeRegistroId(identity.registro_id);

  // Direct field in metadata
  if (meta["registro_id"]) return normalizeRegistroId(meta["registro_id"]);

  return null;
}

function readMetaCfeTipo(zeta_metadata: unknown): number | null {
  if (!zeta_metadata || typeof zeta_metadata !== "object") return null;
  const meta = zeta_metadata as Record<string, unknown>;
  const ccv1 = meta["zeta_customer_voucher_v1"] as Record<string, unknown> | undefined;
  const raw = ccv1?.cfe_tipo;
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw);
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

function readMetaMonedaCodigo(zeta_metadata: unknown): string | null {
  if (!zeta_metadata || typeof zeta_metadata !== "object") return null;
  const meta = zeta_metadata as Record<string, unknown>;
  const ccv1 = meta["zeta_customer_voucher_v1"] as Record<string, unknown> | undefined;
  const raw = ccv1?.moneda_codigo ?? (meta as Record<string, unknown>)["moneda_codigo"];
  if (!raw) return null;
  return String(raw).trim() || null;
}

function readMetaComprobanteCodigo(zeta_metadata: unknown): string | null {
  if (!zeta_metadata || typeof zeta_metadata !== "object") return null;
  const meta = zeta_metadata as Record<string, unknown>;
  const ccv1 = meta["zeta_customer_voucher_v1"] as Record<string, unknown> | undefined;
  const raw = ccv1?.zeta_comprobante_codigo ?? (meta as Record<string, unknown>)["comprobante_codigo"];
  if (!raw) return null;
  return String(raw).trim() || null;
}

// ── Workspace resolution ──────────────────────────────────────────────────────

async function resolveWorkspaceIds(): Promise<string[]> {
  if (workspaceArg) return [workspaceArg];
  const { data, error } = await sb
    .from("proto_invoices")
    .select("workspace_company_id")
    .not("workspace_company_id", "is", null)
    .limit(2000);
  if (error || !data) {
    console.warn("[warn] No se pudo resolver workspaces:", error?.message);
    return [];
  }
  return [
    ...new Set(
      (data as { workspace_company_id: string }[]).map((r) => r.workspace_company_id)
    ),
  ];
}

// ── Audit functions ───────────────────────────────────────────────────────────

async function auditProtoInvoices(workspaceIds: string[]): Promise<DriftRow[]> {
  const drift: DriftRow[] = [];

  for (const wid of workspaceIds) {
    const { data, error } = await sb
      .from("proto_invoices")
      .select("id, invoice_number, category, zeta_metadata, currency_code, balance_amount, workspace_company_id")
      .eq("workspace_company_id", wid)
      .limit(5000);

    if (error) {
      console.warn(`[warn] proto_invoices workspace ${wid}:`, error.message);
      continue;
    }
    if (!data) continue;

    const allRows = data as {
      id: string;
      invoice_number: string;
      category: string;
      zeta_metadata: unknown;
      currency_code: string | null;
      balance_amount: number | null;
      workspace_company_id: string;
    }[];

    // Separar CCV1 vs saldos pendientes
    const ccv1Rows = allRows.filter((r) => r.category !== "Zeta / saldos pendientes");
    const shadowRows = allRows.filter((r) => r.category === "Zeta / saldos pendientes");

    // Build CCV1 RegistroId index
    const ccv1RegistroIds = new Set<string>();
    for (const row of ccv1Rows) {
      const rid = readMetaRegistroId(row.zeta_metadata);
      if (rid) ccv1RegistroIds.add(rid);
    }

    for (const row of ccv1Rows) {
      const rid = readMetaRegistroId(row.zeta_metadata);

      // Factura sin RegistroId — BLOCKER solo si balance activo y sin identidad sintética CCV1
      if (!rid) {
        const hasActiveBalance = (row.balance_amount ?? 0) > 0;
        const synthetic = hasSyntheticInvoiceIdentity(row.invoice_number);
        const severity: DriftRow["severity"] =
          hasActiveBalance && !synthetic
            ? "BLOCKER"
            : hasActiveBalance && synthetic
              ? "WARNING"
              : "WARNING";
        drift.push({
          drift_type: "INVOICE_MISSING_REGISTRO_ID",
          severity,
          table_name: "proto_invoices",
          row_id: row.id,
          workspace_company_id: wid,
          field_name: "RegistroId",
          field_value: "null",
          detail: `invoice_number=${row.invoice_number} category=${row.category} balance=${row.balance_amount ?? 0}${synthetic ? " synthetic_ccv1_key" : ""}`,
        });
      }

      // MonedaCodigo desconocido
      const metaMoneda = readMetaMonedaCodigo(row.zeta_metadata);
      if (metaMoneda) {
        const iso = resolveMonedaCodigo(metaMoneda);
        if (iso === null) {
          drift.push({
            drift_type: "UNKNOWN_MONEDA_CODIGO",
            severity: "WARNING",
            table_name: "proto_invoices",
            row_id: row.id,
            workspace_company_id: wid,
            field_name: "MonedaCodigo",
            field_value: metaMoneda,
            detail: `invoice_number=${row.invoice_number}`,
          });
        }
      }

      // CFETipo desconocido (solo para CCV1 con metadata)
      const cfeTipo = readMetaCfeTipo(row.zeta_metadata);
      if (cfeTipo !== null && cfeTipo !== 0 && !CFE_TIPOS_DGI_ALL.has(cfeTipo)) {
        drift.push({
          drift_type: "UNKNOWN_CFE_TIPO",
          severity: "WARNING",
          table_name: "proto_invoices",
          row_id: row.id,
          workspace_company_id: wid,
          field_name: "CFETipo",
          field_value: String(cfeTipo),
          detail: `invoice_number=${row.invoice_number}`,
        });
      }

      // ComprobanteCodigo desconocido
      const cc = readMetaComprobanteCodigo(row.zeta_metadata);
      if (cc && !KNOWN_COMPROBANTE_CODIGOS.has(cc)) {
        drift.push({
          drift_type: "UNKNOWN_COMPROBANTE_CODIGO",
          severity: "INFO",
          table_name: "proto_invoices",
          row_id: row.id,
          workspace_company_id: wid,
          field_name: "ComprobanteCodigo",
          field_value: cc,
          detail: `invoice_number=${row.invoice_number}`,
        });
      }
    }

    // Shadow duplicado: saldo pendiente con mismo RegistroId que CCV1
    for (const row of shadowRows) {
      const rid = readMetaRegistroId(row.zeta_metadata);

      // Saldo pendiente sin RegistroId — shadow rows excluidos del dedup activo → WARNING
      if (!rid) {
        drift.push({
          drift_type: "SALDO_MISSING_REGISTRO_ID",
          severity: "WARNING",
          table_name: "proto_invoices",
          row_id: row.id,
          workspace_company_id: wid,
          field_name: "RegistroId",
          field_value: "null",
          detail: `invoice_number=${row.invoice_number} category=saldos_pendientes balance=${row.balance_amount ?? 0}`,
        });
        continue;
      }

      if (ccv1RegistroIds.has(rid)) {
        drift.push({
          drift_type: "SHADOW_DUPLICATE_REGISTRO_ID",
          severity: "WARNING",
          table_name: "proto_invoices",
          row_id: row.id,
          workspace_company_id: wid,
          field_name: "RegistroId",
          field_value: rid,
          detail: `shadow saldo pendiente duplica CCV1 con RegistroId=${rid}`,
        });
      }
    }
  }

  return drift;
}

async function auditProtoReceipts(workspaceIds: string[]): Promise<DriftRow[]> {
  const drift: DriftRow[] = [];

  for (const wid of workspaceIds) {
    const { data, error } = await sb
      .from("proto_receipts")
      .select("id, receipt_number, notes, currency_code, company_id, workspace_company_id")
      .eq("workspace_company_id", wid)
      .limit(5000);

    if (error) {
      console.warn(`[warn] proto_receipts workspace ${wid}:`, error.message);
      continue;
    }
    if (!data) continue;

    const rows = data as {
      id: string;
      receipt_number: string;
      notes: unknown;
      currency_code: string | null;
      company_id: string | null;
      workspace_company_id: string;
    }[];

    for (const row of rows) {
      const clienteCodigo = readReceiptClienteCodigo(row.notes);

      // Recibo sin cliente válido (VARIOS o null)
      if (!clienteCodigo || zetaReciboIsVarios(clienteCodigo)) {
        drift.push({
          drift_type: "RECEIPT_VARIOS_USD",
          severity: "INFO",
          table_name: "proto_receipts",
          row_id: row.id,
          workspace_company_id: wid,
          field_name: "ClienteCodigo",
          field_value: clienteCodigo ?? "null",
          detail: `receipt_number=${row.receipt_number} company_id=${row.company_id ?? "null"}`,
        });
      }

      // MonedaCodigo desconocido en recibo
      const monedaCodigo = readReceiptMonedaCodigo(row.notes);
      if (monedaCodigo) {
        const iso = resolveMonedaCodigo(monedaCodigo);
        if (iso === null) {
          drift.push({
            drift_type: "UNKNOWN_MONEDA_CODIGO",
            severity: "WARNING",
            table_name: "proto_receipts",
            row_id: row.id,
            workspace_company_id: wid,
            field_name: "MonedaCodigo",
            field_value: monedaCodigo,
            detail: `receipt_number=${row.receipt_number}`,
          });
        }
      }
    }
  }

  return drift;
}

async function auditClienteCodigoVsCompanies(workspaceIds: string[]): Promise<DriftRow[]> {
  const drift: DriftRow[] = [];

  for (const wid of workspaceIds) {
    // Build known ClienteCodigos from proto_companies
    const { data: companies } = await sb
      .from("proto_companies")
      .select("id, Codigo")
      .eq("workspace_company_id", wid)
      .limit(5000);

    const knownCodigos = new Set<string>(
      (companies ?? [])
        .map((c: { Codigo: string | null }) => String(c.Codigo ?? "").trim())
        .filter((s) => s.length > 0)
    );

    if (knownCodigos.size === 0) continue;

    // Check proto_invoices for unmatched ClienteCodigo
    const { data: invoices } = await sb
      .from("proto_invoices")
      .select("id, invoice_number, zeta_metadata, workspace_company_id")
      .eq("workspace_company_id", wid)
      .neq("category", "Zeta / saldos pendientes")
      .limit(5000);

    for (const row of (invoices ?? []) as {
      id: string;
      invoice_number: string;
      zeta_metadata: unknown;
      workspace_company_id: string;
    }[]) {
      const meta = row.zeta_metadata as Record<string, unknown> | null;
      const ccv1 = meta?.["zeta_customer_voucher_v1"] as Record<string, unknown> | undefined;
      const clienteCodigo = (ccv1?.zeta_cliente_codigo as string | undefined)?.trim() ?? null;

      if (clienteCodigo && !knownCodigos.has(clienteCodigo) && !zetaReciboIsVarios(clienteCodigo)) {
        drift.push({
          drift_type: "CLIENTE_CODIGO_NO_MATCH_COMPANY",
          severity: "WARNING",
          table_name: "proto_invoices",
          row_id: row.id,
          workspace_company_id: wid,
          field_name: "ClienteCodigo",
          field_value: clienteCodigo,
          detail: `invoice_number=${row.invoice_number} no matchea proto_companies.Codigo`,
        });
      }
    }
  }

  return drift;
}

// ── CSV output ────────────────────────────────────────────────────────────────

function escapeCsv(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function writeCsv(rows: DriftRow[], filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const header = "drift_type,severity,table_name,row_id,workspace_company_id,field_name,field_value,detail";
  const lines = rows.map((r) =>
    [
      r.drift_type,
      r.severity,
      r.table_name,
      r.row_id,
      r.workspace_company_id,
      r.field_name,
      r.field_value,
      r.detail,
    ]
      .map(escapeCsv)
      .join(",")
  );

  fs.writeFileSync(filePath, [header, ...lines].join("\n") + "\n", "utf-8");
}

// ── Summary ───────────────────────────────────────────────────────────────────

function printSummary(rows: DriftRow[]): void {
  if (rows.length === 0) {
    console.log("\n✓ No se detectó drift de contrato Zeta API.");
    return;
  }

  const blockers = rows.filter((r) => r.severity === "BLOCKER");
  const warnings = rows.filter((r) => r.severity === "WARNING");
  const infos = rows.filter((r) => r.severity === "INFO");

  const byType = new Map<string, { blocker: number; warning: number; info: number }>();
  for (const r of rows) {
    const entry = byType.get(r.drift_type) ?? { blocker: 0, warning: 0, info: 0 };
    if (r.severity === "BLOCKER") entry.blocker++;
    else if (r.severity === "WARNING") entry.warning++;
    else entry.info++;
    byType.set(r.drift_type, entry);
  }

  console.log(`\n⚠ Drift detectado: ${rows.length} fila(s)`);
  console.log(`  🔴 BLOCKER: ${blockers.length}  🟡 WARNING: ${warnings.length}  ⚪ INFO: ${infos.length}\n`);

  for (const [type, counts] of [...byType.entries()].sort()) {
    const parts: string[] = [];
    if (counts.blocker > 0) parts.push(`BLOCKER=${counts.blocker}`);
    if (counts.warning > 0) parts.push(`WARNING=${counts.warning}`);
    if (counts.info > 0) parts.push(`INFO=${counts.info}`);
    console.log(`  ${type.padEnd(40)} ${parts.join(" | ")}`);
  }

  // List unknown comprobante codes
  const unknownCodes = [...new Set(
    rows
      .filter((r) => r.drift_type === "UNKNOWN_COMPROBANTE_CODIGO")
      .map((r) => r.field_value)
  )].sort();
  if (unknownCodes.length > 0) {
    console.log(`\n  UNKNOWN_COMPROBANTE_CODIGO (${unknownCodes.length} códigos únicos): ${unknownCodes.join(", ")}`);
    console.log("  → Agregar a KNOWN_COMPROBANTE_CODIGOS si son válidos para este tenant.");
  }

  // List BLOCKER invoice IDs
  const blockerInvoices = blockers.filter((r) => r.drift_type === "INVOICE_MISSING_REGISTRO_ID");
  if (blockerInvoices.length > 0) {
    console.log(
      `\n  INVOICE_MISSING_REGISTRO_ID BLOCKERs (balance > 0, sin clave CCV1): ${blockerInvoices.length} facturas`
    );
    console.log("  → Ejecutar resync para recuperar RegistroId desde Zeta.");
  }

  const ccv1Warnings = warnings.filter(
    (r) =>
      r.drift_type === "INVOICE_MISSING_REGISTRO_ID" &&
      r.detail.includes("synthetic_ccv1_key")
  );
  if (ccv1Warnings.length > 0) {
    console.log(
      `\n  INVOICE_MISSING_REGISTRO_ID WARNINGs (CCV1 synthetic key): ${ccv1Warnings.length} — legacy pre-RegistroId, no bloquean.`
    );
  }

  console.log("\nAcciones recomendadas:");
  if (byType.has("UNKNOWN_CFE_TIPO"))
    console.log("  - UNKNOWN_CFE_TIPO: revisar catálogo DGI, actualizar CFE_TIPOS_DGI_ALL si Zeta introdujo nuevos tipos.");
  if (byType.has("UNKNOWN_COMPROBANTE_CODIGO"))
    console.log("  - UNKNOWN_COMPROBANTE_CODIGO: ver lista de códigos arriba; agregar válidos a KNOWN_COMPROBANTE_CODIGOS.");
  if (byType.has("UNKNOWN_MONEDA_CODIGO"))
    console.log("  - UNKNOWN_MONEDA_CODIGO: verificar configuración del tenant, solo UYU/USD esperado.");
  if (byType.has("RECEIPT_VARIOS_USD"))
    console.log("  - RECEIPT_VARIOS_USD: recibos en pending_review requieren asignación manual de cliente.");
  if (byType.has("INVOICE_MISSING_REGISTRO_ID"))
    console.log("  - INVOICE_MISSING_REGISTRO_ID: ejecutar resync para recuperar RegistroId desde Zeta (BLOCKERs = balance activo).");
  if (byType.has("SALDO_MISSING_REGISTRO_ID"))
    console.log("  - SALDO_MISSING_REGISTRO_ID: fila shadow sin identidad, excluida del dedup activo (WARNING).");
  if (byType.has("SHADOW_DUPLICATE_REGISTRO_ID"))
    console.log("  - SHADOW_DUPLICATE_REGISTRO_ID: pipeline de saldos insertó fila duplicada; revisar guard buildSaldosDueDatePatch.");
  if (byType.has("CLIENTE_CODIGO_NO_MATCH_COMPANY"))
    console.log("  - CLIENTE_CODIGO_NO_MATCH_COMPANY: cliente Zeta sin empresa local — ejecutar sync de contactos.");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("[audit:zeta-contract] Iniciando auditoría de drift Zeta API Contract…");

  const workspaceIds = await resolveWorkspaceIds();
  if (workspaceIds.length === 0) {
    console.warn("[warn] No se encontraron workspaces para auditar.");
    process.exit(0);
  }

  console.log(`[audit] ${workspaceIds.length} workspace(s): ${workspaceIds.slice(0, 3).join(", ")}${workspaceIds.length > 3 ? "…" : ""}`);

  const [invoiceDrift, receiptDrift, companiesDrift] = await Promise.all([
    auditProtoInvoices(workspaceIds),
    auditProtoReceipts(workspaceIds),
    auditClienteCodigoVsCompanies(workspaceIds),
  ]);

  const allDrift = [...invoiceDrift, ...receiptDrift, ...companiesDrift];

  writeCsv(allDrift, outputPath);
  console.log(`\n[audit] Output: ${outputPath} (${allDrift.length} filas)`);

  printSummary(allDrift);

  const blockers = allDrift.filter((r) => r.severity === "BLOCKER").length;
  const warnings = allDrift.filter((r) => r.severity === "WARNING").length;
  const infos = allDrift.filter((r) => r.severity === "INFO").length;

  console.log(`\n[audit:zeta-contract] BLOCKER: ${blockers} | WARNING: ${warnings} | INFO: ${infos}`);

  if (blockers > 0) {
    console.error(`[audit:zeta-contract] FAIL — ${blockers} BLOCKER(s) requieren acción.`);
    process.exit(1);
  }

  console.log("[audit:zeta-contract] PASS — sin BLOCKERs (solo WARNING/INFO aceptables).");
}

main().catch((err) => {
  console.error("[audit:zeta-contract] Error fatal:", err);
  process.exit(1);
});
