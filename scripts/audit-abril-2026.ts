/**
 * Auditoría READ-ONLY: 62 facturas faltantes de abril 2026.
 * Ejecuta §A.1, §A.2, §B.1, §B.3, §E.1 vía Supabase JS client (PostgREST).
 *
 * Usage:
 *   npx tsx scripts/audit-abril-2026.ts
 *
 * Output: temp-audits/audit-abril-2026-results.md
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

function loadEnvLocal(): void {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  const lines = fs.readFileSync(p, "utf-8").split(/\r?\n/);
  for (const raw of lines) {
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const WID          = process.env.AUDIT_WORKSPACE_ID ?? "040321ff-10fd-4da3-aeca-f1865f879986";
const OUTPUT       = path.join(process.cwd(), "temp-audits", "audit-abril-2026-results.md");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function fmtTable(rows: Row[]): string {
  if (!rows.length) return "_Sin resultados_\n";
  const cols = Object.keys(rows[0]!);
  const lines: string[] = [
    "| " + cols.join(" | ") + " |",
    "| " + cols.map(() => "---").join(" | ") + " |",
    ...rows.map(r => "| " + cols.map(c => String(r[c] ?? "null")).join(" | ") + " |"),
  ];
  return lines.join("\n") + "\n";
}

function section(title: string, content: string): string {
  return `\n## ${title}\n\n${content}\n`;
}

function ts(): string {
  return new Date().toISOString();
}

function n(v: unknown): number {
  return Number(v ?? 0);
}

// ---------------------------------------------------------------------------
// §A.1 — Panorama mensual 2026 (all rows)
// ---------------------------------------------------------------------------

async function queryA1() {
  const { data, error } = await db
    .from("proto_invoices")
    .select("issue_date, is_active, category")
    .eq("workspace_company_id", WID)
    .gte("issue_date", "2026-01-01")
    .lt("issue_date", "2027-01-01");

  if (error) return { error: error.message, rows: [] as Row[] };

  const byMonth: Record<string, { total: number; active: number; inactive: number; zeta_vouchers: number; zeta_saldos: number }> = {};
  for (const row of (data ?? []) as Row[]) {
    const ym = String(row.issue_date ?? "").slice(0, 7);
    if (!byMonth[ym]) byMonth[ym] = { total: 0, active: 0, inactive: 0, zeta_vouchers: 0, zeta_saldos: 0 };
    byMonth[ym].total++;
    if (row.is_active === true) byMonth[ym].active++;
    else byMonth[ym].inactive++;
    if (row.category === "Zeta / comprobantes por cliente") byMonth[ym].zeta_vouchers++;
    if (row.category === "Zeta / saldos pendientes") byMonth[ym].zeta_saldos++;
  }

  return {
    error: null,
    rows: Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([ym, v]) => ({
      month_ym: ym,
      total_rows: v.total,
      active_rows: v.active,
      inactive_rows: v.inactive,
      zeta_vouchers: v.zeta_vouchers,
      zeta_saldos: v.zeta_saldos,
    })),
  };
}

// ---------------------------------------------------------------------------
// §A.2 — Totales abril 2026
// ---------------------------------------------------------------------------

async function queryA2() {
  const { data, error } = await db
    .from("proto_invoices")
    .select("id, is_active, archived_at, category, invoice_number, currency_code")
    .eq("workspace_company_id", WID)
    .gte("issue_date", "2026-04-01")
    .lte("issue_date", "2026-04-30");

  if (error) return { error: error.message, rows: [] as Row[] };

  const rows = (data ?? []) as Row[];
  const agg = {
    rows_in_db_april:  rows.length,
    active:            rows.filter(r => r.is_active === true).length,
    inactive:          rows.filter(r => r.is_active === false).length,
    archived:          rows.filter(r => r.archived_at != null).length,
    zeta_vouchers:     rows.filter(r => r.category === "Zeta / comprobantes por cliente").length,
    ccv1_keys:         rows.filter(r => String(r.invoice_number ?? "").startsWith("ZETA:CCV1:")).length,
    legacy_hash_keys:  rows.filter(r => {
      const n = String(r.invoice_number ?? "");
      return n.startsWith("ZETA:CC:") && !n.startsWith("ZETA:CCV1:");
    }).length,
    usd:               rows.filter(r => r.currency_code === "USD").length,
    uyu:               rows.filter(r => r.currency_code === "UYU").length,
    currency_null:     rows.filter(r => r.currency_code == null).length,
  };

  return { error: null, rows: [agg] };
}

// ---------------------------------------------------------------------------
// §A.3 — Status breakdown abril
// ---------------------------------------------------------------------------

async function queryA3() {
  const { data, error } = await db
    .from("proto_invoices")
    .select("status, is_active, total_amount, balance_amount")
    .eq("workspace_company_id", WID)
    .gte("issue_date", "2026-04-01")
    .lte("issue_date", "2026-04-30");

  if (error) return { error: error.message, rows: [] as Row[] };

  const byStatus: Record<string, { n: number; sum_total: number; sum_balance: number; active: number; inactive: number }> = {};
  for (const row of (data ?? []) as Row[]) {
    const s = String(row.status ?? "null");
    if (!byStatus[s]) byStatus[s] = { n: 0, sum_total: 0, sum_balance: 0, active: 0, inactive: 0 };
    byStatus[s].n++;
    byStatus[s].sum_total   += n(row.total_amount);
    byStatus[s].sum_balance += n(row.balance_amount);
    if (row.is_active === true) byStatus[s].active++;
    else byStatus[s].inactive++;
  }

  return {
    error: null,
    rows: Object.entries(byStatus)
      .sort(([, a], [, b]) => b.n - a.n)
      .map(([status, v]) => ({
        status,
        n: v.n,
        sum_total: v.sum_total.toFixed(2),
        sum_balance: v.sum_balance.toFixed(2),
        active: v.active,
        inactive: v.inactive,
      })),
  };
}

// ---------------------------------------------------------------------------
// §B.1 — Metadata con fecha_emision=abril vs issue_date real
// Filtramos con PostgREST: zeta_metadata->>key para acceso JSONB
// ---------------------------------------------------------------------------

async function queryB1() {
  // Fetch all Zeta vouchers, then filter by fecha_emision in JS
  // (PostgREST JSONB filtering is complex; safer to fetch all and filter client-side)
  const { data, error } = await db
    .from("proto_invoices")
    .select("id, invoice_number, issue_date, is_active, category, zeta_metadata, created_at")
    .eq("workspace_company_id", WID)
    .eq("category", "Zeta / comprobantes por cliente");

  if (error) return { error: error.message, rows: [] as Row[], detail: [] as Row[] };

  const rows = (data ?? []) as Row[];

  function getZetaMeta(row: Row): Record<string, unknown> | null {
    const m = row.zeta_metadata as Record<string, unknown> | null;
    if (!m) return null;
    const v = m["zeta_customer_voucher_v1"];
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    return v as Record<string, unknown>;
  }

  function fechaEmisionIsAbril(meta: Record<string, unknown> | null): boolean {
    if (!meta) return false;
    const fe = String(meta["fecha_emision"] ?? "");
    return fe.startsWith("202604") || fe.startsWith("2026-04") || fe.startsWith("2026/04");
  }

  const metaAbril = rows.filter(r => fechaEmisionIsAbril(getZetaMeta(r)));
  const inApril   = metaAbril.filter(r => {
    const d = String(r.issue_date ?? "");
    return d >= "2026-04-01" && d <= "2026-04-30";
  });
  const outside   = metaAbril.filter(r => {
    const d = String(r.issue_date ?? "");
    return d < "2026-04-01" || d > "2026-04-30";
  });

  const summary: Row[] = [{
    total_with_abril_metadata:        metaAbril.length,
    issue_date_in_april:              inApril.length,
    issue_date_OUTSIDE_april:         outside.length,
    combinaciones_serie_numero:       new Set(
      metaAbril.map(r => {
        const m = getZetaMeta(r);
        return `${m?.["serie"] ?? ""}|${m?.["numero"] ?? ""}`;
      })
    ).size,
  }];

  const detail: Row[] = outside.map(r => {
    const m = getZetaMeta(r);
    return {
      id:                String(r.id ?? ""),
      invoice_number:    String(r.invoice_number ?? ""),
      issue_date:        String(r.issue_date ?? ""),
      zeta_fecha_emision: String(m?.["fecha_emision"] ?? ""),
      serie:             String(m?.["serie"] ?? ""),
      numero:            String(m?.["numero"] ?? ""),
      is_active:         String(r.is_active ?? ""),
      created_date:      String(r.created_at ?? "").slice(0, 10),
    };
  });

  return { error: null, rows: summary, detail };
}

// ---------------------------------------------------------------------------
// §B.3 — Filas con issue_date reciente (posible fallback new Date())
// ---------------------------------------------------------------------------

async function queryB3() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const { data, error } = await db
    .from("proto_invoices")
    .select("id, invoice_number, issue_date, is_active, category, zeta_metadata, created_at")
    .eq("workspace_company_id", WID)
    .eq("category", "Zeta / comprobantes por cliente")
    .gte("issue_date", cutoffStr)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return { error: error.message, rows: [] as Row[] };

  function getZetaMeta(row: Row): Record<string, unknown> | null {
    const m = row.zeta_metadata as Record<string, unknown> | null;
    if (!m) return null;
    const v = m["zeta_customer_voucher_v1"];
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    return v as Record<string, unknown>;
  }

  const rows = ((data ?? []) as Row[]).map(r => {
    const m = getZetaMeta(r);
    return {
      id:                String(r.id ?? "").slice(0, 8) + "…",
      invoice_number:    String(r.invoice_number ?? ""),
      issue_date:        String(r.issue_date ?? ""),
      zeta_fecha_emision: String(m?.["fecha_emision"] ?? ""),
      serie:             String(m?.["serie"] ?? ""),
      numero:            String(m?.["numero"] ?? ""),
      is_active:         String(r.is_active ?? ""),
      created_date:      String(r.created_at ?? "").slice(0, 10),
    };
  });

  return { error: null, rows };
}

// ---------------------------------------------------------------------------
// §A.4 — created_at y notes de las 62 filas inactivas de abril (timeline)
// ---------------------------------------------------------------------------

async function queryA4() {
  const { data, error } = await db
    .from("proto_invoices")
    .select("id, invoice_number, issue_date, status, created_at, notes, zeta_metadata")
    .eq("workspace_company_id", WID)
    .eq("is_active", false)
    .gte("issue_date", "2026-04-01")
    .lte("issue_date", "2026-04-30")
    .order("created_at", { ascending: true })
    .limit(80);

  if (error) return { error: error.message, timeline: [] as Row[], notesSummary: [] as Row[], sample: [] as Row[] };

  const rows = ((data ?? []) as Row[]);

  // Aggregate: group by created_date to see timeline
  const byDate: Record<string, number> = {};
  for (const r of rows) {
    const d = String(r.created_at ?? "").slice(0, 10);
    byDate[d] = (byDate[d] ?? 0) + 1;
  }
  const timeline = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([d, cnt]) => ({ created_date: d, count: cnt }));

  // Notes pattern: extract sync_run id from notes like "sync_run:uuid" or other format
  const notePatterns: Record<string, number> = {};
  for (const r of rows) {
    const note = String(r.notes ?? "").slice(0, 60);
    const pattern = note.length > 0 ? note : "(empty)";
    notePatterns[pattern] = (notePatterns[pattern] ?? 0) + 1;
  }
  const notesSummary = Object.entries(notePatterns).sort(([, a], [, b]) => b - a).slice(0, 5).map(([p, cnt]) => ({ notes_pattern: p, count: cnt }));

  // Sample: first 5 rows for deep inspection
  const sample = rows.slice(0, 5).map(r => {
    const meta = r.zeta_metadata as Record<string, unknown> | null;
    const metaKeys = meta ? Object.keys(meta) : [];
    const v1 = meta?.["zeta_customer_voucher_v1"];
    const v1Keys = v1 && typeof v1 === "object" && !Array.isArray(v1) ? Object.keys(v1 as Record<string, unknown>) : [];
    return {
      id:            String(r.id ?? "").slice(0, 8) + "…",
      invoice_number: String(r.invoice_number ?? ""),
      issue_date:    String(r.issue_date ?? ""),
      status:        String(r.status ?? ""),
      created_at:    String(r.created_at ?? "").slice(0, 19),
      notes_short:   String(r.notes ?? "").slice(0, 80),
      meta_top_keys: metaKeys.join(",") || "(null)",
      v1_keys:       v1Keys.join(",") || "(none)",
    };
  });

  return { error: null, timeline, notesSummary, sample };
}

// ---------------------------------------------------------------------------
// §F.1 — Errores detallados del run parcial 5de598bc
// ---------------------------------------------------------------------------

async function queryF1() {
  // Try zeta_sync_run_items first
  const FAILED_RUN_ID = "5de598bc";
  const { data, error } = await db
    .from("zeta_sync_run_items")
    .select("id, run_id, status, error_code, error_message, invoice_number, raw_payload_key")
    .like("run_id", `${FAILED_RUN_ID}%`)
    .eq("status", "error")
    .limit(10);

  if (error) {
    // Table might not exist or column names differ — try alternate approach
    const { data: runs, error: runErr } = await db
      .from("zeta_sync_runs")
      .select("id, error_summary, error_code, records_fetched, records_processed")
      .like("id", `${FAILED_RUN_ID}%`)
      .limit(1);
    if (runErr) return { error: `run_items: ${error.message} | runs: ${runErr.message}`, rows: [] as Row[] };
    return { error: null, rows: ((runs ?? []) as Row[]).map(r => ({
      source: "zeta_sync_runs",
      id: String(r.id ?? "").slice(0, 8) + "…",
      error_summary: String(r.error_summary ?? ""),
      error_code: String(r.error_code ?? ""),
      records_fetched: String(r.records_fetched ?? ""),
      records_processed: String(r.records_processed ?? ""),
    })) };
  }

  return { error: null, rows: ((data ?? []) as Row[]).map(r => ({
    source: "zeta_sync_run_items",
    id: String(r.id ?? "").slice(0, 8) + "…",
    run_id: String(r.run_id ?? "").slice(0, 8) + "…",
    status: String(r.status ?? ""),
    error_code: String(r.error_code ?? ""),
    error_message: String(r.error_message ?? "").slice(0, 120),
    invoice_number: String(r.invoice_number ?? ""),
  })) };
}

// ---------------------------------------------------------------------------
// §E.1 — Corridas pipeline vouchers
// ---------------------------------------------------------------------------

async function queryE1() {
  const { data, error } = await db
    .from("zeta_sync_runs")
    .select("id, resource_flow, sync_mode, status, started_at, finished_at, records_fetched, records_processed, error_summary, error_code, company_id")
    .like("resource_flow", "%voucher%")
    .order("started_at", { ascending: false })
    .limit(20);

  if (error) {
    // Try without filter in case the table name differs
    const { data: data2, error: error2 } = await db
      .from("zeta_sync_runs")
      .select("id, resource_flow, sync_mode, status, started_at, finished_at, records_fetched, records_processed, error_summary, error_code, company_id")
      .order("started_at", { ascending: false })
      .limit(30);

    if (error2) return { error: `${error.message} / ${error2.message}`, rows: [] as Row[] };

    const rows = ((data2 ?? []) as Row[]).map(r => ({
      id:               String(r.id ?? "").slice(0, 8) + "…",
      resource_flow:    String(r.resource_flow ?? ""),
      sync_mode:        String(r.sync_mode ?? ""),
      status:           String(r.status ?? ""),
      started_date:     String(r.started_at ?? "").slice(0, 10),
      finished_date:    String(r.finished_at ?? "").slice(0, 10),
      records_fetched:  String(r.records_fetched ?? "?"),
      records_processed: String(r.records_processed ?? "?"),
      error_summary:    String(r.error_summary ?? "").slice(0, 80),
      company_id_short: String(r.company_id ?? "").slice(0, 8) + "…",
    }));
    return { error: null, rows };
  }

  const rows = ((data ?? []) as Row[]).map(r => ({
    id:               String(r.id ?? "").slice(0, 8) + "…",
    resource_flow:    String(r.resource_flow ?? ""),
    sync_mode:        String(r.sync_mode ?? ""),
    status:           String(r.status ?? ""),
    started_date:     String(r.started_at ?? "").slice(0, 10),
    finished_date:    String(r.finished_at ?? "").slice(0, 10),
    records_fetched:  String(r.records_fetched ?? "?"),
    records_processed: String(r.records_processed ?? "?"),
    error_summary:    String(r.error_summary ?? "").slice(0, 80),
    company_id_short: String(r.company_id ?? "").slice(0, 8) + "…",
  }));
  return { error: null, rows };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`[audit-abril-2026] start — ${ts()}`);
  console.log(`  workspace_company_id: ${WID}`);
  console.log(`  output: ${OUTPUT}`);

  const parts: string[] = [];
  parts.push(`# Auditoría abril 2026 — Resultados\n`);
  parts.push(`**Ejecutado:** ${ts()}\n`);
  parts.push(`**Tenant:** \`${WID}\`\n`);
  parts.push(`**Modo:** READ ONLY — sin modificaciones\n`);

  // §A.1 Panorama mensual
  console.log("  [§A.1] Panorama mensual 2026...");
  const a1 = await queryA1();
  if (a1.error) {
    parts.push(section("§A.1 — Panorama mensual 2026", `**ERROR:** ${a1.error}`));
  } else {
    parts.push(section("§A.1 — Panorama mensual 2026 (todas las filas, todas las categorías)", fmtTable(a1.rows)));
  }

  // §A.2 Totales abril
  console.log("  [§A.2] Totales abril 2026...");
  const a2 = await queryA2();
  if (a2.error) {
    parts.push(section("§A.2 — Totales abril 2026 ⬅ CLAVE", `**ERROR:** ${a2.error}`));
  } else {
    parts.push(section("§A.2 — Totales abril 2026 ⬅ CLAVE", fmtTable(a2.rows)));
    const r = a2.rows[0];
    if (r) {
      const active   = n(r.active);
      const total    = n(r.rows_in_db_april);
      const vouchers = n(r.zeta_vouchers);
      let diag = "";
      if (total === 0) diag = "⚠️  **CERO filas físicas** en abril → las 62 NUNCA se persistieron. Ver §E.1.";
      else if (active < 62) diag = `⚠️  Solo **${active} activas** de 62 esperadas. ${62 - active} faltantes. Inactivas=${n(r.inactive)}.`;
      else diag = `✅  **${active} activas** en abril ≥ 62 esperadas (total DB incluyendo inactivas: ${total}, vouchers Zeta: ${vouchers}).`;
      parts.push(`> ${diag}\n`);
    }
  }

  // §A.3 Status
  console.log("  [§A.3] Status breakdown...");
  const a3 = await queryA3();
  if (!a3.error) {
    parts.push(section("§A.3 — Status breakdown abril 2026", fmtTable(a3.rows)));
  }

  // §B.1 Metadata abril vs issue_date
  console.log("  [§B.1] Metadata abril vs issue_date...");
  const b1 = await queryB1();
  if (b1.error) {
    parts.push(section("§B.1 — Metadata fecha_emision=abril vs issue_date real", `**ERROR:** ${b1.error}`));
  } else {
    parts.push(section("§B.1 — Metadata 'fecha_emision=abril' vs issue_date real (sumario)", fmtTable(b1.rows)));
    const r = b1.rows[0];
    if (r) {
      const outside = n(r.issue_date_OUTSIDE_april);
      if (outside > 0) {
        parts.push(`> ⚠️  **H1 CONFIRMADO: ${outside} filas** tienen fecha_emision=abril en metadata pero issue_date FUERA de abril.\n`);
      } else {
        const inApril = n(r.issue_date_in_april);
        if (inApril > 0) {
          parts.push(`> ✅  Las ${inApril} filas con metadata abril tienen issue_date correcto en abril.\n`);
        } else {
          parts.push(`> ℹ️  Sin filas con fecha_emision de abril en metadata (ni correctas ni desplazadas).\n`);
        }
      }
    }

    if (b1.detail.length > 0) {
      parts.push(section("§B.1 detail — Filas H1 (metadata abril, issue_date fuera)", fmtTable(b1.detail)));
    }
  }

  // §B.3 Fallback new Date()
  console.log("  [§B.3] issue_date reciente (posible fallback)...");
  const b3 = await queryB3();
  if (b3.error) {
    parts.push(section("§B.3 — issue_date en últimos 14 días", `**ERROR:** ${b3.error}`));
  } else {
    parts.push(section("§B.3 — Filas con issue_date en últimos 14 días (posible fallback new Date())", fmtTable(b3.rows)));
    if (b3.rows.length === 0) {
      parts.push(`> ✅  Sin filas con issue_date muy reciente. El fallback no se disparó (o se corrigió).\n`);
    } else {
      const withAbrilMeta = b3.rows.filter(r =>
        r.zeta_fecha_emision && (
          String(r.zeta_fecha_emision).startsWith("202604") ||
          String(r.zeta_fecha_emision).startsWith("2026-04")
        )
      );
      if (withAbrilMeta.length > 0) {
        parts.push(`> ⚠️  **${withAbrilMeta.length} de ${b3.rows.length} filas** con issue_date reciente tienen fecha_emision de abril → H1 activo.\n`);
      } else {
        parts.push(`> ℹ️  ${b3.rows.length} filas con issue_date reciente pero ninguna con fecha_emision de abril.\n`);
      }
    }
  }

  // §A.4 Timeline de filas inactivas
  console.log("  [§A.4] Timeline filas inactivas de abril...");
  const a4 = await queryA4();
  if (a4.error) {
    parts.push(section("§A.4 — Timeline filas inactivas abril", `**ERROR:** ${a4.error}`));
  } else {
    parts.push(section("§A.4 — Creación de las filas inactivas (por fecha)", fmtTable(a4.timeline)));
    if (a4.notesSummary.length > 0) {
      parts.push(section("§A.4b — Notas de las filas inactivas (patrones)", fmtTable(a4.notesSummary)));
    }
    if (a4.sample.length > 0) {
      parts.push(section("§A.4c — Muestra de 5 filas inactivas", fmtTable(a4.sample)));
    }
  }

  // §F.1 Error detail from failed run
  console.log("  [§F.1] Error detail del run parcial...");
  const f1 = await queryF1();
  if (f1.error) {
    parts.push(section("§F.1 — Detalle errores run 5de598bc", `**ERROR:** ${f1.error}`));
  } else {
    parts.push(section("§F.1 — Detalle errores run 5de598bc (muestra)", fmtTable(f1.rows)));
  }

  // §E.1 Sync runs
  console.log("  [§E.1] Corridas pipeline vouchers...");
  const e1 = await queryE1();
  if (e1.error) {
    parts.push(section("§E.1 — Corridas zeta_sync_runs", `**ERROR:** ${e1.error}`));
  } else {
    const voucherRuns = e1.rows.filter(r => String(r.resource_flow).includes("voucher"));
    const displayRows = voucherRuns.length > 0 ? voucherRuns : e1.rows;
    parts.push(section("§E.1 — Corridas pipeline vouchers (últimas corridas)", fmtTable(displayRows)));
    for (const r of displayRows) {
      const date = String(r.started_date ?? "");
      if (date.startsWith("2026-04") || date.startsWith("2026-05")) {
        console.log(`    → ${date} | ${r.status} | fetched=${r.records_fetched} | processed=${r.records_processed}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Diagnóstico final
  // ---------------------------------------------------------------------------
  const a2r = a2.rows[0];
  const b1r = b1.rows[0];

  const active    = a2r ? n(a2r.active)                      : -1;
  const totalInDb = a2r ? n(a2r.rows_in_db_april)            : -1;
  const outside   = b1r ? n(b1r.issue_date_OUTSIDE_april)    : -1;
  const metaAbril = b1r ? n(b1r.total_with_abril_metadata)   : -1;

  let diagnosis = "";

  if (active === -1 || !a2r) {
    diagnosis = "No se pudo determinar el estado (error en §A.2).";
  } else if (totalInDb === 0) {
    diagnosis =
      "**Escenario A: CERO filas físicas en abril 2026.**\n\n" +
      "Las 62 facturas nunca llegaron a la DB. Posibles causas:\n" +
      "- Clasificador las rechazó (H2) — ver §E.1 records_fetched vs processed\n" +
      "- Payload Zeta vacío para abril (bug de filtro Mes/Anio)\n" +
      "- Mismatch de workspace_company_id (H3)\n\n" +
      "**Estrategia:** NO re-sync todavía. Revisar §E.1 primero.";
  } else if (outside > 0) {
    diagnosis =
      `**Escenario H1: ${outside} filas desplazadas** (metadata=abril, issue_date≠abril).\n\n` +
      "El mapper usó fallback `new Date()` cuando la fecha Zeta no parseó correctamente.\n\n" +
      `Filas en DB (abril): ${totalInDb} total | ${active} activas\n` +
      `Filas con metadata abril: ${metaAbril > 0 ? metaAbril : "?"} (${outside} fuera de abril)\n\n` +
      "**Estrategia recomendada:**\n" +
      "1. Script UPDATE acotado: corregir issue_date desde fecha_emision del metadata.\n" +
      "2. Re-sync de abril con mapper ya endurecido (ya implementado — rechaza en vez de fallback).\n" +
      "3. El mapper endurecido evitará que esto vuelva a ocurrir.";
  } else if (active >= 62) {
    diagnosis =
      `**Escenario C: ${active} activas en abril ≥ 62 esperadas.** Las facturas están en DB.\n\n` +
      "Si la reconciliación Excel las reportó como faltantes, el problema es del comparador:\n" +
      "- Filtro de borradores Excel (NOTE-001: Numero≤0 o Emitida=N)\n" +
      "- Formato de fecha en Excel vs issue_date DB\n" +
      "- Filtro de tipo comprobante en el reconciliador\n\n" +
      "**Estrategia:** revisar el reconciliador Excel, NO re-sync.";
  } else {
    const faltantes = 62 - active;
    diagnosis =
      `**Escenario D (parcial): ${active} activas, faltan ${faltantes} de las 62.**\n\n` +
      "Causas posibles combinadas:\n" +
      `- ${faltantes} filas nunca insertadas (clasificador, shape error, bug de filtro)\n` +
      "- Ver §E.1 records_fetched de corridas pasadas\n\n" +
      "**Estrategia:** confirmar con §E.1 si Zeta devolvió las 62 en el payload original.";
  }

  parts.push(section("🔎 Diagnóstico", diagnosis));

  parts.push(section("📋 Plan de acción (NO ejecutar hasta confirmar)", [
    "| Escenario | Acción | Riesgo |",
    "| --- | --- | --- |",
    "| H1 (desplazadas) | Script UPDATE issue_date + re-sync | Bajo — idempotente |",
    "| A (cero filas) | Revisar E.1 → re-sync si fetch OK | Medio — verificar clasificador |",
    "| C (≥62 activas) | Revisar reconciliador Excel | Nulo — no tocar DB |",
    "| D (parcial) | Re-sync tras confirmar E.1 | Bajo — mapper endurecido |",
  ].join("\n")));

  // Write
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, parts.join("\n"), "utf-8");
  console.log(`\n[audit-abril-2026] done → ${OUTPUT}`);
  console.log(`[audit-abril-2026] Escenario: ${diagnosis.split("\n")[0]}`);
}

main().catch(err => {
  console.error("[audit-abril-2026] ERROR:", err);
  process.exit(1);
});
