#!/usr/bin/env node
/**
 * Auditoría read-only: Total vs Saldo en QuerySaldosPendientes vs Copilot DB.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/audit-zeta-total-vs-saldo.mjs
 *   npx tsx --env-file=.env.local scripts/audit-zeta-total-vs-saldo.mjs --cliente 36
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const AMOUNT_TOL = 0.02;
const EPS = 0.005;
const MAX_PAGES = 100;
const PAGE_DELAY_MS = 80;

const args = process.argv.slice(2);
function argFlag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] ?? null : null;
}
const FILTER_CLIENTE = argFlag("--cliente");

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnvLocal();

const workspaceId =
  process.env.WORKSPACE_COMPANY_ID ?? process.env.NEXT_PUBLIC_WORKSPACE_COMPANY_ID;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key || !workspaceId) {
  console.error("Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o WORKSPACE_COMPANY_ID");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

function num(v) {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseCcV1(inv) {
  const p = String(inv ?? "").split(":");
  if (p[0] !== "ZETA" || p[1] !== "CCV1" || p.length < 6) return null;
  return { clienteCodigo: p[3], serie: p[4], numero: p[5] };
}

function saldoKey(cliente, serie, numero) {
  return `${String(cliente).trim()}|${String(serie ?? "A").trim()}|${String(numero).trim()}`;
}

function rowNumero(row) {
  return String(row.Numero ?? row.numero ?? row.ComprobanteNumero ?? "").trim();
}

function rowSerie(row) {
  return String(row.Serie ?? row.serie ?? row.ComprobanteSerie ?? "A").trim();
}

async function fetchAllSaldosForCliente(zeta, ctx, clienteCodigo) {
  const rows = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    if (page > 1) await sleep(PAGE_DELAY_MS);
    const res = await zeta.queryFacturaClienteSaldosPendientes(ctx, {
      clienteCodigo: String(clienteCodigo),
      page: String(page),
    });
    if (!res.succeed) break;
    if (Array.isArray(res.rows)) {
      for (const r of res.rows) {
        rows.push({
          clienteCodigo: String(r.ClienteCodigo ?? r.clienteCodigo ?? clienteCodigo).trim(),
          serie: rowSerie(r),
          numero: rowNumero(r),
          registroId: String(r.RegistroId ?? r.registroId ?? "").trim(),
          total: round2(num(r.Total ?? r.total)),
          saldo: round2(num(r.Saldo ?? r.saldo)),
          moneda: String(r.MonedaNombre ?? r.MonedaCodigo ?? "").trim(),
          fecha: String(r.Fecha ?? r.fecha ?? "").slice(0, 10),
          raw: r,
        });
      }
    }
    if (res.isLastPage === true) break;
  }
  return rows;
}

function classifyCopilot({ balance, totalZeta, saldoZeta, totalDb, cuotaSum }) {
  const diverge = Math.abs(totalZeta - saldoZeta) > AMOUNT_TOL;
  const matchSaldo = Math.abs(balance - saldoZeta) <= AMOUNT_TOL;
  const matchTotal = Math.abs(balance - totalZeta) <= AMOUNT_TOL;
  const matchTotalDb = Math.abs(balance - totalDb) <= AMOUNT_TOL;

  if (!diverge) {
    return {
      clase: "D",
      copilot_usa: "Total=Saldo",
      recomendacion: "No requiere acción",
    };
  }

  if (matchSaldo && !matchTotal) {
    return {
      clase: "A",
      copilot_usa: "Saldo",
      recomendacion: "Copilot alineado a Saldo Zeta; OK para cartera",
    };
  }

  if (matchTotal && !matchSaldo) {
    return {
      clase: "B",
      copilot_usa: "Total",
      recomendacion:
        "balance_amount ≈ Total Zeta, no Saldo remanente — revisar si vouchers/sync pisa saldos; cartera podría sobreestimar",
    };
  }

  if (matchTotalDb && !matchSaldo) {
    return {
      clase: "C",
      copilot_usa: "total_amount DB",
      recomendacion: "Ambiguo: balance no sigue Saldo ni Total API; posible origen vouchers o cuotas",
    };
  }

  if (cuotaSum > EPS && Math.abs(cuotaSum - balance) <= AMOUNT_TOL) {
    return {
      clase: "C",
      copilot_usa: "cuotas locales",
      recomendacion: "Balance espejado en cuotas locales; validar vs Saldo Zeta",
    };
  }

  return {
    clase: "C",
    copilot_usa: "otro/ambiguo",
    recomendacion: `balance=${balance} no ≈ Saldo(${saldoZeta}) ni Total(${totalZeta})`,
  };
}

async function main() {
  console.log("══════════════════════════════════════════════════════════════");
  console.log("  Auditoría Total vs Saldo — QuerySaldosPendientes vs Copilot");
  console.log("══════════════════════════════════════════════════════════════\n");

  const { data: invoices, error: invErr } = await supabase
    .from("proto_invoices")
    .select(
      "id, invoice_number, balance_amount, total_amount, currency_code, status, company_id, zeta_metadata, issue_date, updated_at"
    )
    .eq("workspace_company_id", workspaceId)
    .gt("balance_amount", EPS);
  if (invErr) throw new Error(invErr.message);

  const { data: companies } = await supabase
    .from("proto_companies")
    .select("id, name, RazonSocial, Codigo")
    .eq("workspace_company_id", workspaceId);

  const companyById = new Map((companies ?? []).map((c) => [String(c.id), c]));
  const companyByCodigo = new Map(
    (companies ?? []).map((c) => [String(c.Codigo ?? "").trim(), c])
  );

  const invByKey = new Map();
  const clienteCodigos = new Set();
  for (const inv of invoices ?? []) {
    const parsed = parseCcV1(inv.invoice_number);
    if (!parsed?.clienteCodigo || !parsed.numero) continue;
    if (FILTER_CLIENTE && parsed.clienteCodigo !== FILTER_CLIENTE) continue;
    const key = saldoKey(parsed.clienteCodigo, parsed.serie, parsed.numero);
    invByKey.set(key, inv);
    clienteCodigos.add(parsed.clienteCodigo);
  }

  const invoiceIds = [...(invoices ?? []).map((i) => i.id)];
  const installByInv = new Map();
  if (invoiceIds.length) {
    const { data: inst } = await supabase
      .from("proto_invoice_installments")
      .select("invoice_id, cuota_saldo")
      .eq("workspace_company_id", workspaceId)
      .in("invoice_id", invoiceIds)
      .gt("cuota_saldo", EPS);
    for (const row of inst ?? []) {
      installByInv.set(
        row.invoice_id,
        round2((installByInv.get(row.invoice_id) ?? 0) + num(row.cuota_saldo))
      );
    }
  }

  console.log(`Clientes con deuda en DB (balance>0): ${clienteCodigos.size}`);
  console.log(`Facturas pendientes CCV1: ${invByKey.size}\n`);

  const zeta = await import("../lib/integrations/zeta/zeta-factura-cliente.js");
  const ctx = { requestId: "audit-total-saldo", tenantId: workspaceId, syncRunId: "audit" };

  const allZetaRows = [];
  for (const codigo of [...clienteCodigos].sort((a, b) => Number(a) - Number(b))) {
    process.stdout.write(`  QuerySaldos cliente ${codigo}...`);
    const rows = await fetchAllSaldosForCliente(zeta, ctx, codigo);
    allZetaRows.push(...rows);
    console.log(` ${rows.length} filas`);
  }

  console.log(`\nTotal filas Zeta live: ${allZetaRows.length}\n`);

  const divergent = allZetaRows.filter((r) => Math.abs(r.total - r.saldo) > AMOUNT_TOL && r.saldo > EPS);
  const reportRows = [];

  for (const z of divergent) {
    const key = saldoKey(z.clienteCodigo, z.serie, z.numero);
    const inv = invByKey.get(key);
    const comp = inv
      ? companyById.get(String(inv.company_id))
      : companyByCodigo.get(z.clienteCodigo);
    const cliente =
      comp?.RazonSocial ?? comp?.name ?? z.raw?.ClienteRazonSocial ?? z.raw?.ClienteNombre ?? "—";
    const comprobante = `${z.serie}-${z.numero}`;
    const balance = inv ? round2(num(inv.balance_amount)) : null;
    const totalDb = inv ? round2(num(inv.total_amount)) : null;
    const cuotaSum = inv ? (installByInv.get(inv.id) ?? 0) : 0;
    const diffTotalSaldo = round2(z.total - z.saldo);

    const { clase, copilot_usa, recomendacion } = classifyCopilot({
      balance: balance ?? 0,
      totalZeta: z.total,
      saldoZeta: z.saldo,
      totalDb: totalDb ?? 0,
      cuotaSum,
    });

    reportRows.push({
      cliente,
      comprobante,
      cliente_codigo: z.clienteCodigo,
      registro_id: z.registroId,
      moneda: z.moneda,
      total_zeta: z.total,
      saldo_zeta: z.saldo,
      diff_total_saldo: diffTotalSaldo,
      balance_copilot: balance,
      total_amount_copilot: totalDb,
      cuota_local_abierta: cuotaSum,
      copilot_usa: copilot_usa,
      clasificacion: clase,
      recomendacion,
      status: inv?.status ?? "—",
      invoice_number: inv?.invoice_number ?? "—",
      en_db_pendiente: inv ? "sí" : "no",
    });
  }

  // Zeta rows with diverge not in DB pending
  for (const z of divergent) {
    const key = saldoKey(z.clienteCodigo, z.serie, z.numero);
    if (invByKey.has(key)) continue;
    const comp = companyByCodigo.get(z.clienteCodigo);
    reportRows.push({
      cliente: comp?.RazonSocial ?? comp?.name ?? "—",
      comprobante: `${z.serie}-${z.numero}`,
      cliente_codigo: z.clienteCodigo,
      registro_id: z.registroId,
      moneda: z.moneda,
      total_zeta: z.total,
      saldo_zeta: z.saldo,
      diff_total_saldo: round2(z.total - z.saldo),
      balance_copilot: null,
      total_amount_copilot: null,
      cuota_local_abierta: 0,
      copilot_usa: "—",
      clasificacion: "D",
      recomendacion: "En Zeta con Total≠Saldo pero sin balance pendiente en Copilot",
      status: "—",
      invoice_number: "—",
      en_db_pendiente: "no",
    });
  }

  reportRows.sort((a, b) => b.diff_total_saldo - a.diff_total_saldo);

  const byClass = { A: 0, B: 0, C: 0, D: 0 };
  for (const r of reportRows) byClass[r.clasificacion] = (byClass[r.clasificacion] ?? 0) + 1;

  const sameCount = allZetaRows.filter((r) => Math.abs(r.total - r.saldo) <= AMOUNT_TOL).length;

  console.log("── Resumen Zeta live ──");
  console.log(`  Filas con Total = Saldo:     ${sameCount}`);
  console.log(`  Filas con Total ≠ Saldo:     ${divergent.length}`);
  console.log(`  De esas, con match en DB:    ${reportRows.filter((r) => r.en_db_pendiente === "sí").length}`);
  console.log();
  console.log("── Clasificación (solo Total≠Saldo) ──");
  console.log(`  A — Copilot usa Saldo:       ${byClass.A ?? 0}`);
  console.log(`  B — Copilot usa Total:       ${byClass.B ?? 0}`);
  console.log(`  C — Ambiguo:                 ${byClass.C ?? 0}`);
  console.log(`  D — Sin acción / sin DB:     ${byClass.D ?? 0}`);
  console.log();

  const a2877 = reportRows.find((r) => r.comprobante === "A-2877");
  if (a2877) {
    console.log("── Validación A-2877 ──");
    console.log(
      `  Total Zeta ${a2877.total_zeta} | Saldo Zeta ${a2877.saldo_zeta} | Copilot ${a2877.balance_copilot} | Clase ${a2877.clasificacion} (${a2877.copilot_usa})`
    );
    console.log();
  } else {
    console.log("── Validación A-2877 ──");
    console.log("  ⚠ No apareció en filas Total≠Saldo (revisar cliente 36 manualmente)\n");
  }

  console.log("── Tabla Total ≠ Saldo (con pendiente en DB primero) ──");
  const hdr = [
    "Cliente".padEnd(22),
    "Comp".padEnd(8),
    "TotalZ".padStart(9),
    "SaldoZ".padStart(9),
    "Δ T-S".padStart(8),
    "BalCop".padStart(9),
    "Cl".padEnd(3),
    "Usa".padEnd(8),
  ].join(" | ");
  console.log(hdr);
  console.log("-".repeat(hdr.length + 5));
  for (const r of reportRows.filter((x) => x.en_db_pendiente === "sí")) {
    console.log(
      [
        String(r.cliente).slice(0, 22).padEnd(22),
        r.comprobante.padEnd(8),
        String(r.total_zeta).padStart(9),
        String(r.saldo_zeta).padStart(9),
        String(r.diff_total_saldo).padStart(8),
        String(r.balance_copilot ?? "—").padStart(9),
        r.clasificacion.padEnd(3),
        r.copilot_usa.padEnd(8),
      ].join(" | ")
    );
  }

  console.log("\n── Pipeline esperado (referencia código) ──");
  console.log("  mapSaldoRows: outstandingAmount ← Saldo; totalAmount ← Total");
  console.log("  persist: balance_amount ← outstandingAmount (Saldo)");
  console.log("  Si clase B: balance en DB no reflejó último Saldo (vouchers, sync viejo, o no corrió saldos)\n");

  const outDir = resolve(process.cwd(), "temp-audits/output");
  mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const csvPath = resolve(outDir, `audit-total-vs-saldo-${ts}.csv`);
  const cols = [
    "cliente",
    "comprobante",
    "cliente_codigo",
    "registro_id",
    "moneda",
    "total_zeta",
    "saldo_zeta",
    "diff_total_saldo",
    "balance_copilot",
    "total_amount_copilot",
    "cuota_local_abierta",
    "copilot_usa",
    "clasificacion",
    "recomendacion",
    "status",
    "invoice_number",
    "en_db_pendiente",
  ];
  const esc = (s) => {
    const t = String(s ?? "");
    return t.includes(",") || t.includes('"') ? `"${t.replace(/"/g, '""')}"` : t;
  };
  writeFileSync(
    csvPath,
    [cols.join(","), ...reportRows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n"),
    "utf8"
  );
  console.log(`CSV: ${csvPath}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
