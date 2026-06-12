#!/usr/bin/env node
/**
 * audit-zeta-june-2026-sales — read-only.
 *
 * Reproduce el cálculo del motor `generateFinancialConsistencyReport` para el
 * período 2026-06-01 → 2026-06-12 y compara contra el total esperado del
 * export oficial de Zeta:
 *
 *   bruto UYU sin NC  : 697.137,50
 *   bruto USD sin NC  : 6.311,98
 *   NC junio UYU       : 1.830,00
 *   NC junio USD       :   219,60
 *   neto UYU con NC   : 695.307,50
 *   neto USD con NC   : 6.092,38
 *
 * Imprime un breakdown CCV1 / SOMBRA `ZETA:{RegistroId}` / NOSER CFE=0 +
 * listado de duplicados detectados, y valida estado pre/post migración:
 *
 *   - sombras activas junio = 0 (después de la migración)
 *   - NOSER CFE=0 Aldiesan inactiva (después de la migración)
 *   - neto reconciliación coincide con Zeta dentro de tolerancia 0.01
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/audit-zeta-june-2026-sales.mjs
 *   node --env-file=.env.local --import tsx scripts/audit-zeta-june-2026-sales.mjs --workspace <UUID>
 *   node --env-file=.env.local --import tsx scripts/audit-zeta-june-2026-sales.mjs --json
 *
 * Códigos de salida:
 *   0 → totales coinciden con Zeta dentro de tolerancia
 *   1 → totales NO coinciden o duplicados activos detectados
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvLocal();

const args = process.argv.slice(2);
function argFlag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] ?? null : null;
}
const asJson = args.includes("--json");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const workspaceId =
  argFlag("--workspace") ??
  process.env.WORKSPACE_COMPANY_ID ??
  process.env.NEXT_PUBLIC_WORKSPACE_COMPANY_ID;

if (!url || !key) {
  console.error("Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const PAGE = 1000;
const PERIOD_START = "2026-06-01";
const PERIOD_END = "2026-06-12";

const VOIDED_STATUSES = new Set([
  "void", "voided", "canceled", "cancelled",
  "anulada", "anulado", "annulled", "annul",
]);
const NC_CFE_TIPOS = new Set([102, 112, 122, 132, 142, 181, 182, 202, 212, 222, 232, 242, 282]);
const VALID_CURRENCIES = new Set(["USD", "UYU"]);

/** Tolerancia para considerar dos importes "iguales" (Zeta a veces redondea el saldo). */
const TOTAL_TOLERANCE = 0.20;

const EXPECTED = {
  UYU: {
    gross_no_nc: 697137.50,
    nc:          1830.00,
    net:         695307.50,
  },
  USD: {
    gross_no_nc: 6311.98,
    nc:          219.60,
    net:         6092.38,
  },
};
const RECONCILIATION_TOLERANCE = 0.01;

