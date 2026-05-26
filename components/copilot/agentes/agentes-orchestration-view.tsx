"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  Brain,
  CheckCircle2,
  CircleDot,
  Clock,
  DollarSign,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { copilotApiFetch } from "@/lib/copilot-fetch";
import type { ExecutiveBriefingApiResponse } from "@/lib/copilot-executive-briefing-types";
import type { NotificationListResponse } from "@/lib/copilot-notifications/notification-types";
import { buildDailyExecutiveBrief } from "@/lib/copilot-agents/build-daily-executive-brief";
import { buildCollectionAgentBrief } from "@/lib/copilot-agents/build-collection-agent-brief";
import { buildTreasuryAgentBrief } from "@/lib/copilot-agents/build-treasury-agent-brief";
import { buildDataIntegrityAgentBrief } from "@/lib/copilot-agents/build-data-integrity-agent-brief";
import { buildCfoAgentBrief } from "@/lib/copilot-agents/build-cfo-agent-brief";
import { orchestrateAgents } from "@/lib/copilot-agents/orchestrate-agents";
import type { OicHealthDashboardData } from "@/lib/operacional/types";
import type { FinancialSnapshotApiV1 } from "@/lib/copilot-financial-engine";
import type { CollectionAction } from "@/lib/copilot-collection-types";
import { groupCollectionActionsByCompany } from "@/lib/copilot-actions/enrich-actions";
import { COMING_SOON_AGENTS } from "@/lib/copilot-agents/agent-registry";
import type {
  CopilotAgentBrief,
  CopilotAgentsOrchestration,
} from "@/lib/copilot-agents/types";
import { AgentPriorityCard } from "./agent-priority-card";

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  stable: {
    icon: CheckCircle2,
    iconCls: "text-emerald-600",
    label: "Estable",
    badgeCls: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    bannerCls: "bg-emerald-50 border-emerald-200",
  },
  attention: {
    icon: CircleDot,
    iconCls: "text-amber-600",
    label: "En atención",
    badgeCls: "bg-amber-50 text-amber-700 border border-amber-200",
    bannerCls: "bg-amber-50 border-amber-200",
  },
  critical: {
    icon: TriangleAlert,
    iconCls: "text-rose-600",
    label: "Crítico",
    badgeCls: "bg-rose-50 text-rose-700 border border-rose-200",
    bannerCls: "bg-rose-50 border-rose-200",
  },
} as const;

const AGENT_ICON: Record<string, LucideIcon> = {
  daily_executive: Bot,
  collection: BarChart3,
  treasury: Wallet,
  data_integrity: ShieldCheck,
  cfo: DollarSign,
  client: Users,
  alerts: AlertTriangle,
  risk: Brain,
};

const COMING_SOON_DESCRIPTION: Record<string, string> = {
  client: "Resume un cliente específico.",
  alerts: "Prioriza alertas relevantes.",
  risk: "Detecta riesgos antes de que escalen.",
};

// ─── Agent brief card ─────────────────────────────────────────────────────────

