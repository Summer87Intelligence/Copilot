"use client";

import { useMemo } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Database,
  MessageCircle,
  TriangleAlert,
  User,
  Wallet,
} from "lucide-react";

import { useCollectionActions } from "@/hooks/use-collection-actions";
import type { Client360Payload } from "@/lib/copilot-client-360";
import { normalizeUruguayPhoneForWhatsApp } from "@/lib/phone/normalize-phone-for-whatsapp";
import {
  buildClientAgentBrief,
  type ClientAgentBrief,
  type ClientAgentInsight,
} from "@/lib/copilot-agents/build-client-agent-brief";

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG = {
  stable: {
    icon: CheckCircle2,
    iconCls: "text-[var(--copilot-success-text)]",
    label: "Al día",
    badgeCls: "bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)] border-[var(--copilot-success-border)]",
    bannerCls: "bg-[var(--copilot-tone-positive-bg)] border-[var(--copilot-success-border)]",
  },
  attention: {
    icon: CircleDot,
    iconCls: "text-[var(--copilot-warning-text)]",
    label: "Atención",
    badgeCls: "bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)] border-[var(--copilot-warning-border)]",
    bannerCls: "bg-[var(--copilot-tone-warning-bg)] border-[var(--copilot-warning-border)]",
  },
  critical: {
    icon: TriangleAlert,
    iconCls: "text-[var(--copilot-danger-text)]",
    label: "Gestión urgente",
    badgeCls: "bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)] border-[var(--copilot-danger-border)]",
    bannerCls: "bg-[var(--copilot-tone-danger-bg)] border-[var(--copilot-danger-border)]",
  },
} as const;

const SEVERITY_DOT: Record<ClientAgentInsight["severity"], string> = {
  critical: "bg-[var(--copilot-danger-text)]",
  high: "bg-[var(--copilot-warning-text)]",
  medium: "bg-sky-400",
  low: "bg-[var(--copilot-subtle)]",
};

const HIDDEN_AGENT_INSIGHT_IDS = new Set([
  "last-movement",
  "contact-ok",
  "contact-email",
  "contact-wa",
]);

const TAB_ICON: Record<string, typeof User> = {
  contactos: User,
  zeta: Database,
  cuenta: Wallet,
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function InsightPill({ insight }: { insight: ClientAgentInsight }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-2.5">
      <span
        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[insight.severity]}`}
      />
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-[var(--copilot-ink)]">{insight.title}</p>
        <p className="text-[11.5px] leading-snug text-[var(--copilot-ink-muted)]">{insight.body}</p>
      </div>
    </div>
  );
}

function AgentResults({
  brief,
  onNavigateTab,
  onScrollToAssistant,
}: {
  brief: ClientAgentBrief;
  onNavigateTab: (tab: string) => void;
  onScrollToAssistant: () => void;
}) {
  const cfg = STATUS_CFG[brief.status];
  const StatusIcon = cfg.icon;

  function handleCta() {
    if (brief.recommendedAction.scrollToAssistant) {
      onScrollToAssistant();
    } else if (brief.recommendedAction.tab) {
      onNavigateTab(brief.recommendedAction.tab);
    }
  }

  const CtaIcon = brief.recommendedAction.scrollToAssistant
    ? MessageCircle
    : brief.recommendedAction.tab
      ? (TAB_ICON[brief.recommendedAction.tab] ?? ArrowRight)
      : ArrowRight;

  return (
    <div className="space-y-3">
      {/* Status banner */}
      <div className={`flex items-start gap-3 rounded-xl border p-3.5 ${cfg.bannerCls}`}>
        <StatusIcon className={`mt-0.5 h-4 w-4 shrink-0 ${cfg.iconCls}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-[var(--copilot-ink)]">
              Estado del cliente
            </span>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold leading-none ${cfg.badgeCls}`}
            >
              {cfg.label}
            </span>
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--copilot-ink-muted)]">
            {brief.summary}
          </p>
        </div>
      </div>

      {/* Three diagnosis blocks */}
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--copilot-border)] bg-[rgba(44,40,37,0.03)] px-3.5 py-3">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]">
            Qué pasa
          </p>
          <p className="text-[13px] leading-snug text-[var(--copilot-ink)]">
            {brief.mainFinding}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--copilot-border)] bg-[rgba(44,40,37,0.03)] px-3.5 py-3">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]">
            Por qué importa
          </p>
          <p className="text-[13px] leading-snug text-[var(--copilot-ink-muted)]">
            {brief.whyItMatters}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--copilot-border)] bg-[rgba(44,40,37,0.03)] px-3.5 py-3">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]">
            Qué hacer ahora
          </p>
          <button
            type="button"
            onClick={handleCta}
            className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-[var(--copilot-accent)] px-3 py-1.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80"
          >
            <CtaIcon className="h-3.5 w-3.5" aria-hidden />
            {brief.recommendedAction.label}
          </button>
        </div>
      </div>

      {/* Insight pills */}
      {brief.insights.filter((ins) => !HIDDEN_AGENT_INSIGHT_IDS.has(ins.id)).length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {brief.insights
            .filter((ins) => !HIDDEN_AGENT_INSIGHT_IDS.has(ins.id))
            .map((ins) => (
              <InsightPill key={ins.id} insight={ins} />
            ))}
        </div>
      ) : null}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function ClientAgentBlock({
  data,
  onNavigateTab,
  onScrollToAssistant,
}: {
  data: Client360Payload;
  onNavigateTab: (tab: string) => void;
  onScrollToAssistant: () => void;
}) {
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
        ? {
            kind: lastMovement.kind,
            date: lastMovement.fecha,
          }
        : null,
      lastCollectionAction: lastAction,
    });
  }, [data, latestAction]);

  return (
    <div className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/60 p-5 shadow-sm">
      <AgentResults
        brief={brief}
        onNavigateTab={onNavigateTab}
        onScrollToAssistant={onScrollToAssistant}
      />
    </div>
  );
}
