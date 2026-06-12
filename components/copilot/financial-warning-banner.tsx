import { FINANCIAL_UX_COPY } from "@/lib/copilot-financial-ux-copy";

export function FinancialWarningBanner({
  variant = "warning",
  className = "",
  body,
}: {
  variant?: "warning" | "info";
  className?: string;
  /** Si se omite, usa el texto estándar de `FINANCIAL_UX_COPY` (p. ej. variante reportes). */
  body?: string;
}) {
  if (variant === "info") {
    return (
      <div
        className={`rounded-2xl border border-[var(--copilot-border)] bg-[rgba(44,40,37,0.04)] px-4 py-3 text-sm text-[var(--copilot-ink)] ${className}`}
      >
        <p className="font-semibold">{FINANCIAL_UX_COPY.sourceInfoTitle}</p>
        <p className="mt-1 text-[var(--copilot-ink-muted)]">{FINANCIAL_UX_COPY.sourceInfoBody}</p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)]/90 px-4 py-3 text-sm text-[var(--copilot-warning-text-strong)] ${className}`}
    >
      <p className="font-semibold">{FINANCIAL_UX_COPY.warningTitle}</p>
      <p className="mt-1">{body ?? FINANCIAL_UX_COPY.warningBody}</p>
    </div>
  );
}
