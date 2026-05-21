/**
 * Seed demo local — pagos programados (planned_cash_obligations).
 * NO ejecutar en producción.
 *
 * Uso: node scripts/seed-treasury-scheduled-payments-demo.mjs
 * Requiere SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY en env.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const workspaceId = process.env.COPILOT_WORKSPACE_ID ?? process.env.WORKSPACE_COMPANY_ID;

if (!url || !key || !workspaceId) {
  console.error("Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y COPILOT_WORKSPACE_ID");
  process.exit(1);
}

const supabase = createClient(url, key);

const demos = [
  { title: "DGI — IVA mayo", obligation_type: "dgi", currency_code: "UYU", amount_estimated: 45000, due_date: "2026-06-10" },
  { title: "BPS — aportes", obligation_type: "bps", currency_code: "UYU", amount_estimated: 28000, due_date: "2026-06-05" },
  { title: "Sueldos — quincena", obligation_type: "salary", currency_code: "UYU", amount_estimated: 120000, due_date: "2026-05-28" },
  { title: "Proveedor SaaS", obligation_type: "supplier", currency_code: "USD", amount_estimated: 890, due_date: "2026-06-15" },
];

async function main() {
  for (const row of demos) {
    const { error } = await supabase.from("planned_cash_obligations").insert({
      workspace_id: workspaceId,
      title: row.title,
      obligation_type: row.obligation_type,
      direction: "outflow",
      amount_estimated: row.amount_estimated,
      currency_code: row.currency_code,
      due_date: row.due_date,
      recurrence: "none",
      status: "planned",
      source: "manual",
      affects_cashflow: true,
    });
    if (error) console.warn(row.title, error.message);
    else console.log("OK", row.title);
  }
}

main();
