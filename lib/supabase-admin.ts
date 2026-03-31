import { supabase } from "./supabase-client";

const DASHBOARD_SEED_ROWS = [
  {
    scenario: "risk",
    cash_available: 120000,
    monthly_sales: 500000,
    pending_collections: 200000,
    monthly_expenses: 450000,
    cash_risk_days: 10,
    top_clients_concentration: 70,
    expenses_growth_percent: 20,
  },
  {
    scenario: "stable",
    cash_available: 400000,
    monthly_sales: 600000,
    pending_collections: 80000,
    monthly_expenses: 300000,
    cash_risk_days: 45,
    top_clients_concentration: 40,
    expenses_growth_percent: 8,
  },
  {
    scenario: "growth",
    cash_available: 300000,
    monthly_sales: 620000,
    pending_collections: 235000,
    monthly_expenses: 350000,
    cash_risk_days: 25,
    top_clients_concentration: 50,
    expenses_growth_percent: 12,
  },
] as const;

/**
 * Inserta los mismos datos que `supabase/init-dashboard.sql`.
 * No se invoca automáticamente. Con RLS solo-lectura en anon, el INSERT puede fallar
 * hasta que exista una policy de escritura o uses el SQL Editor / service role.
 */
export async function seedDashboardData() {
  return supabase.from("dashboard_snapshots").insert([...DASHBOARD_SEED_ROWS]);
}
