import type { SupabaseClient } from "@supabase/supabase-js";

import { buildTreasuryAlerts } from "@/lib/treasury/treasury-alert-engine";
import {
  buildTreasuryProjection,
  deriveOpeningBalancesFromManualCash,
  type TreasuryProjectionWindow,
} from "@/lib/treasury/treasury-cash-projection";
import { buildTreasuryInsights } from "@/lib/treasury/treasury-insights";
import { manualCashMovementRepositoryList } from "@/lib/treasury/repositories/manual-cash-movement-repository";
import { loadTreasuryCashflowBankMovements } from "@/lib/treasury/canonical/treasury-bank-source";
import { plannedCashObligationRepositoryList } from "@/lib/treasury/repositories/planned-cash-obligation-repository";
import { mapDbError, todayYmdUtc } from "@/lib/treasury/treasury-db-helpers";
import { resolveTreasuryWorkspaceId } from "@/lib/treasury/treasury-tenant";
import type { TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";
import { protoCrudResult, type ProtoCrudResult } from "@/lib/copilot-proto-crud-types";

export type TreasuryIntelligenceBundle = {
  asOfDate: string;
  horizonDays: TreasuryProjectionWindow;
  projection: ReturnType<typeof buildTreasuryProjection>;
  alerts: ReturnType<typeof buildTreasuryAlerts>;
  insights: ReturnType<typeof buildTreasuryInsights>;
  cashByCurrency: Partial<Record<TreasuryCurrencyCode, number>>;
};

async function loadTreasuryIntelligenceInputs(
  supabase: SupabaseClient,
  workspaceId: string
) {
  // FASE-4: el banco para cashflow entra por el único punto de transición legacy,
  // no por el repositorio directo. Resultado idéntico; solo cambia el origen.
  const [manual, bank, obligations] = await Promise.all([
    manualCashMovementRepositoryList(supabase, workspaceId, {}, 1000),
    loadTreasuryCashflowBankMovements(supabase, workspaceId, 1000),
    plannedCashObligationRepositoryList(supabase, workspaceId, {}, 1000),
  ]);

  if (manual.error) return { error: manual.error };
  if (bank.error) return { error: bank.error };
  if (obligations.error) return { error: obligations.error };

  return {
    manualMovements: manual.rows,
    bankMovements: bank.rows,
    obligations: obligations.rows,
    error: null,
  };
}

export async function treasuryIntelligenceBundle(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  options: {
    asOfDate?: string;
    horizonDays?: TreasuryProjectionWindow;
  } = {}
): Promise<ProtoCrudResult<TreasuryIntelligenceBundle>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
  const asOfDate = options.asOfDate ?? todayYmdUtc();
  const horizonDays = options.horizonDays ?? 30;

  const loaded = await loadTreasuryIntelligenceInputs(supabase, workspaceId);
  if (loaded.error) return mapDbError(loaded.error);

  const openingBalances = deriveOpeningBalancesFromManualCash(loaded.manualMovements);
  const projection = buildTreasuryProjection({
    asOfDate,
    horizonDays,
    openingBalances,
    manualMovements: loaded.manualMovements,
    bankMovements: loaded.bankMovements,
    obligations: loaded.obligations,
    zetaCollections: [],
  });

  const alerts = buildTreasuryAlerts({
    asOfDate,
    obligations: loaded.obligations,
    manualMovements: loaded.manualMovements,
    bankMovements: loaded.bankMovements,
    projection,
  });

  const insights = buildTreasuryInsights({
    asOfDate,
    alerts,
    projection,
    obligations: loaded.obligations,
    manualMovements: loaded.manualMovements,
    cashByCurrency: openingBalances,
  });

  return protoCrudResult.ok(
    {
      asOfDate,
      horizonDays,
      projection,
      alerts,
      insights,
      cashByCurrency: openingBalances,
    },
    "Inteligencia de tesorería calculada."
  );
}

export async function treasuryProjectionOnly(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  options: {
    asOfDate?: string;
    horizonDays?: TreasuryProjectionWindow;
  } = {}
): Promise<ProtoCrudResult<ReturnType<typeof buildTreasuryProjection>>> {
  const bundle = await treasuryIntelligenceBundle(supabase, tenantCompanyId, options);
  if (!bundle.ok) return bundle;
  return protoCrudResult.ok(bundle.data.projection, "Proyección de caja calculada.");
}

export async function treasuryAlertsOnly(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  options: { asOfDate?: string; horizonDays?: TreasuryProjectionWindow } = {}
): Promise<ProtoCrudResult<ReturnType<typeof buildTreasuryAlerts>>> {
  const bundle = await treasuryIntelligenceBundle(supabase, tenantCompanyId, options);
  if (!bundle.ok) return bundle;
  return protoCrudResult.ok(bundle.data.alerts, "Alertas de tesorería calculadas.");
}

export async function treasuryInsightsOnly(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  options: { asOfDate?: string; horizonDays?: TreasuryProjectionWindow } = {}
): Promise<ProtoCrudResult<ReturnType<typeof buildTreasuryInsights>>> {
  const bundle = await treasuryIntelligenceBundle(supabase, tenantCompanyId, options);
  if (!bundle.ok) return bundle;
  return protoCrudResult.ok(bundle.data.insights, "Insights de tesorería calculados.");
}
