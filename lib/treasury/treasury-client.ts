import { copilotApiFetch } from "@/lib/copilot-fetch";
import type { TreasuryAlert } from "@/lib/treasury/treasury-alert-engine";
import type { TreasuryCashProjectionResult } from "@/lib/treasury/treasury-cash-projection";
import type { TreasuryInsight } from "@/lib/treasury/treasury-insights";
import type {
  GeneratedObligationDraft,
  PlannedCashObligationTemplate,
} from "@/lib/treasury/treasury-recurring-obligations";
import type { CashPositionByCurrency } from "@/lib/treasury/treasury-cash-position";
import type {
  BankReconciliationMovement,
  ManualCashMovement,
  PlannedCashObligation,
  TreasuryAccount,
  TreasuryCurrencyCode,
} from "@/lib/treasury/treasury-types";

export type TreasuryListEnvelope<T> = {
  items: T[];
  count: number;
};

export type TreasuryApiSuccess<T> = {
  ok: true;
  data: T;
  message: string;
};

export type TreasuryApiFailure = {
  ok: false;
  code: string;
  message: string;
};

export type TreasuryApiResult<T> = TreasuryApiSuccess<T> | TreasuryApiFailure;

export const TREASURY_API = {
  accounts: "/api/copilot/treasury/accounts",
  account: (id: string) => `/api/copilot/treasury/accounts/${id}`,
  deactivateAccount: (id: string) => `/api/copilot/treasury/accounts/${id}/deactivate`,
  manualCash: "/api/copilot/treasury/manual-cash-movements",
  manualCashItem: (id: string) => `/api/copilot/treasury/manual-cash-movements/${id}`,
  archiveManualCash: (id: string) => `/api/copilot/treasury/manual-cash-movements/${id}/archive`,
  bankMovements: "/api/copilot/treasury/bank-reconciliation-movements",
  bankMovement: (id: string) => `/api/copilot/treasury/bank-reconciliation-movements/${id}`,
  matchBank: (id: string) => `/api/copilot/treasury/bank-reconciliation-movements/${id}/match`,
  ignoreBank: (id: string) => `/api/copilot/treasury/bank-reconciliation-movements/${id}/ignore`,
  obligations: "/api/copilot/treasury/planned-cash-obligations",
  obligation: (id: string) => `/api/copilot/treasury/planned-cash-obligations/${id}`,
  confirmObligation: (id: string) => `/api/copilot/treasury/planned-cash-obligations/${id}/confirm`,
  paidObligation: (id: string) => `/api/copilot/treasury/planned-cash-obligations/${id}/paid`,
  cancelObligation: (id: string) => `/api/copilot/treasury/planned-cash-obligations/${id}/cancel`,
  scheduledPayment: (id: string) => `/api/copilot/treasury/scheduled-payments/${id}`,
  markPaidScheduledPayment: (id: string) => `/api/copilot/treasury/scheduled-payments/${id}/mark-paid`,
  upcomingObligations: "/api/copilot/treasury/planned-cash-obligations/upcoming",
  overdueObligations: "/api/copilot/treasury/planned-cash-obligations/overdue",
  importBankMovements: "/api/copilot/treasury/bank-reconciliation-movements/import",
  parseBankStatement: "/api/copilot/treasury/bank-reconciliation-movements/parse",
  projection: "/api/copilot/treasury/projection",
  alerts: "/api/copilot/treasury/alerts",
  insights: "/api/copilot/treasury/insights",
  recurringObligations: "/api/copilot/treasury/recurring-obligations",
  cashPosition: "/api/copilot/treasury/cash-position",
} as const;

export type TreasuryWorkspaceFilters = {
  currencyCode?: TreasuryCurrencyCode | "all";
  fromDate?: string;
  toDate?: string;
};

function buildQuery(filters: TreasuryWorkspaceFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.currencyCode && filters.currencyCode !== "all") {
    params.set("currency_code", filters.currencyCode);
  }
  if (filters.fromDate) params.set("from_date", filters.fromDate);
  if (filters.toDate) params.set("to_date", filters.toDate);
  const q = params.toString();
  return q ? `?${q}` : "";
}

async function readJson<T>(res: Response): Promise<TreasuryApiResult<T>> {
  const json = (await res.json()) as TreasuryApiResult<T>;
  if (!res.ok && json.ok === false) return json;
  if (!res.ok) {
    return {
      ok: false,
      code: "HTTP",
      message: `Error HTTP ${res.status}`,
    };
  }
  return json;
}

export async function fetchTreasuryCashPosition(): Promise<
  TreasuryApiResult<{ positions: CashPositionByCurrency[]; openingBalances: unknown[] }>
> {
  const res = await copilotApiFetch(TREASURY_API.cashPosition);
  return readJson(res);
}

export async function fetchTreasuryAccounts(
  filters?: TreasuryWorkspaceFilters
): Promise<TreasuryApiResult<TreasuryListEnvelope<TreasuryAccount>>> {
  const res = await copilotApiFetch(`${TREASURY_API.accounts}${buildQuery(filters)}`);
  return readJson(res);
}

export async function fetchTreasuryManualCash(
  filters?: TreasuryWorkspaceFilters
): Promise<TreasuryApiResult<TreasuryListEnvelope<ManualCashMovement>>> {
  const res = await copilotApiFetch(`${TREASURY_API.manualCash}${buildQuery(filters)}`);
  return readJson(res);
}

