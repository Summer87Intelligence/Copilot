#!/usr/bin/env node
/**
 * Diagnóstico read-only — 15 diferencias residuales audit:zeta-pdf-parity.
 * Uso: node --env-file=.env.local --import tsx scripts/diagnose-zeta-pdf-residual-diffs.ts
 */
// @ts-nocheck — script operativo one-off.
import { createClient } from "@supabase/supabase-js";
import {
  buildClientAccountStatement,
  type AccountStatementMovement,
} from "../lib/copilot-client-account-statement";
import { getPreviousBalance } from "../lib/account-statement/account-statement-period-model";
import {
  listProtoInvoicesByCompanyIdForLedger,
  listProtoReceiptsByCompanyIdForLedger,
} from "../lib/data/proto-operational-read-repository";

const PERIOD_FROM = "2026-01-01";
const workspaceId =
  process.env.WORKSPACE_COMPANY_ID ?? process.env.NEXT_PUBLIC_WORKSPACE_COMPANY_ID;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TARGET_CODIGOS = [
  "60", "67", "121", "158", // USD DIFF_OPENING
  "85", "125", "149", "151", "157", "170", "171", // UYU DIFF_OPENING
  "90", // Nirmex UYU DIFF_HABER
  "182", // Trexys DIFF_HABER
  "185", // PRESTIS DIFF_DEBE
  "187", // Dolby UYU DIFF_DEBE
];

function summarizePrePeriod(mvs: AccountStatementMovement[], from: string) {
  const before = mvs.filter((m) => m.date < from);
  let debit = 0;
  let credit = 0;
  for (const m of before) {
    debit += m.debit;
    credit += m.credit;
  }
  const net = Math.round((debit - credit) * 100) / 100;
  const lastRb = before.length ? before[before.length - 1]!.runningBalance : null;
  return { count: before.length, debit, credit, net, lastRunning: lastRb };
}

function summarizeInPeriod(mvs: AccountStatementMovement[], from: string, to: string) {
  const inP = mvs.filter((m) => m.date >= from && m.date <= to);
  return inP.length;
}

