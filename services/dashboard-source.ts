import {
  dashboardScenarios,
  type DashboardScenarioName,
  type DashboardSnapshot,
} from "@/lib/dashboard-data";
import {
  selectLatestDashboardSnapshotByCompany,
  selectLatestDashboardSnapshotByCompanyAndScenario,
  selectTwoLatestDashboardSnapshotsByCompanyAndScenario,
} from "@/lib/data/dashboard-snapshot-repository";
import { getCurrentAppUserContext } from "@/lib/current-user-context";
import { supabase } from "@/lib/supabase-client";
import { getDemoCompany } from "@/services/company-source";
import type { DashboardSnapshotRecord } from "@/types/dashboard-source";

const DEFAULT_SCENARIO: DashboardScenarioName = "risk";
export type DashboardSnapshotScenario = DashboardScenarioName | "csv-import";

type DashboardSnapshotRow = {
  id?: unknown;
  data?: unknown;
  scenario?: string | null;
  cash_available?: unknown;
  monthly_sales?: unknown;
  pending_collections?: unknown;
  monthly_expenses?: unknown;
  cash_risk_days?: unknown;
  top_clients_concentration?: unknown;
  expenses_growth_percent?: unknown;
};

function toFiniteNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapRowToSnapshot(row: DashboardSnapshotRow): DashboardSnapshot | null {
  if (row.data && typeof row.data === "object") {
    const payload = row.data as Record<string, unknown>;
    const cashAvailable = toFiniteNumber(
      payload.cashAvailable ?? payload.cash_available
    );
    const monthlySales = toFiniteNumber(
      payload.monthlySales ?? payload.monthly_sales
    );
    const pendingCollections = toFiniteNumber(
      payload.pendingCollections ?? payload.pending_collections
    );
    const monthlyExpenses = toFiniteNumber(
      payload.monthlyExpenses ?? payload.monthly_expenses
    );
    const cashRiskDays = toFiniteNumber(payload.cashRiskDays ?? payload.cash_risk_days);
    const topClientsConcentration = toFiniteNumber(
      payload.topClientsConcentration ?? payload.top_clients_concentration
    );
    const expensesGrowthPercent = toFiniteNumber(
      payload.expensesGrowthPercent ?? payload.expenses_growth_percent
    );

    if (
      cashAvailable !== null &&
      monthlySales !== null &&
      pendingCollections !== null &&
      monthlyExpenses !== null &&
      cashRiskDays !== null &&
      topClientsConcentration !== null &&
      expensesGrowthPercent !== null
    ) {
      return {
        cashAvailable,
        monthlySales,
        pendingCollections,
        monthlyExpenses,
        cashRiskDays,
        topClientsConcentration,
        expensesGrowthPercent,
      };
    }
  }

  const cashAvailable = toFiniteNumber(row.cash_available);
  const monthlySales = toFiniteNumber(row.monthly_sales);
  const pendingCollections = toFiniteNumber(row.pending_collections);
  const monthlyExpenses = toFiniteNumber(row.monthly_expenses);
  const cashRiskDays = toFiniteNumber(row.cash_risk_days);
  const topClientsConcentration = toFiniteNumber(row.top_clients_concentration);
  const expensesGrowthPercent = toFiniteNumber(row.expenses_growth_percent);

  if (
    cashAvailable === null ||
    monthlySales === null ||
    pendingCollections === null ||
    monthlyExpenses === null ||
    cashRiskDays === null ||
    topClientsConcentration === null ||
    expensesGrowthPercent === null
  ) {
    return null;
  }

  return {
    cashAvailable,
    monthlySales,
    pendingCollections,
    monthlyExpenses,
    cashRiskDays,
    topClientsConcentration,
    expensesGrowthPercent,
  };
}

function toFallbackScenarioName(
  scenario: DashboardSnapshotScenario
): DashboardScenarioName {
  if (scenario === "risk" || scenario === "stable" || scenario === "growth") {
    return scenario;
  }
  return DEFAULT_SCENARIO;
}