export async function fetchTreasuryBankMovements(
  filters?: TreasuryWorkspaceFilters
): Promise<TreasuryApiResult<TreasuryListEnvelope<BankReconciliationMovement>>> {
  const res = await copilotApiFetch(`${TREASURY_API.bankMovements}${buildQuery(filters)}`);
  return readJson(res);
}

export async function fetchTreasuryObligations(
  filters?: TreasuryWorkspaceFilters
): Promise<TreasuryApiResult<TreasuryListEnvelope<PlannedCashObligation>>> {
  const res = await copilotApiFetch(`${TREASURY_API.obligations}${buildQuery(filters)}`);
  return readJson(res);
}

export async function fetchTreasuryUpcomingObligations(
  days: number,
  asOfDate?: string
): Promise<TreasuryApiResult<TreasuryListEnvelope<PlannedCashObligation>>> {
  const params = new URLSearchParams({ days: String(days) });
  if (asOfDate) params.set("as_of", asOfDate);
  const res = await copilotApiFetch(`${TREASURY_API.upcomingObligations}?${params}`);
  return readJson(res);
}

export async function fetchTreasuryOverdueObligations(
  asOfDate?: string
): Promise<TreasuryApiResult<TreasuryListEnvelope<PlannedCashObligation>>> {
  const params = new URLSearchParams();
  if (asOfDate) params.set("as_of", asOfDate);
  const q = params.toString();
  const res = await copilotApiFetch(
    `${TREASURY_API.overdueObligations}${q ? `?${q}` : ""}`
  );
  return readJson(res);
}

export async function fetchTreasuryProjection(
  horizonDays = 30,
  asOfDate?: string
): Promise<TreasuryApiResult<TreasuryCashProjectionResult>> {
  const params = new URLSearchParams({ horizon_days: String(horizonDays) });
  if (asOfDate) params.set("as_of", asOfDate);
  const res = await copilotApiFetch(`${TREASURY_API.projection}?${params}`);
  return readJson(res);
}

export async function fetchTreasuryAlerts(
  horizonDays = 30,
  asOfDate?: string
): Promise<TreasuryApiResult<TreasuryAlert[]>> {
  const params = new URLSearchParams({ horizon_days: String(horizonDays) });
  if (asOfDate) params.set("as_of", asOfDate);
  const res = await copilotApiFetch(`${TREASURY_API.alerts}?${params}`);
  return readJson(res);
}

export async function fetchTreasuryInsights(
  horizonDays = 30,
  asOfDate?: string
): Promise<TreasuryApiResult<TreasuryInsight[]>> {
  const params = new URLSearchParams({ horizon_days: String(horizonDays) });
  if (asOfDate) params.set("as_of", asOfDate);
  const res = await copilotApiFetch(`${TREASURY_API.insights}?${params}`);
  return readJson(res);
}

export async function fetchRecurringObligationTemplates(
  activeOnly = false
): Promise<TreasuryApiResult<TreasuryListEnvelope<PlannedCashObligationTemplate>>> {
  const params = new URLSearchParams();
  if (activeOnly) params.set("active_only", "true");
  const q = params.toString();
  const res = await copilotApiFetch(
    `${TREASURY_API.recurringObligations}${q ? `?${q}` : ""}`
  );
  return readJson(res);
}

export async function generateRecurringObligations(
  body: Record<string, unknown>
): Promise<
  TreasuryApiResult<{ drafts: GeneratedObligationDraft[]; created: PlannedCashObligation[] }>
> {
  return treasuryApiPost(TREASURY_API.recurringObligations, body);
}

export async function treasuryApiPost<T>(
  path: string,
  body: Record<string, unknown>
): Promise<TreasuryApiResult<T>> {
  const res = await copilotApiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJson(res);
}

export async function treasuryApiPatch<T>(
  path: string,
  body: Record<string, unknown>
): Promise<TreasuryApiResult<T>> {
  const res = await copilotApiFetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJson(res);
}

export async function treasuryApiDelete<T>(path: string): Promise<TreasuryApiResult<T>> {
  const res = await copilotApiFetch(path, { method: "DELETE" });
  return readJson(res);
}

export function treasuryErrorMessage(result: TreasuryApiFailure): string {
  return result.message || "No se pudo completar la operación.";
}

export type {
  BankImportPreviewRow,
  SantanderImportSummary,
} from "@/lib/treasury/santander-import-reconciliation";

export type BankImportResult = {
  preview: import("@/lib/treasury/santander-import-reconciliation").EnrichedSantanderImportRow[];
  summary: import("@/lib/treasury/santander-import-reconciliation").SantanderImportSummary;
  imported: BankReconciliationMovement[];
  importedCount: number;
  skippedDuplicates: number;
  autoMatchedCount: number;
};

export async function treasuryImportBankMovements(
  body: Record<string, unknown>
): Promise<TreasuryApiResult<BankImportResult>> {
  const res = await copilotApiFetch(TREASURY_API.importBankMovements, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJson(res);
}

export type SantanderBankStatementParseResult = {
  metadata: import("@/lib/treasury/santander-pdf-statement-parser").SantanderPdfMetadata;
  movements: import("@/lib/treasury/santander-statement-parser").SantanderParsedMovement[];
};

export async function treasuryParseBankStatement(
  file: File
): Promise<TreasuryApiResult<SantanderBankStatementParseResult>> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await copilotApiFetch(TREASURY_API.parseBankStatement, {
    method: "POST",
    body: formData,
  });
  return readJson(res);
}
