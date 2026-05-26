"use client";

import { useMemo } from "react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDot,
  TriangleAlert,
  User,
  Wallet,
  Database,
  MessageCircle,
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
    iconCls: "text-emerald-600",
    label: "Al día",
    badgeCls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    bannerCls: "bg-emerald-50 border-emerald-200",
  },
  attention: {
    icon: CircleDot,
    iconCls: "text-amber-600",
    label: "Atención",
    badgeCls: "bg-amber-50 text-amber-700 border-amber-200",
    bannerCls: "bg-amber-50 border-amber-200",
  },
  critical: {
    icon: TriangleAlert,
    iconCls: "text-rose-600",
    label: "Crítico",
    badgeCls: "bg-rose-50 text-rose-700 border-rose-200",
    bannerCls: "bg-rose-50 border-rose-200",
  },
} as const;

const SEVERITY_DOT: Record<ClientAgentInsight["severity"], string> = {
  critical: "bg-rose-500",
  high: "bg-amber-500",
  medium: "bg-sky-400",
  low: "bg-slate-300",
};

// ─── Tab icon mapping ─────────────────────────────────────────────────────────

const TAB_ICON: Record<string, typeof User> = {
  contactos: User,
  zeta: Database,
  cuenta: Wallet,
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function InsightPill({ insight }: { insight: ClientAgentInsight }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-[var(--copilot-border)]/60 bg-white/70 px-3 py-2">
      <span
        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[insight.severity]}`}
      />
      <div className="min-w-0">
        <p className="text-[11.5px] font-semibold text-[var(--copilot-ink)]">{insight.title}</p>
        <p className="text-[11px] leading-snug text-[var(--copilot-ink-muted)]">{insight.body}</p>
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
    <div className="space-y-4">
      {/* Status banner */}
      <div className={`flex items-start gap-2.5 rounded-xl border p-3 ${cfg.bannerCls}`}>
        <StatusIcon className={`mt-0.5 h-4 w-4 shrink-0 ${cfg.iconCls}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-semibold text-[var(--copilot-ink)]">
              Estado del cliente
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold leading-none ${cfg.badgeCls}`}
            >
              {cfg.label}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--copilot-ink-muted)]">
            {brief.summary}
          </p>
        </div>
      </div>

      {/* Three blocks */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]/70">
            Qué pasa
          </p>
          <p className="text-[12.5px] leading-relaxed text-[var(--copilot-ink)]">
            {brief.mainFinding}
          </p>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]/70">
            Por qué importa
          </p>
          <p className="text-[12.5px] leading-relaxed text-[var(--copilot-ink-muted)]">
            {brief.whyItMatters}
          </p>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]/70">
            Qué hacer ahora
          </p>
          <button
            type="button"
            onClick={handleCta}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--copilot-accent)] px-3.5 py-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80"
          >
            <CtaIcon className="h-3.5 w-3.5" aria-hidden />
            {brief.recommendedAction.label}
          </button>
        </div>
      </div>

      {/* Insights */}
      {brief.insights.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {brief.insights.map((ins) => (
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
    <div className="rounded-2xl border border-[var(--copilot-border)] bg-white/60 p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <Bot className="h-4 w-4 text-[var(--copilot-accent)]" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink)]">
          Agente de cliente
        </span>
        <span className="text-[10px] text-[var(--copilot-ink-muted)]/60">
          · Resumen de este cliente y próximo paso recomendado.
        </span>
      </div>

      <AgentResults
        brief={brief}
        onNavigateTab={onNavigateTab}
        onScrollToAssistant={onScrollToAssistant}
      />
    </div>
  );
}