async function main() {
  if (!url || !key || !workspaceId) {
    console.error("Faltan env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKSPACE_COMPANY_ID");
    process.exit(1);
  }
  const supabase = createClient(url, key);

  const { data: companies, error } = await supabase
    .from("proto_companies")
    .select("id, Codigo, name, RazonSocial, ledger_opening_balance_uyu, ledger_opening_balance_usd")
    .eq("workspace_company_id", workspaceId)
    .in("Codigo", TARGET_CODIGOS.map(String));

  if (error) throw error;

  console.log("=".repeat(80));
  console.log("DIAGNÓSTICO RESIDUAL — audit:zeta-pdf-parity");
  console.log("=".repeat(80));

  for (const codigo of TARGET_CODIGOS) {
    const co = (companies ?? []).find((c) => String(c.Codigo) === codigo);
    if (!co) {
      console.log(`\n[cod=${codigo}] NO ENCONTRADO`);
      continue;
    }
    const companyId = String(co.id);
    const name = String(co.RazonSocial ?? co.name ?? "");
    const [invoices, receipts] = await Promise.all([
      listProtoInvoicesByCompanyIdForLedger(supabase, companyId, workspaceId!),
      listProtoReceiptsByCompanyIdForLedger(supabase, companyId, workspaceId!),
    ]);

    for (const cur of ["UYU", "USD"] as const) {
      const ob =
        cur === "UYU" ? co.ledger_opening_balance_uyu : co.ledger_opening_balance_usd;
      if (ob == null && cur === "USD" && !["60", "67", "121", "158", "182"].includes(codigo))
        continue;
      if (ob == null && cur === "UYU" && !["85", "90", "125", "149", "151", "157", "170", "171", "185", "187"].includes(codigo))
        continue;

      const stmt = buildClientAccountStatement({
        invoices,
        receipts,
        ledgerMode: true,
        openingBalanceUyu: co.ledger_opening_balance_uyu,
        openingBalanceUsd: co.ledger_opening_balance_usd,
      });
      const block = cur === "UYU" ? stmt.uyu : stmt.usd;
      if (block.movements.length === 0 && ob == null) continue;

      const pre = summarizePrePeriod(block.movements, PERIOD_FROM);
      const inPeriod = summarizeInPeriod(block.movements, PERIOD_FROM, "2026-12-31");
      const prevBal = getPreviousBalance(block, PERIOD_FROM);
      const impliedOpeningOnly = ob != null ? Number(ob) : 0;
      const delta = Math.round((prevBal - impliedOpeningOnly) * 100) / 100;

      console.log(`\n--- cod=${codigo} ${cur} | ${name.slice(0, 50)} ---`);
      console.log(`  ledger_opening DB:     ${ob ?? "NULL"}`);
      console.log(`  getPreviousBalance:    ${prevBal}`);
      console.log(`  delta (prev - ledger): ${delta}`);
      console.log(`  mov pre-${PERIOD_FROM}: ${pre.count} | debe=${pre.debit} haber=${pre.credit} net=${pre.net}`);
      console.log(`  mov en período 2026:   ${inPeriod}`);
      if (pre.count > 0 && pre.count <= 8) {
        for (const m of block.movements.filter((x) => x.date < PERIOD_FROM)) {
          console.log(
            `    pre: ${m.date} ${m.kind} ${m.number || "?"} D=${m.debit} H=${m.credit} rb=${m.runningBalance}`
          );
        }
      }
    }

    // Nirmex / Trexys / PRESTIS — recibos y facturas específicos
    if (codigo === "90") {
      console.log("\n  [Nirmex UYU recibos 2026]");
      for (const r of receipts) {
        const d = String(r.receipt_date ?? "").slice(0, 10);
        if (!d.startsWith("2026")) continue;
        const meta = (r as { zeta_metadata?: Record<string, unknown> }).zeta_metadata;
        const zid =
          (r as { zeta_id?: string }).zeta_id ??
          (meta?.zeta_id as string | undefined) ??
          (meta?.RegistroCodigo as string | undefined);
        console.log(
          `    id=${r.id} zeta_id=${zid ?? "?"} ref=${r.reference} amt=${r.amount} date=${d} active=${r.is_active}`
        );
      }
    }
    if (codigo === "182") {
      console.log("\n  [Trexys USD recibos 2026]");
      for (const r of receipts) {
        const d = String(r.receipt_date ?? "").slice(0, 10);
        if (!d.startsWith("2026")) continue;
        const meta = (r as { zeta_metadata?: Record<string, unknown> }).zeta_metadata;
        const zid =
          (r as { zeta_id?: string }).zeta_id ??
          (meta?.zeta_id as string | undefined) ??
          (meta?.RegistroCodigo as string | undefined);
        console.log(
          `    id=${r.id} zeta_id=${zid ?? "?"} ref=${r.reference} amt=${r.amount} date=${d} active=${r.is_active}`
        );
      }
    }
    if (codigo === "185") {
      console.log("\n  [PRESTIS facturas 2026]");
      for (const inv of invoices) {
        const d = String(inv.issue_date ?? "").slice(0, 10);
        if (!d.startsWith("2026")) continue;
        const num = inv.invoice_number ?? inv.serie_numero;
        const zid = (inv as { zeta_id?: string }).zeta_id;
        console.log(
          `    id=${inv.id} zeta_id=${zid ?? "?"} num=${num} total=${inv.total_amount} date=${d} active=${inv.is_active}`
        );
      }
    }
    if (codigo === "187") {
      console.log("\n  [Dolby UYU micro-facturas ene-2026]");
      for (const inv of invoices) {
        const d = String(inv.issue_date ?? "").slice(0, 10);
        if (!d.startsWith("2026-01")) continue;
        const total = Number(inv.total_amount);
        if (total > 200) continue;
        console.log(
          `    num=${inv.invoice_number} total=${inv.total_amount} date=${d}`
        );
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
