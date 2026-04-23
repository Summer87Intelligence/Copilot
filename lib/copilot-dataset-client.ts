import { copilotApiFetch } from "@/lib/copilot-fetch";
import type { ProtoActiveListMode } from "@/lib/copilot-proto-active";
import type { CopilotDatasetPayload } from "@/lib/copilot-dataset-types";

const cache = new Map<ProtoActiveListMode, CopilotDatasetPayload>();

export function invalidateCopilotDatasetCache(): void {
  cache.clear();
}

/**
 * Dataset tenant-scoped vía `GET /api/copilot/dataset` (sin cliente Supabase en browser).
 */
export async function getCopilotDataset(
  activeMode: ProtoActiveListMode = "active",
  opts?: { force?: boolean }
): Promise<CopilotDatasetPayload> {
  if (!opts?.force && cache.has(activeMode)) {
    return cache.get(activeMode)!;
  }
  const qs =
    activeMode === "active" ? "" : `?active=${encodeURIComponent(activeMode)}`;
  const res = await copilotApiFetch(`/api/copilot/dataset${qs}`);
  const json = (await res.json()) as {
    ok?: boolean;
    data?: unknown;
    error?: string;
  };
  if (!res.ok || !json.ok || json.data == null) {
    throw new Error(json.error ?? "No se pudo cargar el dataset de Copilot.");
  }
  const data = json.data as { data?: unknown } | CopilotDatasetPayload;
  const dataset =
    (data as { data?: Partial<CopilotDatasetPayload> | null })?.data ??
    data ??
    {};
  const src = dataset as Partial<CopilotDatasetPayload>;
  const normalized: CopilotDatasetPayload = {
    companies: Array.isArray(src.companies) ? src.companies : [],
    contacts: Array.isArray(src.contacts) ? src.contacts : [],
    invoices: Array.isArray(src.invoices) ? src.invoices : [],
    receipts: Array.isArray(src.receipts) ? src.receipts : [],
    payments: Array.isArray(src.payments) ? src.payments : [],
    obligations: Array.isArray(src.obligations) ? src.obligations : [],
    taxPayments: Array.isArray(src.taxPayments) ? src.taxPayments : [],
    rawImports: Array.isArray(src.rawImports) ? src.rawImports : [],
  };
  cache.set(activeMode, normalized);
  return normalized;
}