function AgentBriefCard({ brief }: { brief: CopilotAgentBrief }) {
  const cfg = STATUS_CONFIG[brief.status];
  const StatusIcon = cfg.icon;
  const AgentIcon = AGENT_ICON[brief.agentId] ?? Brain;

  return (
    <div className="flex flex-col rounded-2xl border border-[var(--copilot-border)] bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-start gap-3 p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--copilot-accent)]/10">
          <AgentIcon className="h-5 w-5 text-[var(--copilot-accent)]" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[14px] font-semibold text-[var(--copilot-ink)]">
              {brief.title}
            </p>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold leading-none text-emerald-700">
              Activo
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-4 border-t border-[var(--copilot-border)]/60 px-5 py-4">
        {/* Status */}
        <div className={`flex items-start gap-2.5 rounded-xl border p-3 ${cfg.bannerCls}`}>
          <StatusIcon className={`mt-0.5 h-4 w-4 shrink-0 ${cfg.iconCls}`} aria-hidden />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-semibold text-[var(--copilot-ink)]">
                Estado
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold leading-none ${cfg.badgeCls}`}>
                {cfg.label}
              </span>
            </div>
            <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--copilot-ink-muted)]">
              {brief.summary}
            </p>
          </div>
        </div>

        {/* Priorities */}
        {brief.priorities.length > 0 ? (
          <div className="space-y-2">
            {brief.priorities.slice(0, 3).map((p, i) => (
              <AgentPriorityCard key={p.id} priority={p} index={i} />
            ))}
          </div>
        ) : (
          <p className="py-2 text-center text-[12px] text-[var(--copilot-ink-muted)]">
            Sin prioridades urgentes.
          </p>
        )}

        {/* CTA */}
        {brief.nextBestAction && (
          <Link
            href={brief.nextBestAction.href}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--copilot-accent)] px-4 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            {brief.nextBestAction.label}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        )}
      </div>
    </div>
  );
}

// ─── Coming soon card ─────────────────────────────────────────────────────────

function ComingSoonCard({
  id,
  label,
  description,
}: {
  id: string;
  label: string;
  description: string;
}) {
  const Icon = AGENT_ICON[id] ?? Brain;
  return (
    <div className="flex flex-col rounded-2xl border border-[var(--copilot-border)]/60 bg-white opacity-70">
      <div className="flex items-start gap-3 p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100">
          <Icon className="h-5 w-5 text-slate-400" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[14px] font-semibold text-[var(--copilot-ink)]">
              {label}
            </p>
            <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold leading-none text-slate-500">
              Próximamente
            </span>
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--copilot-ink-muted)]">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Orchestration results ────────────────────────────────────────────────────

function OrchestrationResults({
  orchestration,
  onRegenerate,
}: {
  orchestration: CopilotAgentsOrchestration;
  onRegenerate: () => void;
}) {
  const cfg = STATUS_CONFIG[orchestration.status];
  const StatusIcon = cfg.icon;

  return (
    <div className="space-y-8">
      {/* Resumen coordinado */}
      <section>
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]/70">
          Resumen coordinado
        </p>
        <div className={`flex items-start gap-3 rounded-xl border p-4 ${cfg.bannerCls}`}>
          <StatusIcon className={`mt-0.5 h-5 w-5 shrink-0 ${cfg.iconCls}`} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[13px] font-semibold text-[var(--copilot-ink)]">
                Estado general del negocio
              </p>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold leading-none ${cfg.badgeCls}`}>
                {cfg.label}
              </span>
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--copilot-ink-muted)]">
              {orchestration.summary}
            </p>
          </div>
        </div>
      </section>

      {/* Prioridades principales */}
      {orchestration.topPriorities.length > 0 && (
        <section>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]/70">
            Prioridades principales
          </p>
          <div className="space-y-2.5">
            {orchestration.topPriorities.map((p, i) => (
              <AgentPriorityCard key={p.id} priority={p} index={i} />
            ))}
          </div>
        </section>
      )}

      {/* Próximo paso */}
      <section className="rounded-xl border border-[var(--copilot-border)] bg-[rgba(31,107,74,0.03)] p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]/70">
          Próximo paso recomendado
        </p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[13px] font-semibold text-[var(--copilot-ink)]">
            {orchestration.nextBestAction.label}
          </p>
          <Link
            href={orchestration.nextBestAction.href}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[var(--copilot-accent)] px-4 py-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            Ir ahora
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </section>

      {/* Agentes activos — resultados individuales */}
      <section>
        <p className="mb-4 text-[11px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]/70">
          Agentes activos
        </p>
        <div className="space-y-4">
          {orchestration.agentBriefs.map((brief) => (
            <AgentBriefCard key={brief.agentId} brief={brief} />
          ))}
        </div>
      </section>

      {/* Regenerar */}
      <div className="flex items-center justify-end gap-1.5 border-t border-[var(--copilot-border)]/60 pt-3">
        <Clock className="h-3 w-3 text-[var(--copilot-ink-muted)]/50" aria-hidden />
        <button
          type="button"
          onClick={onRegenerate}
          className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--copilot-accent)] transition-opacity hover:opacity-75"
        >
          <RefreshCw className="h-3 w-3" aria-hidden />
          Actualizar análisis
        </button>
      </div>
    </div>
  );
}

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchAndOrchestrate(): Promise<CopilotAgentsOrchestration> {
  const [briefingRes, notifRes] = await Promise.all([
    copilotApiFetch("/api/copilot/executive-briefing"),
    copilotApiFetch("/api/copilot/notifications?limit=50"),
  ]);

  const briefingData: ExecutiveBriefingApiResponse = await briefingRes.json();
  const notifData: NotificationListResponse = await notifRes.json();

  const briefing = briefingData.ok ? briefingData.briefing : null;
  const notifications = notifData.ok ? notifData.notifications : [];

  // Collection + operational health + financial snapshot in parallel — all non-fatal
  const [collectionOutcome, healthOutcome, snapshotOutcome] = await Promise.allSettled([
    copilotApiFetch("/api/copilot/collection-actions").then((r) =>
      r.ok ? (r.json() as Promise<{ ok?: boolean; actions?: CollectionAction[] }>) : null
    ),
    copilotApiFetch("/api/operacional/health").then((r) =>
      r.ok ? (r.json() as Promise<{ ok?: boolean; data?: OicHealthDashboardData }>) : null
    ),
    copilotApiFetch("/api/copilot/financial-snapshot").then((r) =>
      r.ok ? (r.json() as Promise<{ ok?: boolean; data?: FinancialSnapshotApiV1 }>) : null
    ),
  ]);

  let collectionByCompanyId: Map<string, CollectionAction[]> | undefined;
  if (collectionOutcome.status === "fulfilled" && collectionOutcome.value?.actions?.length) {
    collectionByCompanyId = groupCollectionActionsByCompany(
      collectionOutcome.value.actions as CollectionAction[]
    );
  }

  let operationalHealth: OicHealthDashboardData | null = null;
  if (healthOutcome.status === "fulfilled" && healthOutcome.value?.ok && healthOutcome.value?.data) {
    operationalHealth = healthOutcome.value.data as OicHealthDashboardData;
  }

  let financialSnapshot: FinancialSnapshotApiV1 | null = null;
  if (snapshotOutcome.status === "fulfilled" && snapshotOutcome.value?.ok && snapshotOutcome.value?.data) {
    financialSnapshot = snapshotOutcome.value.data as FinancialSnapshotApiV1;
  }

  const executiveBrief = buildDailyExecutiveBrief(briefing, notifications);
  const collectionBrief = buildCollectionAgentBrief(notifications, collectionByCompanyId);
  const treasuryBrief = buildTreasuryAgentBrief(notifications);
  const dataIntegrityBrief = buildDataIntegrityAgentBrief({ notifications, operationalHealth });
  const cfoBrief = buildCfoAgentBrief({ notifications, financialSnapshot });

  return orchestrateAgents({ executiveBrief, collectionBrief, treasuryBrief, dataIntegrityBrief, cfoBrief });
}