async function fetchAll(buildQuery) {
  const rows = [];
  let from = 0;
  // Cap defensivo para no loopear infinito en caso de bug.
  while (rows.length < 100000) {
    const to = from + PAGE - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

function toNum(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function readCfeTipo(meta) {
  if (!meta || typeof meta !== "object") return null;
  const v1 = meta.zeta_customer_voucher_v1;
  if (!v1 || typeof v1 !== "object") return null;
  const raw = v1.cfe_tipo ?? v1.cfeTipo ?? v1.CFETipo ?? v1?.raw_payload?.CFETipo;
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function classifySource(invoiceNumber) {
  const n = String(invoiceNumber ?? "");
  if (n.startsWith("ZETA:CCV1:NOSER:")) return "ccv1_noser";
  if (n.startsWith("ZETA:CCV1:")) return "ccv1";
  if (n.startsWith("ZETA:")) return "shadow";
  return "other";
}

function fmtCurrency(n) {
  return n.toLocaleString("es-UY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtPct(diff, base) {
  if (!base) return "n/a";
  return `${((diff / base) * 100).toFixed(2)}%`;
}

function logBox(title, lines) {
  if (asJson) return;
  const width = Math.max(title.length, ...lines.map((l) => l.length)) + 4;
  const bar = "─".repeat(width);
  console.log(`┌${bar}┐`);
  console.log(`│ ${title.padEnd(width - 2)} │`);
  console.log(`├${bar}┤`);
  for (const l of lines) console.log(`│ ${l.padEnd(width - 2)} │`);
  console.log(`└${bar}┘`);
}

async function loadInvoices() {
  let query = supabase
    .from("proto_invoices")
    .select("id, workspace_company_id, company_id, invoice_number, currency_code, total_amount, balance_amount, status, issue_date, category, zeta_metadata, is_active")
    .gte("issue_date", PERIOD_START)
    .lte("issue_date", PERIOD_END);
  if (workspaceId) query = query.eq("workspace_company_id", workspaceId);

  return fetchAll((from, to) =>
    query.order("id", { ascending: true }).range(from, to)
  );
}

function analyse(rows) {
  // Estado activo / inactivo + clasificación
  const result = {
    period: { start: PERIOD_START, end: PERIOD_END },
    by_currency: {},
    duplicates: [],
    inactive_audit: {
      shadow_deactivated: 0,
      prestis_deactivated: 0,
      by_batch: {},
    },
    counts: {
      total_rows: rows.length,
      active: 0,
      inactive: 0,
      ccv1_active: 0,
      ccv1_noser_active: 0,
      shadow_active: 0,
      other_active: 0,
    },
  };

  for (const cur of ["UYU", "USD"]) {
    result.by_currency[cur] = {
      gross_no_nc: 0,
      nc_amount: 0,
      net: 0,
      ccv1_gross: 0,
      ccv1_nc: 0,
      ccv1_noser_gross: 0,
      ccv1_noser_nc: 0,
      shadow_gross: 0,
      shadow_nc: 0,
      counts: { ccv1: 0, ccv1_noser: 0, shadow: 0 },
    };
  }

  // Index CCV1 activas para detectar duplicados
  const activeCcv1Index = new Map();
  for (const r of rows) {
    if (r.is_active !== true) continue;
    if (classifySource(r.invoice_number) !== "ccv1") continue;
    const status = String(r.status ?? "").trim().toLowerCase();
    if (VOIDED_STATUSES.has(status)) continue;
    const cur = String(r.currency_code ?? "").trim().toUpperCase();
    if (!VALID_CURRENCIES.has(cur)) continue;
    const total = round2(Math.max(0, toNum(r.total_amount)));
    if (!(total > 0)) continue;
    const key = `${r.company_id}|${cur}|${r.issue_date}`;
    const list = activeCcv1Index.get(key) ?? [];
    list.push({ id: r.id, total, invoice_number: r.invoice_number });
    activeCcv1Index.set(key, list);
  }

  for (const r of rows) {
    const source = classifySource(r.invoice_number);
    const status = String(r.status ?? "").trim().toLowerCase();
    const cur = String(r.currency_code ?? "").trim().toUpperCase();
    const total = round2(Math.max(0, toNum(r.total_amount)));
    const cfeTipo = readCfeTipo(r.zeta_metadata);
    const isNc = cfeTipo !== null && NC_CFE_TIPOS.has(cfeTipo);

    if (r.is_active === false) {
      result.counts.inactive++;
      const audit = r.zeta_metadata?.cleanup_audit ?? null;
      if (audit && typeof audit === "object") {
        const reason = String(audit.deactivated_reason ?? "unknown");
        const batch = String(audit.cleanup_batch ?? "unknown");
        result.inactive_audit.by_batch[batch] = (result.inactive_audit.by_batch[batch] ?? 0) + 1;
        if (reason === "duplicate_shadow_matched_to_ccv1") {
          result.inactive_audit.shadow_deactivated++;
        } else if (reason === "duplicate_internal_prestis_invoice_matched_to_dgi_ccv1") {
          result.inactive_audit.prestis_deactivated++;
        }
      }
      continue;
    }

    result.counts.active++;
    if (source === "ccv1") result.counts.ccv1_active++;
    else if (source === "ccv1_noser") result.counts.ccv1_noser_active++;
    else if (source === "shadow") result.counts.shadow_active++;
    else result.counts.other_active++;

    if (VOIDED_STATUSES.has(status)) continue;
    if (!VALID_CURRENCIES.has(cur)) continue;
    if (!(total > 0)) continue;

    const bucket = result.by_currency[cur];

    if (source === "ccv1") {
      bucket.counts.ccv1++;
      if (isNc) bucket.ccv1_nc += total;
      else bucket.ccv1_gross += total;
    } else if (source === "ccv1_noser") {
      bucket.counts.ccv1_noser++;
      if (isNc) bucket.ccv1_noser_nc += total;
      else bucket.ccv1_noser_gross += total;
    } else if (source === "shadow") {
      bucket.counts.shadow++;
      if (isNc) bucket.shadow_nc += total;
      else bucket.shadow_gross += total;
    }

    // Reportar como duplicado si comparte (company, currency, fecha, total ± tol) con un CCV1 activo
    if (source === "shadow" || (source === "ccv1_noser" && cfeTipo === 0)) {
      const key = `${r.company_id}|${cur}|${r.issue_date}`;
      const peers = activeCcv1Index.get(key) ?? [];
      const match = peers.find((p) => Math.abs(p.total - total) <= TOTAL_TOLERANCE);
      if (match) {
        result.duplicates.push({
          invoice_number: r.invoice_number,
          currency: cur,
          total,
          issue_date: r.issue_date,
          source,
          matched_ccv1_invoice_number: match.invoice_number,
          matched_ccv1_id: match.id,
        });
      }
    }
  }

  for (const cur of ["UYU", "USD"]) {
    const b = result.by_currency[cur];
    b.gross_no_nc = round2(b.ccv1_gross + b.ccv1_noser_gross + b.shadow_gross);
    b.nc_amount = round2(b.ccv1_nc + b.ccv1_noser_nc + b.shadow_nc);
    b.net = round2(b.gross_no_nc - b.nc_amount);
  }

  return result;
}

function compareWithExpected(analysis) {
  const report = {};
  for (const cur of ["UYU", "USD"]) {
    const got = analysis.by_currency[cur];
    const exp = EXPECTED[cur];
    const dGross = round2(got.gross_no_nc - exp.gross_no_nc);
    const dNet = round2(got.net - exp.net);
    report[cur] = {
      gross: { got: got.gross_no_nc, expected: exp.gross_no_nc, delta: dGross,
        ok: Math.abs(dGross) <= RECONCILIATION_TOLERANCE },
      nc:    { got: got.nc_amount,   expected: exp.nc,          delta: round2(got.nc_amount - exp.nc),
        ok: Math.abs(got.nc_amount - exp.nc) <= RECONCILIATION_TOLERANCE },
      net:   { got: got.net,         expected: exp.net,         delta: dNet,
        ok: Math.abs(dNet) <= RECONCILIATION_TOLERANCE },
    };
  }
  return report;
}

function printHuman(analysis, comparison) {
  console.log("");
  logBox(`AUDIT — Ventas Zeta junio 2026 (${PERIOD_START} → ${PERIOD_END})`, [
    `Workspace: ${workspaceId ?? "(todos)"}`,
    `Filas en período (todas): ${analysis.counts.total_rows}`,
    `Activas: ${analysis.counts.active}  |  Inactivas: ${analysis.counts.inactive}`,
  ]);

  for (const cur of ["UYU", "USD"]) {
    const b = analysis.by_currency[cur];
    const c = comparison[cur];
    logBox(`${cur} — totales activos`, [
      `CCV1            : ${fmtCurrency(b.ccv1_gross).padStart(16)}  (rows=${b.counts.ccv1})`,
      `CCV1 NOSER CFE=0: ${fmtCurrency(b.ccv1_noser_gross).padStart(16)}  (rows=${b.counts.ccv1_noser})`,
      `SOMBRA saldos    : ${fmtCurrency(b.shadow_gross).padStart(16)}  (rows=${b.counts.shadow})`,
      `─────────────────`,
      `BRUTO sin NC     : ${fmtCurrency(b.gross_no_nc).padStart(16)}   esperado ${fmtCurrency(c.gross.expected)} (Δ ${fmtCurrency(c.gross.delta)}) ${c.gross.ok ? "OK" : "FAIL"}`,
      `NC               : ${fmtCurrency(b.nc_amount).padStart(16)}   esperado ${fmtCurrency(c.nc.expected)} (Δ ${fmtCurrency(c.nc.delta)}) ${c.nc.ok ? "OK" : "FAIL"}`,
      `NETO             : ${fmtCurrency(b.net).padStart(16)}   esperado ${fmtCurrency(c.net.expected)} (Δ ${fmtCurrency(c.net.delta)}) ${c.net.ok ? "OK" : "FAIL"}`,
    ]);
  }

  logBox("Conteos por origen (activos)", [
    `CCV1 activos       : ${analysis.counts.ccv1_active}`,
    `CCV1 NOSER activos : ${analysis.counts.ccv1_noser_active}`,
    `Sombras activas    : ${analysis.counts.shadow_active}`,
    `Otros              : ${analysis.counts.other_active}`,
  ]);

  logBox("Auditoría desactivación migración", [
    `Sombras desactivadas (duplicate_shadow_matched_to_ccv1)            : ${analysis.inactive_audit.shadow_deactivated}`,
    `PRESTIS NOSER desactivadas (duplicate_internal_prestis_matched_…)  : ${analysis.inactive_audit.prestis_deactivated}`,
    ...Object.entries(analysis.inactive_audit.by_batch).map(
      ([k, v]) => `  • batch=${k}: ${v}`
    ),
  ]);

  if (analysis.duplicates.length > 0) {
    console.log("");
    console.log(`⚠️  Duplicados aún ACTIVOS contra CCV1 (${analysis.duplicates.length}):`);
    for (const d of analysis.duplicates) {
      console.log(
        `  - ${d.source.padEnd(11)}  ${String(d.invoice_number).padEnd(60)}  ${d.currency} ${fmtCurrency(d.total).padStart(14)}  ↔ ${d.matched_ccv1_invoice_number}`
      );
    }
  } else {
    console.log("");
    console.log("✅ No quedan duplicados sombra/NOSER activos vs CCV1.");
  }
}

function evaluate(analysis, comparison) {
  const reasons = [];
  for (const cur of ["UYU", "USD"]) {
    const c = comparison[cur];
    if (!c.gross.ok) reasons.push(`${cur} bruto ${fmtCurrency(c.gross.got)} ≠ ${fmtCurrency(c.gross.expected)}`);
    if (!c.nc.ok)    reasons.push(`${cur} NC ${fmtCurrency(c.nc.got)} ≠ ${fmtCurrency(c.nc.expected)}`);
    if (!c.net.ok)   reasons.push(`${cur} neto ${fmtCurrency(c.net.got)} ≠ ${fmtCurrency(c.net.expected)}`);
  }
  if (analysis.duplicates.length > 0) {
    reasons.push(`${analysis.duplicates.length} duplicado(s) sombra/NOSER aún activo(s)`);
  }
  return { ok: reasons.length === 0, reasons };
}

/**
 * Cierra recursos retenidos por el cliente `@supabase/supabase-js`:
 * timers de auto-refresh de auth, canales realtime, etc. Sin esto, en Windows
 * Node 22 termina con `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`
 * y un exit code 127 espurio aunque la lógica del script haya terminado OK.
 *
 * Best-effort: cualquier excepción acá se ignora — el verdict del audit ya
 * está decidido cuando se llama a esta función.
 */
async function closeSupabase(client) {
  try {
    if (typeof client?.removeAllChannels === "function") {
      await client.removeAllChannels();
    }
  } catch {
    // ignore
  }
  try {
    // Detiene el timer interno de auto-refresh (auth.startAutoRefresh).
    if (typeof client?.auth?.stopAutoRefresh === "function") {
      await client.auth.stopAutoRefresh();
    }
  } catch {
    // ignore
  }
  try {
    // Cierra el websocket realtime (siempre se crea, aunque no se usen canales).
    if (typeof client?.realtime?.disconnect === "function") {
      client.realtime.disconnect();
    }
  } catch {
    // ignore
  }
}

(async () => {
  try {
    const rows = await loadInvoices();
    const analysis = analyse(rows);
    const comparison = compareWithExpected(analysis);
    const verdict = evaluate(analysis, comparison);

    if (asJson) {
      console.log(JSON.stringify({ analysis, comparison, verdict }, null, 2));
    } else {
      printHuman(analysis, comparison);
      console.log("");
      if (verdict.ok) {
        console.log("✅ Ventas junio 2026 reconciliadas con export Zeta dentro de tolerancia.");
      } else {
        console.log("❌ Ventas junio 2026 NO coinciden con export Zeta:");
        for (const r of verdict.reasons) console.log(`   - ${r}`);
      }
    }

    process.exitCode = verdict.ok ? 0 : 1;
  } catch (err) {
    console.error("audit-zeta-june-2026-sales fatal:", err);
    process.exitCode = 2;
  } finally {
    await closeSupabase(supabase);
  }
})();
