import { FINANCIAL_UX_COPY } from "@/lib/copilot-financial-ux-copy";
import type { DerivedFinancialFlags } from "@/lib/derive-financial-flags";

export function DataFreshnessBanner({
  freshness,
}: {
  freshness: Pick<DerivedFinancialFlags, "data_freshness_level" | "data_freshness_days">;
}) {
  if (freshness.data_freshness_level === "fresh") {
    return (
      <div className="rounded-xl border border-[var(--copilot-success-border)]/80 bg-[var(--copilot-tone-positive-bg)]/70 px-3 py-2 text-xs text-[var(--copilot-success-text-strong)]">
        <span className="font-semibold">{FINANCIAL_UX_COPY.freshnessFresh}</span>
        {freshness.data_freshness_days != null ? (
          <span className="ml-1 text-[var(--copilot-success-text-strong)]/90">
            (corte hace {freshness.data_freshness_days} día
            {freshness.data_freshness_days === 1 ? "" : "s"})
          </span>
        ) : null}
      </div>
    );
  }
  if (freshness.data_freshness_level === "stale") {
    return (
      <div className="rounded-xl border border-[var(--copilot-danger-border)]/80 bg-[var(--copilot-tone-danger-bg)]/75 px-3 py-2 text-xs text-[var(--copilot-danger-text-strong)]">
        <span className="font-semibold">{FINANCIAL_UX_COPY.freshnessStale}</span>
        {freshness.data_freshness_days != null ? (
          <span className="ml-1 text-[var(--copilot-danger-text-strong)]/90">
            (último corte hace {freshness.data_freshness_days} días)
          </span>
        ) : null}
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-[var(--copilot-warning-border)]/80 bg-[var(--copilot-tone-warning-bg)]/75 px-3 py-2 text-xs text-[var(--copilot-warning-text-strong)]">
      <span className="font-semibold">{FINANCIAL_UX_COPY.freshnessWarning}</span>
      <span className="ml-1 text-[var(--copilot-warning-text-strong)]/90">
        {freshness.data_freshness_days != null
          ? `(último corte hace ${freshness.data_freshness_days} días)`
          : "(sin fecha de corte explícita)"}
      </span>
    </div>
  );
}
