import type { DashboardSnapshot } from "@/lib/dashboard-data";
import { insertDashboardSnapshotRow } from "@/lib/data/dashboard-snapshot-repository";
import { supabase } from "@/lib/supabase-client";

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

export type SaveDashboardSnapshotResult = {
  success: boolean;
  id: string | null;
  error: Error | null;
};

const DEFAULT_SCENARIO = "csv-import";

/**
 * Persistencia manual de snapshot para pruebas/incremental rollout.
 * No usa service role: respeta sesión de usuario y políticas RLS del cliente Supabase.
 */
export async function saveDashboardSnapshot(
  snapshot: DashboardSnapshot,
  companyId: string,
  scenario: string = DEFAULT_SCENARIO,
): Promise<SaveDashboardSnapshotResult> {
  const row: DashboardSnapshotInsertRow = {
    company_id: companyId,
    scenario,
    cash_available: snapshot.cashAvailable,
    monthly_sales: snapshot.monthlySales,
    pending_collections: snapshot.pendingCollections,
    monthly_expenses: snapshot.monthlyExpenses,
    cash_risk_days: snapshot.cashRiskDays,
    top_clients_concentration: snapshot.topClientsConcentration,
    expenses_growth_percent: snapshot.expensesGrowthPercent,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await insertDashboardSnapshotRow(supabase, row);

  if (error) {
    return { success: false, id: null, error: new Error(error.message) };
  }

  const id =
    data && typeof data === "object" && "id" in data && typeof data.id === "string"
      ? data.id
      : null;

  return { success: true, id, error: null };
}

