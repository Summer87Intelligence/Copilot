/**
 * Diagnóstico: compara DB cruda vs totales tipo Cartera (sin importar TS).
 * Uso: node --env-file=.env.local scripts/diag-cartera-data-sources.mjs
 */

import { createClient } from "@supabase/supabase-js";

function argFlag(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const workspaceId =
  argFlag("--workspace") ??
  process.env.WORKSPACE_COMPANY_ID ??
  process.env.NEXT_PUBLIC_WORKSPACE_COMPANY_ID;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MIN_DATE = "2026-01-01";

function round2(n) {
  return Math.round(n * 100) / 100;
}

function monthToToday() {
  const t = new Date();
  const from = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-01`;
  const to = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  return { from, to };
}

async function main() {
  if (!url || !key || !workspaceId) {
    console.error("Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o WORKSPACE_COMPANY_ID");
    process.exit(1);
  }

  const period = monthToToday();
  const periodEnd = argFlag("--period-end") ?? period.to;

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: rows, error } = await sb
    .from("proto_invoices")
    .select("company_id, currency_code, balance_amount, issue_date, updated_at, notes, invoice_number")
    .eq("workspace_company_id", workspaceId)
    .eq("is_active", true)
    .gte("issue_date", MIN_DATE)
    .order("id", { ascending: true })
    .limit(5000);

  if (error) throw error;

  const all = rows ?? [];
  const pendingAll = all.filter((r) => Number(r.balance_amount) > 0.005);
  const pendingAtCutoff = all.filter((r) => {
    const issue = String(r.issue_date ?? "").slice(0, 10);
    return issue <= periodEnd && Number(r.balance_amount) > 0.005;
  });

  function agg(list) {
    const companies = new Set();
    let uyu = 0;
    let usd = 0;
    for (const r of list) {
      if (r.company_id) companies.add(r.company_id);
      const b = Number(r.balance_amount) || 0;
      const c = String(r.currency_code ?? "UYU").toUpperCase();
      if (c === "USD") usd += b;
      else uyu += b;
    }
    return {
      pendingCount: list.length,
      debtors: companies.size,
      uyu: round2(uyu),
      usd: round2(usd),
    };
  }

  const raw = agg(pendingAll);
  const cutoff = agg(pendingAtCutoff);

  const i2926 = all.find((r) => r.invoice_number === "ZETA:CCV1:0:2:A:2926");

  const { count: wipedAfterSaldos } = await sb
    .from("proto_invoices")
    .select("id", { count: "exact", head: true })
    .eq("workspace_company_id", workspaceId)
    .eq("balance_amount", 0)
    .gte("updated_at", "2026-05-19T18:09:00Z")
    .like("notes", "zeta_vouchers:%");

  console.log("\n══ diag-cartera-data-sources ══\n");
  console.log("Supabase host:", new URL(url).host);
  console.log("Workspace:", workspaceId);
  console.log("Período corte (issue_date <=):", periodEnd);
  console.log("Invoices loaded (limit 5000):", all.length);
  console.log("");
  console.log(
    ["Fuente", "Workspace", "Fact.pend.", "Deudores", "UYU", "USD"].join(" | ")
  );
  console.log("-".repeat(78));

  function row(label, o) {
    console.log(
      [
        label,
        workspaceId.slice(0, 8) + "…",
        o.pendingCount,
        o.debtors,
        o.uyu,
        o.usd,
      ].join(" | ")
    );
  }

  row("audit-excel (db global)", raw);
  row("db-raw balance>0", raw);
  row("db at cutoff", cutoff);
  row("ui-cartera (≈ cutoff)", cutoff);

  console.log("\n── Evidencia vouchers post-saldos ──");
  console.log("ACQUAGARDEN 2926:", i2926 ?? "not found");
  console.log("Facturas balance=0 + notes zeta_vouchers desde 18:09 UTC:", wipedAfterSaldos ?? "?");

  const lastVoucher = pendingAll
    .filter((r) => String(r.notes ?? "").startsWith("zeta_vouchers:"))
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0];
  console.log("Última pendiente con notes vouchers:", lastVoucher?.invoice_number, lastVoucher?.updated_at);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
