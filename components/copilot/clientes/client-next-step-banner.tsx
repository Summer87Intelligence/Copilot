"use client";

import { useMemo } from "react";
import { ArrowRight, Compass } from "lucide-react";

import { useCollectionActions } from "@/hooks/use-collection-actions";
import type { Client360Payload } from "@/lib/copilot-client-360";
import { normalizeUruguayPhoneForWhatsApp } from "@/lib/phone/normalize-phone-for-whatsapp";
import { buildClientAgentBrief } from "@/lib/copilot-agents/build-client-agent-brief";
import { actionCardClass } from "@/components/copilot/ui/copilot-visual-system";

type ClientNextStepBannerProps = {
  data: Client360Payload;
  onNavigateTab: (tab: string) => void;
  onScrollToAssistant: () => void;
  onScrollToCollectionForm: () => void;
};

export function ClientNextStepBanner({
  data,
  onNavigateTab,
  onScrollToAssistant,
  onScrollToCollectionForm,
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

  return (
    <div
      className={`${actionCardClass} mx-6 mt-4 flex flex-col gap-3 border-[rgba(31,107,74,0.18)] bg-gradient-to-r from-white to-[rgba(31,107,74,0.05)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between`}
      aria-labelledby="client-next-step-title"
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <Compass className="mt-0.5 h-4 w-4 shrink-0 text-[var(--copilot-accent)]" aria-hidden />
        <div className="min-w-0">
          <p
            id="client-next-step-title"
            className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--copilot-accent)]"
          >
            Próximo paso
          </p>
          <p className="text-sm font-semibold text-[var(--copilot-ink)]">{stepTitle}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-[var(--copilot-ink-muted)]">
            {brief.mainFinding}
          </p>
        </div>
      </div>
      {brief.status !== "stable" || hasDebt ? (
        <button
          type="button"
          onClick={handlePrimaryCta}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 self-start rounded-xl bg-[var(--copilot-accent)] px-3.5 py-2 text-xs font-semibold text-white sm:self-center"
        >
          {brief.recommendedAction.label}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