function fallbackSnapshot(
  scenario: DashboardSnapshotScenario
): DashboardSnapshot {
  const key = toFallbackScenarioName(scenario);
  return dashboardScenarios[key] ?? dashboardScenarios[DEFAULT_SCENARIO];
}

function parseRowId(row: DashboardSnapshotRow): string | null {
  const id = row.id;
  if (typeof id === "string" && id.length > 0) {
    return id;
  }
  return null;
}

function fallbackRecord(
  scenario: DashboardSnapshotScenario
): DashboardSnapshotRecord {
  const key = scenario ?? DEFAULT_SCENARIO;
  return { id: null, snapshot: fallbackSnapshot(key) };
}

/**
 * Prioridad: empresa del `app_users` vinculado al auth → empresa demo → null (mocks).
 */
async function resolveEffectiveCompanyId(): Promise<string | null> {
  const ctx = await getCurrentAppUserContext();
  if (ctx?.companyId) {
    return ctx.companyId;
  }

  const demoCompany = await getDemoCompany();
  if (demoCompany) {
    return demoCompany.id;
  }

  return null;
}

/**
 * Último snapshot por empresa + escenario, con `id` de fila para trazabilidad
 * (p. ej. `copilot_insights.snapshot_id`). Si no hay datos, `id` null y snapshot mock.
 */
export async function getDashboardSnapshotRecordByScenario(
  scenario?: DashboardSnapshotScenario
): Promise<DashboardSnapshotRecord> {
  const key = scenario ?? DEFAULT_SCENARIO;

  const companyId = await resolveEffectiveCompanyId();
  if (!companyId) {
    return fallbackRecord(key);
  }

  const { data, error } = await selectLatestDashboardSnapshotByCompanyAndScenario(
    supabase,
    companyId,
    key
  );

  if (error || !data) {
    return fallbackRecord(key);
  }

  const row = data as DashboardSnapshotRow;
  const mapped = mapRowToSnapshot(row);
  if (!mapped) {
    return fallbackRecord(key);
  }

  return {
    id: parseRowId(row),
    snapshot: mapped,
  };
}

export async function getDashboardSnapshotFromDB(
  scenario?: DashboardSnapshotScenario
): Promise<DashboardSnapshot> {
  const record = await getDashboardSnapshotRecordByScenario(scenario);
  return record.snapshot;
}

/**
 * Snapshot inmediatamente anterior al más reciente para el mismo escenario y empresa
 * (segundo registro por `created_at` DESC). Requiere al menos dos filas en DB.
 */
export async function getPreviousDashboardSnapshotFromDB(
  scenario?: DashboardSnapshotScenario
): Promise<DashboardSnapshot | null> {
  const key = scenario ?? DEFAULT_SCENARIO;

  const companyId = await resolveEffectiveCompanyId();
  if (!companyId) {
    return null;
  }

  const { data, error } = await selectTwoLatestDashboardSnapshotsByCompanyAndScenario(
    supabase,
    companyId,
    key
  );

  if (error || !data || data.length < 2) {
    return null;
  }

  const row = data[1] as DashboardSnapshotRow;
  return mapRowToSnapshot(row);
}

export async function getDashboardSnapshotByScenario(
  scenario?: DashboardSnapshotScenario
): Promise<DashboardSnapshot> {
  return getDashboardSnapshotFromDB(scenario);
}

/**
 * Último snapshot por empresa (sin filtrar por escenario), ordenado por created_at DESC.
 * Devuelve null cuando no hay filas o no se puede mapear el payload.
 */
export async function getLatestSnapshot(
  companyId: string
): Promise<DashboardSnapshotRecord | null> {
  const { data, error } = await selectLatestDashboardSnapshotByCompany(
    supabase,
    companyId
  );

  if (error || !data) {
    return null;
  }

  const row = data as DashboardSnapshotRow;
  const mapped = mapRowToSnapshot(row);
  if (!mapped) {
    return null;
  }

  return {
    id: parseRowId(row),
    snapshot: mapped,
  };
}
