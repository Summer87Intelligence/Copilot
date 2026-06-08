#!/usr/bin/env node
/**
 * Aplica backfill de ledger_opening_balance_* vía Supabase (mismo contenido que SQL).
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/apply-ledger-opening-backfill.ts
 *
 * NO commit automático — solo UPDATE en proto_companies.
 */

import { createClient } from "@supabase/supabase-js";

const UYU_BY_CODIGO: Record<string, number> = {
  "38": -700,
  "15": -20,
  "43": -10600,
  "78": 1830,
  "85": 4880,
  "107": 96624,
  "125": 24160,
  "149": 17080,
  "151": 42944,
  "155": 80,
  "157": 19520,
  "160": 240,
  "161": 30000,
  "162": 6832,
  "169": 24400,
  "170": 7320,
  "171": 15860,
  "174": 14640,
  "185": -12009,
  "200": -7320,
};

const USD_BY_CODIGO: Record<string, number> = {
  "1": -28,
  "2": 30.35,
  "31": 366,
  "33": -298.9,
  "34": 122,
  "60": 329.4,
  "67": 127.72,
  "77": 170.8,
  "109": -199.95,
  "121": 2597,
  "129": 610,
  "137": -679.6,
  "158": 463.6,
  "181": -122,
  "182": 1171.2,
};

const CLEAR_UYU = new Set(["13", "36", "144", "156", "90", "59", "110", "187"]);
const CLEAR_USD = new Set([
  "74", "150", "35", "78", "83", "90", "106", "114", "178", "188", "190", "191", "192", "187",
]);

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const wid = process.env.WORKSPACE_COMPANY_ID?.trim();
  if (!url || !key || !wid) {
    console.error("Faltan env vars Supabase/workspace");
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  let updated = 0;

  for (const [codigo, amount] of Object.entries(UYU_BY_CODIGO)) {
    const { data, error } = await sb
      .from("proto_companies")
      .update({ ledger_opening_balance_uyu: amount })
      .eq("workspace_company_id", wid)
      .eq("Codigo", codigo)
      .select("Codigo,name,ledger_opening_balance_uyu");
    if (error) throw error;
    if ((data ?? []).length > 0) {
      updated += 1;
      console.log(`UYU ${codigo} → ${amount}`, data![0]!.name);
    }
  }

  for (const codigo of CLEAR_UYU) {
    const { data } = await sb
      .from("proto_companies")
      .update({ ledger_opening_balance_uyu: null })
      .eq("workspace_company_id", wid)
      .eq("Codigo", codigo)
      .not("ledger_opening_balance_uyu", "is", null)
      .select("Codigo,name");
    if ((data ?? []).length > 0) {
      updated += 1;
      console.log(`UYU ${codigo} → NULL (clear)`);
    }
  }

  for (const [codigo, amount] of Object.entries(USD_BY_CODIGO)) {
    const { data, error } = await sb
      .from("proto_companies")
      .update({ ledger_opening_balance_usd: amount })
      .eq("workspace_company_id", wid)
      .eq("Codigo", codigo)
      .select("Codigo,name,ledger_opening_balance_usd");
    if (error) throw error;
    if ((data ?? []).length > 0) {
      updated += 1;
      console.log(`USD ${codigo} → ${amount}`, data![0]!.name);
    }
  }

  for (const codigo of CLEAR_USD) {
    const { data } = await sb
      .from("proto_companies")
      .update({ ledger_opening_balance_usd: null })
      .eq("workspace_company_id", wid)
      .eq("Codigo", codigo)
      .not("ledger_opening_balance_usd", "is", null)
      .select("Codigo,name");
    if ((data ?? []).length > 0) {
      updated += 1;
      console.log(`USD ${codigo} → NULL (clear)`);
    }
  }

  console.log(`\nFilas actualizadas: ${updated}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
