#!/usr/bin/env node
/**
 * Auditoría read-only: cobertura sync Zeta → Supabase → motor Cartera → Explorador.
 *
 * Uso (recomendado — importa motor TS):
 *   node --env-file=.env.local --import tsx scripts/audit-zeta-sync-coverage.mjs
 *
 * Flags:
 *   --from YYYY-MM-DD   (default: primer día del mes actual)
 *   --to YYYY-MM-DD     (default: hoy UTC)
 *   --workspace UUID    (default: WORKSPACE_COMPANY_ID)
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKSPACE_COMPANY_ID
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

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

const MIN_FINANCIAL_DATE = "2026-01-01";
const INVOICE_LIMIT = 5000;
const EPS = 0.005;
const PAGE = 1000;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const workspaceId =
  argFlag("--workspace") ??
  process.env.WORKSPACE_COMPANY_ID ??
  process.env.NEXT_PUBLIC_WORKSPACE_COMPANY_ID;

const today = new Date().toISOString().slice(0, 10);
const periodEnd = argFlag("--to") ?? today;
const periodStart = argFlag("--from") ?? `${periodEnd.slice(0, 7)}-01`;

if (!url || !key || !workspaceId) {
  console.error("Falta SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o WORKSPACE_COMPANY_ID");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const TARGET_LABELS = [
  "ACQUAGARDEN",
  "ACQ",
  "El Pais",
  "El País",
  "Vilcabamba",
  "LANCER",
  "Nirmex",
  "Siempre Conviene",
  "Petrovic",
  "Trexys",
];

const CFE_NC_TIPOS = new Set([
  102, 112, 122, 132, 142, 182, 202, 212, 222, 232, 242, 282,
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function num(v) {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function norm(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function isVoided(status) {
  const st = String(status ?? "").toLowerCase();
  return st === "void" || st === "voided" || st === "cancelled";
}

function readCfeTipo(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const v1 = metadata.zeta_customer_voucher_v1;
  if (!v1 || typeof v1 !== "object" || Array.isArray(v1)) return null;
  const raw = v1.cfe_tipo ?? v1.cfeTipo ?? v1.CFETipo;
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function isCreditNote(metadata) {
  const t = readCfeTipo(metadata);
  return t !== null && CFE_NC_TIPOS.has(t);
}

function readZetaClientName(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const v1 = metadata.zeta_customer_voucher_v1;
  if (!v1 || typeof v1 !== "object" || Array.isArray(v1)) return null;
  const name = v1.zeta_cliente_nombre ?? v1.zetaClienteNombre ?? v1.cliente_nombre;
  if (typeof name === "string" && name.trim()) return name.trim();
  return null;
}

function jsonSearchHaystack(obj) {
  try {
    return norm(JSON.stringify(obj));
  } catch {
    return "";
  }
}

async function countTable(table, apply) {
  let q = supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("workspace_company_id", workspaceId);
  if (apply) q = apply(q);
  const { count, error } = await q;
  if (error) {
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      return { count: null, missing: true, error: error.message };
    }
    throw error;
  }
  return { count: count ?? 0, missing: false };
}

async function fetchPaged(table, select, apply) {
  const all = [];
  let offset = 0;
  for (;;) {
    let q = supabase.from(table).select(select).range(offset, offset + PAGE - 1);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

/** Réplica del portfolio pass (saldo por cliente) — alineado con motor. */
function buildDebtFromInvoices(invoices, { periodEnd: pe, respectCreditNotes }) {
  const byCompany = new Map();
  const ncByCompany = new Map();

  for (const inv of invoices) {
    if (isVoided(inv.status)) continue;
    const issueSl = String(inv.issue_date ?? "").slice(0, 10);
    if (pe && /^\d{4}-\d{2}-\d{2}$/.test(issueSl) && issueSl > pe) continue;

    const cid = String(inv.company_id ?? "").trim();
    if (!cid) continue;

    const isNc = isCreditNote(inv.zeta_metadata);
    if (isNc) {
      const t = round2(Math.max(0, num(inv.total_amount)));
      if (t > 0) {
        ncByCompany.set(cid, round2((ncByCompany.get(cid) ?? 0) + t));
      }
      if (respectCreditNotes) continue;
    }

    const code = String(inv.currency_code ?? "").trim().toUpperCase();
    if (code !== "UYU" && code !== "USD") continue;

    const total = round2(Math.max(0, num(inv.total_amount)));
    if (!(total > 0)) continue;

    const rawBal = inv.balance_amount;
    const pending =
      rawBal == null ? total : round2(Math.max(0, num(rawBal)));
    if (!(pending > EPS)) continue;

    const cur = byCompany.get(cid) ?? { UYU: 0, USD: 0, invoiceIds: new Set() };
    cur[code] = round2(cur[code] + pending);
    cur.invoiceIds.add(String(inv.id));
    byCompany.set(cid, cur);
  }

  return { byCompany, ncByCompany };
}

