import type { ReactNode } from "react";

import { FINANCIAL_UX_COPY } from "@/lib/copilot-financial-ux-copy";
import type { DerivedFinancialFlags } from "@/lib/derive-financial-flags";

type FinancialStatusBadgeFlags = Pick<
  DerivedFinancialFlags,
  "financial_state_label" | "external_validated_with_open_invoices"
>;

export function FinancialStatusBadge({ flags }: { flags: FinancialStatusBadgeFlags }) {
  let main: ReactNode;
  if (flags.financial_state_label === "not_closed") {
    main = (
      <span
        className="inline-flex items-center rounded-full bg-[var(--copilot-tone-warning-bg)]/90 px-2.5 py-1 text-xs font-semibold text-[var(--copilot-warning-text-strong)]"
        title="Hay saldo operativo abierto en esta vista; el período no se considera cerrado."
      >
        {FINANCIAL_UX_COPY.notClosed}
      </span>
    );
  } else if (flags.financial_state_label === "closed_validated") {
    main = (
      <span
        className="inline-flex items-center rounded-full bg-[var(--copilot-tone-positive-bg)]/80 px-2.5 py-1 text-xs font-semibold text-[var(--copilot-success-text-strong)]"
        title="Sin saldo operativo abierto en esta vista y validación externa registrada."
      >
        {FINANCIAL_UX_COPY.closedValidated}
      </span>
    );
  } else {
    main = (
      <span
        className="inline-flex items-center rounded-full bg-[rgba(44,40,37,0.08)] px-2.5 py-1 text-xs font-semibold text-[var(--copilot-ink)]"
        title="Sin saldo operativo abierto en esta vista; falta validación externa para considerar cierre financiero."
      >
        {FINANCIAL_UX_COPY.noOpenBalanceNotValidated}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {main}
      {flags.external_validated_with_open_invoices ? (
        <span
          className="inline-flex max-w-[min(100%,18rem)] items-center rounded-full border border-[var(--copilot-border)] bg-[rgba(44,40,37,0.04)] px-2 py-0.5 text-[11px] font-medium leading-snug text-[var(--copilot-ink-muted)]"
          title={FINANCIAL_UX_COPY.externalValidationWithOpenAux}
        >
          {FINANCIAL_UX_COPY.externalValidationRegisteredBadge}
        </span>
      ) : null}
    </span>
  );
}