// ─── Phase types ──────────────────────────────────────────────────────────────

type Phase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; orchestration: CopilotAgentsOrchestration }
  | { kind: "error"; message: string };

// ─── Main component ───────────────────────────────────────────────────────────

export function AgentesOrchestrationView() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const generate = () => {
    setPhase({ kind: "loading" });
    fetchAndOrchestrate()
      .then((orchestration) => setPhase({ kind: "done", orchestration }))
      .catch((err) =>
        setPhase({
          kind: "error",
          message:
            err instanceof Error ? err.message : "Error al generar análisis.",
        })
      );
  };

  return (
    <div className="space-y-10">
      {/* Nota de seguridad */}
      <div className="flex items-start gap-2.5 rounded-xl border border-[var(--copilot-border)]/60 bg-[rgba(44,40,37,0.02)] px-4 py-3">
        <ShieldCheck
          className="mt-0.5 h-4 w-4 shrink-0 text-[var(--copilot-ink-muted)]/60"
          aria-hidden
        />
        <p className="text-[12px] text-[var(--copilot-ink-muted)]">
          Los agentes no modifican datos ni ejecutan acciones solos. Solo
          ordenan información y sugieren próximos pasos.
        </p>
      </div>

      {/* Idle */}
      {phase.kind === "idle" && (
        <div className="rounded-2xl border border-[var(--copilot-border)] bg-white p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--copilot-accent)]/10">
            <Bot className="h-7 w-7 text-[var(--copilot-accent)]" aria-hidden />
          </div>
          <h2 className="text-[16px] font-semibold text-[var(--copilot-ink)]">
            Análisis coordinado
          </h2>
          <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-[var(--copilot-ink-muted)]">
            Los agentes analizan tu negocio en conjunto y ordenan lo más
            importante para esta sesión.
          </p>
          <button
            type="button"
            onClick={generate}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--copilot-accent)] px-6 py-3 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80"
          >
            <Bot className="h-4 w-4" aria-hidden />
            Generar análisis coordinado
          </button>
        </div>
      )}

      {/* Loading */}
      {phase.kind === "loading" && (
        <div className="flex flex-col items-center gap-4 py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--copilot-accent)]" />
          <div className="text-center">
            <p className="text-[13px] font-medium text-[var(--copilot-ink)]">
              Analizando tu negocio...
            </p>
            <p className="mt-0.5 text-[12px] text-[var(--copilot-ink-muted)]">
              Ejecutivo Diario, Cobranza, Tesorería, CFO e Integridad de datos trabajando en conjunto.
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {phase.kind === "error" && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
          <p className="text-[13px] text-rose-700">{phase.message}</p>
          <button
            type="button"
            onClick={generate}
            className="mt-3 text-[12px] font-medium text-rose-600 underline underline-offset-2"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Done */}
      {phase.kind === "done" && (
        <OrchestrationResults
          orchestration={phase.orchestration}
          onRegenerate={generate}
        />
      )}

      {/* Próximos agentes — siempre visibles */}
      <section>
        <p className="mb-4 text-[11px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]/70">
          Próximos agentes
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {COMING_SOON_AGENTS.map((agent) => (
            <ComingSoonCard
              key={agent.id}
              id={agent.id}
              label={agent.label}
              description={
                COMING_SOON_DESCRIPTION[agent.id] ?? agent.description
              }
            />
          ))}
        </div>
      </section>
    </div>
  );
}
