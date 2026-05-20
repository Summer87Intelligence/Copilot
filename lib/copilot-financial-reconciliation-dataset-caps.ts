import type {
  FinancialReconciliationDatasetCaps,
  FinancialReconciliationDiagnostics,
} from "@/lib/copilot-financial-reconciliation";
import type { FetchAllRowsResult } from "@/lib/supabase-pagination";

export function buildFinancialReconciliationDatasetCaps(opts: {
  maxRows: number;
  invoices: Pick<FetchAllRowsResult<unknown>, "reachedMaxRows" | "pagesFetched" | "totalFetched">;
  receipts: Pick<FetchAllRowsResult<unknown>, "reachedMaxRows" | "pagesFetched" | "totalFetched">;
  companies: Pick<FetchAllRowsResult<unknown>, "reachedMaxRows" | "pagesFetched" | "totalFetched">;
}): FinancialReconciliationDiagnostics {
  const tables_at_cap: string[] = [];
  if (opts.invoices.reachedMaxRows) tables_at_cap.push("proto_invoices");
  if (opts.receipts.reachedMaxRows) tables_at_cap.push("proto_receipts");
  if (opts.companies.reachedMaxRows) tables_at_cap.push("proto_companies");

  const isTruncated = tables_at_cap.length > 0;
  let severity: FinancialReconciliationDatasetCaps["severity"] = null;
  if (isTruncated) {
    severity = opts.invoices.reachedMaxRows ? "critical" : "warning";
  }

  const note = !isTruncated
    ? "Carga paginada completa dentro del límite de seguridad."
    : severity === "critical"
      ? `Dataset parcial: proto_invoices alcanzó el límite de ${opts.maxRows} filas. Los KPIs de cartera pueden estar subestimados.`
      : `Dataset parcial: ${tables_at_cap.join(", ")} alcanzaron el límite de ${opts.maxRows} filas. Revisar collected/opening si aplica.`;

  return {
    dataset_caps: {
      row_cap: opts.maxRows,
      isTruncated,
      tables_at_cap,
      severity,
      pages_fetched: {
        proto_invoices: opts.invoices.pagesFetched,
        proto_receipts: opts.receipts.pagesFetched,
        proto_companies: opts.companies.pagesFetched,
      },
      note,
    },
  };
}
