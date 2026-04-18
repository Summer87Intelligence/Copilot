import type { OperationalSupabase } from "@/lib/data/supabase-operational-data";

type DashboardSnapshotInsertRow = {
  company_id: string;
  scenario: string;
  cash_available: number;
  monthly_sales: number;
  pending_collections: number;
  monthly_expenses: number;
  cash_risk_days: number;
  top_clients_concentration: number;
  expenses_growth_percent: number;
  created_at: string;
};

/**
 * Último snapshot por empresa + escenario (orden `created_at` DESC, una fila).
 */
export async function selectLatestDashboardSnapshotByCompanyAndScenario(
  client: OperationalSupabase,
  companyId: string,
  scenario: string
) {
  return client
    .from("dashboard_snapshots")
    .select("*")
    .eq("company_id", companyId)
    .eq("scenario", scenario)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

/**
 * Hasta dos snapshots recientes para escenario + empresa (anterior = índice 1).
 */
export async function selectTwoLatestDashboardSnapshotsByCompanyAndScenario(
  client: OperationalSupabase,
  companyId: string,
  scenario: string
) {
  return client
    .from("dashboard_snapshots")
    .select("*")
    .eq("company_id", companyId)
    .eq("scenario", scenario)
    .order("created_at", { ascending: false })
    .limit(2);
}

/**
 * Último snapshot por empresa (cualquier escenario), por `created_at` DESC.
 */
export async function selectLatestDashboardSnapshotByCompany(
  client: OperationalSupabase,
  companyId: string
) {
  return client
    .from("dashboard_snapshots")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

export async function insertDashboardSnapshotRow(
  client: OperationalSupabase,
  row: DashboardSnapshotInsertRow
) {
  return client.from("dashboard_snapshots").insert(row).select("id").single();
}
