#!/usr/bin/env node
/**
 * Diagnóstico: clientes con deuda en facturas vs filas en proto_companies activas.
 *
 * Uso (desde raíz del repo, con .env.local):
 *   node scripts/audit-clients-cartera-gap.mjs
 *
 * Requiere: SUPABASE_SERVICE_ROLE_KEY, WORKSPACE_COMPANY_ID (o NEXT_PUBLIC_*)
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const workspaceId =
  process.env.WORKSPACE_COMPANY_ID ??
  process.env.NEXT_PUBLIC_WORKSPACE_COMPANY_ID;

if (!url || !key || !workspaceId) {
  console.error("Falta SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o WORKSPACE_COMPANY_ID");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const EPS = 0.005;

function num(v) {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  const [{ data: companies, error: cErr }, { data: invoices, error: iErr }] =
    await Promise.all([
      supabase
        .from("proto_companies")
        .select("id, name, is_active")
        .eq("workspace_company_id", workspaceId)
        .eq("is_active", true)
        .limit(5000),
      supabase
        .from("proto_invoices")
        .select("id, company_id, balance_amount, total_amount, status, currency_code")
        .eq("workspace_company_id", workspaceId)
        .eq("is_active", true)
        .gte("issue_date", "2026-01-01")
        .limit(5000),
    ]);

  if (cErr) throw cErr;
  if (iErr) throw iErr;

  const activeIds = new Set((companies ?? []).map((c) => String(c.id)));
  const debtByCompany = new Map();

  for (const inv of invoices ?? []) {
    const st = String(inv.status ?? "").toLowerCase();
    if (st === "void" || st === "voided" || st === "cancelled") continue;
    const cid = String(inv.company_id ?? "").trim();
    if (!cid) continue;
    const bal = num(inv.balance_amount);
    const pending = bal > 0 ? bal : num(inv.total_amount);
    if (pending <= EPS) continue;
    debtByCompany.set(cid, (debtByCompany.get(cid) ?? 0) + pending);
  }

  const debtors = [...debtByCompany.keys()];
  const missingInActiveCompanies = debtors.filter((id) => !activeIds.has(id));

  let inactiveWithDebt = 0;
  if (missingInActiveCompanies.length > 0) {
    const { data: extra } = await supabase
      .from("proto_companies")
      .select("id, name, is_active")
      .eq("workspace_company_id", workspaceId)
      .in("id", missingInActiveCompanies.slice(0, 200));
    inactiveWithDebt = (extra ?? []).filter((c) => c.is_active === false).length;
  }

  const orphanDebtors = missingInActiveCompanies.length - inactiveWithDebt;

  console.log("\n=== Audit Clientes vs Cartera (deuda en facturas) ===\n");
  console.log(`Workspace: ${workspaceId}`);
  console.log(`proto_companies activas cargadas: ${activeIds.size}`);
  console.log(`proto_invoices (activas, >= 2026-01-01): ${(invoices ?? []).length}`);
  console.log(`Clientes con saldo pendiente (facturas): ${debtors.length}`);
  console.log(`Deudores NO en lista activa (causa típica /clientes): ${missingInActiveCompanies.length}`);
  console.log(`  → inactivos en proto_companies: ${inactiveWithDebt}`);
  console.log(`  → sin fila empresa (solo facturación): ${orphanDebtors}`);
  console.log("\nMuestra de deudores ausentes en activos (max 15):");
  for (const id of missingInActiveCompanies.slice(0, 15)) {
    console.log(`  - ${id}  pendiente≈${Math.round(debtByCompany.get(id))}`);
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