function simulateApiInvoiceSlice(allInvoices) {
  const filtered = allInvoices
    .filter((inv) => {
      const d = String(inv.issue_date ?? "").slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= MIN_FINANCIAL_DATE;
    })
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return {
    slice: filtered.slice(0, INVOICE_LIMIT),
    totalEligible: filtered.length,
    truncated: filtered.length > INVOICE_LIMIT,
  };
}

async function tryRunMotor(invoices, companies, receipts) {
  try {
    const recMod = await import("../lib/copilot-financial-reconciliation.ts");
    const cnMod = await import("../lib/copilot-zeta-credit-note.ts");
    const numMod = await import("../lib/copilot-numeric-parse.ts");

    const toSafe = numMod.toSafeNumber ?? ((v) => num(v));

    const invoiceInputs = invoices.map((r) => ({
      id: String(r.id ?? ""),
      company_id: r.company_id != null ? String(r.company_id) : null,
      currency_code: r.currency_code != null ? String(r.currency_code) : null,
      total_amount: toSafe(r.total_amount),
      balance_amount: toSafe(r.balance_amount),
      status: r.status != null ? String(r.status) : null,
      updated_at: r.updated_at != null ? String(r.updated_at) : null,
      issue_date: r.issue_date != null ? String(r.issue_date) : null,
      due_date: r.due_date != null ? String(r.due_date) : null,
      due_date_source: r.due_date_source != null ? String(r.due_date_source) : null,
      is_credit_note: cnMod.isCreditNoteFromMetadata(r.zeta_metadata),
      zeta_client_name: readZetaClientName(r.zeta_metadata),
    }));

    const companyInputs = companies.map((r) => ({
      id: String(r.id ?? ""),
      name: r.name != null ? String(r.name) : null,
    }));

    const receiptInputs = (receipts ?? []).map((r) => ({
      id: String(r.id ?? ""),
      company_id: r.company_id != null ? String(r.company_id) : null,
      currency_code: r.currency_code != null ? String(r.currency_code) : null,
      amount: toSafe(r.amount),
      receipt_date: r.receipt_date != null ? String(r.receipt_date) : null,
      status: r.status != null ? String(r.status) : null,
    }));

    return recMod.generateFinancialConsistencyReport({
      workspaceId,
      invoices: invoiceInputs,
      companies: companyInputs,
      receipts: receiptInputs,
      syncStates: [],
      mode: "period_only",
      periodStart,
      periodEnd,
      now: `${periodEnd}T12:00:00Z`,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function explorerDebtors(staleClients) {
  return staleClients.filter((c) =>
    Object.values(c.pendingByCurrency ?? {}).some((v) => (v ?? 0) > EPS)
  );
}

function matchTargets(companies, invoices, companyById) {
  const hits = new Map();

  for (const label of TARGET_LABELS) {
    hits.set(label, { companyIds: new Set(), paths: [] });
  }

  function add(label, cid, path) {
    const h = hits.get(label);
    if (!h) return;
    if (cid) h.companyIds.add(cid);
    h.paths.push(path);
  }

  for (const label of TARGET_LABELS) {
    const term = norm(label);
    if (!term) continue;

    for (const c of companies) {
      const cid = String(c.id ?? "");
      const name = norm(c.name);
      if (name.includes(term)) add(label, cid, `proto_companies.name=${c.name}`);
      const zHay = jsonSearchHaystack(c.zeta_metadata);
      if (zHay.includes(term)) add(label, cid, `proto_companies.zeta_metadata`);
      if (norm(cid).includes(term)) add(label, cid, `proto_companies.id`);
    }

    for (const inv of invoices) {
      const cid = String(inv.company_id ?? "").trim();
      const zName = readZetaClientName(inv.zeta_metadata);
      if (zName && norm(zName).includes(term)) {
        add(label, cid, `invoice.zeta_cliente_nombre=${zName}`);
      }
      const zHay = jsonSearchHaystack(inv.zeta_metadata);
      if (zHay.includes(term) && cid) {
        add(label, cid, `invoice.zeta_metadata`);
      }
    }
  }

  return hits;
}

function pad(s, w) {
  const t = String(s ?? "");
  return t.length >= w ? t.slice(0, w - 1) + "…" : t.padEnd(w);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  AUDIT Zeta sync coverage → DB → Cartera → Explorador       ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
  console.log(`Workspace:     ${workspaceId}`);
  console.log(`Período motor: ${periodStart} → ${periodEnd}`);
  console.log(`Piso facturas: >= ${MIN_FINANCIAL_DATE}`);
  console.log(`INVOICE_LIMIT: ${INVOICE_LIMIT} (order id asc, igual que API)\n`);

  // ---- 1. Conteos tablas ----
  console.log("── 1. Totales en Supabase (workspace) ──\n");

  const tables = [
    ["proto_companies", (q) => q],
    ["proto_companies (activas)", (q) => q.eq("is_active", true)],
    ["proto_invoices", (q) => q],
    ["proto_invoices (activas)", (q) => q.eq("is_active", true)],
    ["proto_invoices (activas >= piso)", (q) =>
      q.eq("is_active", true).gte("issue_date", MIN_FINANCIAL_DATE)],
    ["proto_receipts", (q) => q],
    ["proto_receipts (activas)", (q) => q.eq("is_active", true)],
    ["proto_payments", (q) => q],
    ["invoice_payments", (q) => q],
  ];

  for (const [label, apply] of tables) {
    const table = label.split(" ")[0];
    const r = await countTable(table, apply);
    if (r.missing) {
      console.log(`  ${pad(label, 42)} — tabla no existe`);
    } else {
      console.log(`  ${pad(label, 42)} ${r.count}`);
    }
  }

  // ---- 2. Carga completa facturas + empresas ----
  console.log("\n── 2. Cargando facturas (paginado, sin límite 5000) ──\n");

  const companies = await fetchPaged(
    "proto_companies",
    "id, name, is_active, Codigo, zeta_metadata",
    (q) => q.eq("workspace_company_id", workspaceId)
  );

  const allInvoices = await fetchPaged(
    "proto_invoices",
    "id, company_id, currency_code, total_amount, balance_amount, status, issue_date, updated_at, zeta_metadata, invoice_number",
    (q) =>
      q
        .eq("workspace_company_id", workspaceId)
        .eq("is_active", true)
        .gte("issue_date", MIN_FINANCIAL_DATE)
        .order("id", { ascending: true })
  );

  let receipts = [];
  try {
    receipts = await fetchPaged(
      "proto_receipts",
      "id, company_id, currency_code, amount, receipt_date, status",
      (q) =>
        q
          .eq("workspace_company_id", workspaceId)
          .eq("is_active", true)
          .gte("receipt_date", MIN_FINANCIAL_DATE)
          .lte("receipt_date", periodEnd)
    );
  } catch (e) {
    console.log(`  proto_receipts: error ${e.message}`);
  }

  const activeCompanies = companies.filter((c) => c.is_active === true);
  const companyById = new Map(companies.map((c) => [String(c.id), c]));

  let ncCount = 0;
  let ncAmountUyu = 0;
  let ncAmountUsd = 0;
  const pendingByCurrency = { UYU: 0, USD: 0 };
  const debtorsFull = new Set();

  for (const inv of allInvoices) {
    if (isVoided(inv.status)) continue;
    if (isCreditNote(inv.zeta_metadata)) {
      ncCount++;
      const code = String(inv.currency_code ?? "").trim().toUpperCase();
      const t = round2(Math.max(0, num(inv.total_amount)));
      if (code === "UYU") ncAmountUyu = round2(ncAmountUyu + t);
      if (code === "USD") ncAmountUsd = round2(ncAmountUsd + t);
      continue;
    }
    const code = String(inv.currency_code ?? "").trim().toUpperCase();
    if (code !== "UYU" && code !== "USD") continue;
    const total = round2(Math.max(0, num(inv.total_amount)));
    if (!(total > 0)) continue;
    const pending =
      inv.balance_amount == null ? total : round2(Math.max(0, num(inv.balance_amount)));
    if (pending > EPS) {
      pendingByCurrency[code] = round2(pendingByCurrency[code] + pending);
      const cid = String(inv.company_id ?? "").trim();
      if (cid) debtorsFull.add(cid);
    }
  }

  console.log(`  Facturas cargadas (>= ${MIN_FINANCIAL_DATE}): ${allInvoices.length}`);
  console.log(`  proto_companies total / activas: ${companies.length} / ${activeCompanies.length}`);
  console.log(`  proto_receipts en rango: ${receipts.length}`);
  console.log(`  Notas de crédito (filas NC): ${ncCount}`);
  console.log(`  NC monto UYU / USD (total_amount, no neteadas en DB): ${ncAmountUyu} / ${ncAmountUsd}`);
  console.log(`  Facturas con saldo > 0 (suma global UYU): ${pendingByCurrency.UYU}`);
  console.log(`  Facturas con saldo > 0 (suma global USD): ${pendingByCurrency.USD}`);
  console.log(`  Clientes únicos con saldo pendiente (DB completa): ${debtorsFull.size}`);

  // ---- 3. Límite 5000 ----
  console.log("\n── 3. Simulación query API (limit 5000, order id) ──\n");

  const { slice: apiSlice, totalEligible, truncated } = simulateApiInvoiceSlice(allInvoices);
  const debtFull = buildDebtFromInvoices(allInvoices, {
    periodEnd,
    respectCreditNotes: true,
  });
  const debtSlice = buildDebtFromInvoices(apiSlice, {
    periodEnd,
    respectCreditNotes: true,
  });

  const debtorsApi = new Set(
    [...debtSlice.byCompany.entries()]
      .filter(([, v]) => v.UYU > EPS || v.USD > EPS)
      .map(([id]) => id)
  );

  const lostToCap = [...debtFull.byCompany.keys()].filter((id) => !debtorsApi.has(id));

  console.log(`  Facturas elegibles (>= piso, orden id): ${totalEligible}`);
  console.log(`  Truncadas por INVOICE_LIMIT: ${truncated ? "SÍ ⚠" : "no"}`);
  console.log(`  Facturas en slice API: ${apiSlice.length}`);
  console.log(`  Deudores DB completa (portfolio): ${debtFull.byCompany.size}`);
  console.log(`  Deudores en slice 5000: ${debtorsApi.size}`);
  console.log(`  Deudores PERDIDOS por cap 5000: ${lostToCap.length}`);

  if (lostToCap.length > 0) {
    console.log("\n  Muestra deudores fuera del slice (max 20):");
    for (const id of lostToCap.slice(0, 20)) {
      const row = debtFull.byCompany.get(id);
      const co = companyById.get(id);
      const name = co?.name ?? readZetaClientNameFromInvoices(allInvoices, id) ?? id;
      console.log(
        `    - ${pad(name, 35)} UYU=${row?.UYU ?? 0} USD=${row?.USD ?? 0} facturas=${row?.invoiceIds?.size ?? 0}`
      );
    }
  }

  // ---- 4. Motor (staleClients) ----
  console.log("\n── 4. Motor reconciliación (mismo input que API) ──\n");

  const companiesForMotor = activeCompanies.map((c) => ({ id: c.id, name: c.name }));

  const motorFull = await tryRunMotor(allInvoices, companiesForMotor, receipts);
  const motorSlice = await tryRunMotor(apiSlice, companiesForMotor, receipts);

  let motorError = null;
  let staleFull = [];
  let staleSlice = [];
  let explorerFull = [];
  let explorerSlice = [];

  if (motorFull && !motorFull.error) {
    staleFull = motorFull.staleClients ?? [];
    explorerFull = explorerDebtors(staleFull);
    console.log("  Motor (dataset COMPLETO): OK");
    console.log(`    staleClients total: ${staleFull.length}`);
    console.log(`    con deuda (Explorer): ${explorerFull.length}`);
    const uyu = motorFull.currencies?.find((c) => c.currencyCode === "UYU");
    const usd = motorFull.currencies?.find((c) => c.currencyCode === "USD");
    console.log(`    pendingAtCutoff UYU: ${uyu?.pendingAtCutoff ?? "—"}`);
    console.log(`    pendingAtCutoff USD: ${usd?.pendingAtCutoff ?? "—"}`);
    console.log(`    creditNoteAmount UYU: ${uyu?.creditNoteAmount ?? 0}`);
  } else {
    motorError = motorFull?.error ?? "import motor falló — ejecutar con --import tsx";
    console.log(`  Motor (dataset COMPLETO): ${motorError}`);
  }

  if (motorSlice && !motorSlice.error) {
    staleSlice = motorSlice.staleClients ?? [];
    explorerSlice = explorerDebtors(staleSlice);
    console.log("\n  Motor (slice 5000 — lo que ve Cartera si hay cap):");
    console.log(`    staleClients total: ${staleSlice.length}`);
    console.log(`    con deuda (Explorer): ${explorerSlice.length}`);
  }

  // Comparación A vs B vs C
  console.log("\n── 5. Cadena A → B → C ──\n");
  const countA = debtorsFull.size;
  const countB = explorerFull.length || debtFull.byCompany.size;
  const countC = explorerFull.length;
  const countApiB = explorerSlice.length || debtorsApi.size;

  console.log(`  A) DB clientes con saldo (facturas, no-NC):     ${countA}`);
  console.log(`  B) staleClients / motor con deuda:             ${countC || "(motor no disponible)"}`);
  console.log(`  C) Explorador (pending>0, sin búsqueda):       ${countC || "(igual B si motor OK)"}`);
  console.log(`  API slice → Explorer si truncated:             ${countApiB}`);

  let cut = "—";
  if (truncated && countA > countApiB) {
    cut = "SYNC/QUERY CAP (5000) — deuda fuera del slice";
  } else if (motorError) {
    cut = "Motor no ejecutado — re-run con tsx";
  } else if (countA > countC) {
    cut = "MOTOR reconciliación (A > B)";
  } else if (countC > countC + 1) {
    cut = "FRONTEND (poco probable sin UI)";
  } else {
    cut = "Sin corte A→B→C en counts (revisar fila a fila)";
  }
  console.log(`  Corte probable: ${cut}`);

  // ---- 6. Targets ----
  console.log("\n── 6. Clientes objetivo ──\n");

  const targets = matchTargets(companies, allInvoices, companyById);
  const explorerIds = new Set(explorerFull.map((c) => c.companyId));
  const staleIds = new Set(staleFull.map((c) => c.companyId));
  const debtFullIds = debtFull.byCompany;

  const header = [
    pad("Cliente", 18),
    pad("Co", 3),
    pad("Fac", 4),
    pad("Rec", 4),
    pad("DB$", 5),
    pad("5k", 3),
    pad("St", 3),
    pad("Ex", 3),
    pad("Problema", 28),
  ].join(" | ");

  console.log(header);
  console.log("-".repeat(header.length));

  for (const label of TARGET_LABELS) {
    const hit = targets.get(label);
    const ids = [...(hit?.companyIds ?? [])];

    if (ids.length === 0) {
      console.log(
        [
          pad(label, 18),
          pad("—", 3),
          pad("—", 4),
          pad("—", 4),
          pad("—", 5),
          pad("—", 3),
          pad("—", 3),
          pad("—", 3),
          pad("NO EN DB / sync", 28),
        ].join(" | ")
      );
      continue;
    }

    for (const cid of ids) {
      const co = companyById.get(cid);
      const display = co?.name ?? label;
      const invCount = allInvoices.filter((i) => String(i.company_id) === cid).length;
      const recCount = receipts.filter((r) => String(r.company_id) === cid).length;
      const debt = debtFullIds.get(cid);
      const hasDebt = debt && (debt.UYU > EPS || debt.USD > EPS);
      const inSlice = debtorsApi.has(cid);
      const inStale = staleIds.has(cid);
      const staleRow = staleFull.find((c) => c.companyId === cid);
      const motorUyu = staleRow?.pendingByCurrency?.UYU ?? 0;
      const motorUsd = staleRow?.pendingByCurrency?.USD ?? 0;
      const motorDebt = motorUyu > EPS || motorUsd > EPS;
      const inExplorer =
        explorerIds.has(cid) ||
        (motorDebt && staleIds.has(cid));

      let problema = "OK";
      if (!co) problema = "sin proto_company";
      else if (co.is_active === false) problema = "company inactiva";
      else if (!hasDebt && !motorDebt) problema = "sin saldo DB (sync)";
      else if (!hasDebt && motorDebt) problema = "motor>0, revisar facturas";
      else if (truncated && !inSlice) problema = "FUERA cap 5000";
      else if ((hasDebt || motorDebt) && !inExplorer) problema = "deuda, no Explorer";
      else if ((hasDebt || motorDebt) && !inStale) problema = "deuda, no staleClients";
      else if (hasDebt && !motorDebt && inExplorer) problema = "Explorer sin motor debt";
      const pend =
        staleRow?.pendingByCurrency ??
        (debt ? { UYU: debt.UYU, USD: debt.USD } : {});

      console.log(
        [
          pad(display, 18),
          pad(co ? "Y" : "N", 3),
          pad(String(invCount), 4),
          pad(String(recCount), 4),
          pad(
            motorDebt || hasDebt
              ? `${Math.round(motorUyu || pend.UYU || debt?.UYU || 0)}`
              : "0",
            5
          ),
          pad(inSlice ? "Y" : "N", 3),
          pad(inStale ? "Y" : "N", 3),
          pad(inExplorer ? "Y" : "N", 3),
          pad(problema, 28),
        ].join(" | ")
      );

      if (label.toLowerCase().includes("pais") && staleRow) {
        console.log(
          `      └ El País pending UYU=${staleRow.pendingByCurrency?.UYU ?? 0} USD=${staleRow.pendingByCurrency?.USD ?? 0} (NC no restan balance en motor)`
        );
      }
    }
  }

  // ---- 7. Resumen ejecutivo ----
  console.log("\n── 7. Resumen ejecutivo ──\n");
  console.log(`  Deudores según DB (A):              ${countA}`);
  console.log(`  Deudores según Cartera/Explorer (C): ${countC || "N/D"}`);
  console.log(`  Deudores si API trunca a 5000:       ${countApiB}`);
  console.log(`  Facturas NC en DB:                   ${ncCount}`);
  console.log(`  Truncamiento 5000 activo:            ${truncated ? "SÍ" : "NO"}`);

  if (motorFull && !motorFull.error) {
    const elPais = staleFull.find(
      (c) =>
        norm(c.companyName).includes("pais") ||
        norm(c.companyId).includes("elpais")
    );
    if (elPais) {
      const uyuCard = motorFull.currencies?.find((c) => c.currencyCode === "UYU");
      console.log("\n  El País (motor):");
      console.log(`    pendingByCurrency.UYU: ${elPais.pendingByCurrency?.UYU ?? 0}`);
      console.log(`    pendingAtCutoff UYU (toda cartera): ${uyuCard?.pendingAtCutoff ?? 0}`);
      console.log(`    openingBalance UYU (portfolio): ${uyuCard?.openingBalance ?? 0}`);
      console.log(`    Nota: NC en DB no reducen balance_amount → motor puede > Zeta (DIV-003)`);
    }
  }

  // ACQUAGARDEN drill-down
  const acqIds = new Set();
  for (const [label, hit] of targets) {
    if (!norm(label).includes("acq")) continue;
    for (const id of hit.companyIds) acqIds.add(id);
  }
  if (acqIds.size > 0) {
    console.log("\n── 8. Drill-down ACQUAGARDEN / ACQ ──\n");
    for (const cid of acqIds) {
      const co = companyById.get(cid);
      console.log(`  Empresa: ${co?.name ?? cid} (${cid})`);
      const invs = allInvoices.filter((i) => String(i.company_id) === cid);
      console.log(`  Facturas activas (>= piso): ${invs.length}`);
      for (const inv of invs.slice(0, 8)) {
        const nc = isCreditNote(inv.zeta_metadata) ? " [NC]" : "";
        console.log(
          `    ${inv.invoice_number ?? inv.id} | ${String(inv.issue_date).slice(0, 10)} | ${inv.currency_code} | total=${num(inv.total_amount)} | balance=${inv.balance_amount ?? "null"}${nc}`
        );
      }
      if (invs.length > 8) console.log(`    … +${invs.length - 8} más`);
      const st = staleFull.find((c) => c.companyId === cid);
      console.log(
        `  Motor pending: UYU=${st?.pendingByCurrency?.UYU ?? 0} USD=${st?.pendingByCurrency?.USD ?? 0} → Explorer=${st && (st.pendingByCurrency?.UYU > EPS || st.pendingByCurrency?.USD > EPS) ? "SÍ" : "NO"}`
      );
      console.log(
        `  Diagnóstico: ${st && (st.pendingByCurrency?.UYU > EPS || st.pendingByCurrency?.USD > EPS) ? "deuda en motor" : "balance_amount=0 en DB — Zeta/Excel puede tener saldo; revisar sync saldos (no UI)"}`
      );
    }
  }

  console.log("\n  Ejecutar con: node --env-file=.env.local --import tsx scripts/audit-zeta-sync-coverage.mjs\n");
}

function readZetaClientNameFromInvoices(invoices, companyId) {
  for (const inv of invoices) {
    if (String(inv.company_id) !== companyId) continue;
    const n = readZetaClientName(inv.zeta_metadata);
    if (n) return n;
  }
  return null;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
