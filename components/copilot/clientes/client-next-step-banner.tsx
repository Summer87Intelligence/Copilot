"use client";

import { useMemo } from "react";

import { useCollectionActions } from "@/hooks/use-collection-actions";
import type { Client360Payload } from "@/lib/copilot-client-360";
import { normalizeUruguayPhoneForWhatsApp } from "@/lib/phone/normalize-phone-for-whatsapp";
import { buildClientAgentBrief } from "@/lib/copilot-agents/build-client-agent-brief";

type ClientNextStepBannerProps = {
  data: Client360Payload;
  onNavigateTab: (tab: string) => void;
  onScrollToAssistant: () => void;
  onScrollToCollectionForm: () => void;
  onViewAccountStatement: () => void;
};

function formatDebtLine(debtUyu: number, debtUsd: number): string {
  const parts: string[] = [];
  if (debtUyu > 0) {
    parts.push(`$ ${debtUyu.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`);
  }
  if (debtUsd > 0) {
    parts.push(`U$S ${debtUsd.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`);
  }
  return parts.join(" · ") || "—";
}

export function ClientNextStepBanner({
  data,
  onNavigateTab,
  onScrollToAssistant,
  onScrollToCollectionForm,
  onViewAccountStatement,
}: ClientNextStepBannerProps) {
  const { actions } = useCollectionActions(data.summary.company_id);

  const latestAction = useMemo(() => {
    if (!actions.length) return null;
    return [...actions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }, [actions]);

  const brief = useMemo(() => {
    const waPhone = normalizeUruguayPhoneForWhatsApp(data.summary.phone);
    const hasEmail = data.contacts.some((c) => c.email != null);
    const lastMovement = data.cuenta.ultimos_movimientos[0] ?? null;

    const lastAction = latestAction
      ? {
          outcome:
            (latestAction.metadata as Record<string, unknown> | null)?.ui_outcome as string ||
            latestAction.status,
          channel: latestAction.actionType,
          createdAt: latestAction.createdAt,
          nextFollowUpAt: latestAction.nextActionDate,
          promiseDate: latestAction.promiseDate,
          promiseAmount: latestAction.promiseAmount,
          promiseCurrency: latestAction.promiseCurrency ?? null,
        }
      : null;

    return buildClientAgentBrief({
      clientName: data.summary.nombre_visible,
      debtUyu: data.debt_uyu,
      debtUsd: data.debt_usd,
      overdueUyu: data.overdue_uyu,
      overdueUsd: data.overdue_usd,
      invoiceCount: data.invoices.length,
      receiptCount: data.receipts.length,
      contactsCount: data.contacts.length,
      hasEmail,
      hasUsableWhatsapp: waPhone?.isValid ?? false,
      lastSyncAt: data.last_sync_at,
      lastMovement: lastMovement
        ? { kind: lastMovement.kind, date: lastMovement.fecha }
        : null,
      lastCollectionAction: lastAction,
    });
  }, [data, latestAction]);

  function handlePrimaryCta() {
    if (brief.recommendedAction.scrollToAssistant) {
      onScrollToAssistant();
      return;
    }
    if (brief.recommendedAction.label === "Ver seguimiento") {
      onScrollToCollectionForm();
      return;
    }
    if (brief.recommendedAction.tab) {
      onNavigateTab(brief.recommendedAction.tab);
    }
  }

  const hasDebt =
    data.debt_uyu > 0 ||
    data.debt_usd > 0 ||
    data.overdue_uyu > 0 ||
    data.overdue_usd > 0;

  const stepTitle =
    brief.status === "stable" && !hasDebt
      ? "Sin acción urgente"
      : brief.recommendedAction.label;

  const debtLine = formatDebtLine(data.debt_uyu, data.debt_usd);

  return (
    <div
      className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-4 py-3 shadow-sm"
      aria-labelledby="client-next-step-title"
    >
      <p
        id="client-next-step-title"
        className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--copilot-accent)]"
      >
        Próximo paso
      </p>
      <p className="mt-0.5 text-sm font-semibold text-[var(--copilot-ink)]">
        {stepTitle}
      </p>
      {hasDebt ? (
        <p className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--copilot-badge-warning-text)]">
          {debtLine}
        </p>
      ) : null}
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onViewAccountStatement}
          className="inline-flex items-center rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--copilot-ink)] hover:bg-[var(--copilot-soft-bg)] transition-colors"
        >
          Ver estado
        </button>
        {hasDebt ? (
          <button
            type="button"
            onClick={onScrollToAssistant}
            className="inline-flex items-center rounded-lg bg-[var(--copilot-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
          >
            Cobrar
          </button>
        ) : brief.status !== "stable" ? (
          <button
            type="button"
            onClick={handlePrimaryCta}
            className="inline-flex items-center rounded-lg bg-[var(--copilot-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
          >
            {brief.recommendedAction.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
