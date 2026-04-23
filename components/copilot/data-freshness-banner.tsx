import { FINANCIAL_UX_COPY } from "@/lib/copilot-financial-ux-copy";
import type { DerivedFinancialFlags } from "@/lib/derive-financial-flags";

export function DataFreshnessBanner({
  freshness,
}: {
  freshness: Pick<DerivedFinancialFlags, "data_freshness_level" | "data_freshness_days">;
}) {
  if (freshness.data_freshness_level === "fresh") {
    return (
      <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-950">
        <span className="font-semibold">{FINANCIAL_UX_COPY.freshnessFresh}</span>
        {freshness.data_freshness_days != null ? (
          <span className="ml-1 text-emerald-900/90">
            (corte hace {freshness.data_freshness_days} día
            {freshness.data_freshness_days === 1 ? "" : "s"})
          </span>
        ) : null}
      </div>
    );
  }
  if (freshness.data_freshness_level === "stale") {
    return (
      <div className="rounded-xl border border-rose-200/80 bg-rose-50/75 px-3 py-2 text-xs text-rose-950">
        <span className="font-semibold">{FINANCIAL_UX_COPY.freshnessStale}</span>
        {freshness.data_freshness_days != null ? (
          <span className="ml-1 text-rose-900/90">
            (último corte hace {freshness.data_freshness_days} días)
          </span>
        ) : null}
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-amber-200/80 bg-amber-50/75 px-3 py-2 text-xs text-amber-950">
      <span className="font-semibold">{FINANCIAL_UX_COPY.freshnessWarning}</span>
      <span className="ml-1 text-amber-900/90">
        {freshness.data_freshness_days != null
          ? `(último corte hace ${freshness.data_freshness_days} días)`
          : "(sin fecha de corte explícita)"}
      </span>
    </div>
  );
}
