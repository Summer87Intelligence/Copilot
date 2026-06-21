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
  XCircle,
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
import { buildRiskAgentBrief } from "@/lib/copilot-agents/build-risk-agent-brief";
import { orchestrateAgents } from "@/lib/copilot-agents/orchestrate-agents";
import { COMING_SOON_AGENTS } from "@/lib/copilot-agents/agent-registry";
import type {
  CopilotAgentBrief,
  CopilotAgentId,
  CopilotAgentsOrchestration,
} from "@/lib/copilot-agents/types";
import type { FinancialSnapshotApiV1 } from "@/lib/copilot-financial-engine";
import type { CollectionAction } from "@/lib/copilot-collection-types";
import { groupCollectionActionsByCompany } from "@/lib/copilot-actions/enrich-actions";
import type { OicHealthDashboardData } from "@/lib/operacional/types";
import { normalizeAgentHref } from "@/lib/copilot-agents/normalize-agent-href";
import {
  actionCardClass,
  dangerFinancialCardClass,
  neutralFinancialCardClass,
  positiveFinancialCardClass,
  softCalloutClass,
  statusBadgeVariants,
  warningFinancialCardClass,
} from "@/components/copilot/ui/copilot-visual-system";
import { AgentCard } from "./agent-card";
import { AgentPriorityCard } from "./agent-priority-card";

const STATUS_CONFIG = {
  stable: {
    icon: CheckCircle2,
    iconCls: "text-[var(--copilot-success-text)]",
    label: "Bajo",
    badgeCls: `${statusBadgeVariants.stable} border`,
    surfaceCls: positiveFinancialCardClass,
  },
  attention: {
    icon: CircleDot,
    iconCls: "text-[var(--copilot-warning-text)]",
    label: "Atención",
    badgeCls: `${statusBadgeVariants.attention} border`,
    surfaceCls: warningFinancialCardClass,
  },
  critical: {
    icon: TriangleAlert,
    iconCls: "text-[var(--copilot-danger-text)]",
    label: "Crítico",
    badgeCls: `${statusBadgeVariants.critical} border`,
    surfaceCls: dangerFinancialCardClass,
  },
} as const;

const AGENT_ICON: Record<CopilotAgentId, LucideIcon> = {
  daily_executive: Bot,
  collection: BarChart3,
  treasury: Wallet,
  data_integrity: ShieldCheck,
  cfo: DollarSign,
  client: Users,
  alerts: AlertTriangle,
  risk: Brain,
};

const AGENT_DESCRIPTION: Record<
  "daily_executive" | "collection" | "treasury" | "data_integrity" | "cfo" | "risk",
  string
> = {
  daily_executive: "Lee el Copilot completo y ordena lo más importante del día.",
  collection: "Revisa deuda atrasada, promesas y seguimientos para cobrar a tiempo.",
  treasury: "Revisa pagos, compromisos y señales de caja para evitar sorpresas.",
  data_integrity: "Te dice si los datos están listos para decidir o conviene revisarlos.",
  cfo: "Resume liquidez, cartera atrasada y señales financieras relevantes.",
  risk: "Junta caja, cobranza, datos y finanzas para mostrar el riesgo operativo.",
};

const OPERATIONAL_AGENT_ORDER: CopilotAgentId[] = [
  "daily_executive",
  "collection",
  "treasury",
  "data_integrity",
  "cfo",
];

const COMING_SOON_DESCRIPTION: Record<string, string> = {
  alerts: "Agrupará avisos importantes para que no tengas que revisar todo por separado.",
};

type HealthResponse = { ok?: boolean; data?: OicHealthDashboardData };
type CollectionActionsResponse = { ok?: boolean; actions?: CollectionAction[] };
type FinancialSnapshotResponse = { ok?: boolean; data?: FinancialSnapshotApiV1 };
type OrchestrationLoadResult = {
  orchestration: CopilotAgentsOrchestration;
  warnings: string[];
};

type Phase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; data: OrchestrationLoadResult }
  | { kind: "error"; message: string };

async function fetchJson<T>(url: string): Promise<T | null> {
  const response = await copilotApiFetch(url);
  if (!response.ok) return null;
  return (await response.json()) as T;
}

function getValue<T>(result: PromiseSettledResult<T | null>): T | null {
  if (result.status !== "fulfilled") return null;
  return result.value ?? null;
}

function buildWarning(label: string): string {
  return `No se pudo cargar ${label}. Se muestra la mejor lectura disponible.`;
}

function sortOperationalBriefs(briefs: CopilotAgentBrief[]): CopilotAgentBrief[] {
  return [...briefs].sort(
    (a, b) =>
      OPERATIONAL_AGENT_ORDER.indexOf(a.agentId) -
      OPERATIONAL_AGENT_ORDER.indexOf(b.agentId)
  );
}

async function fetchAndOrchestrate(): Promise<OrchestrationLoadResult> {
  const [
    briefingOutcome,
    notificationsOutcome,
    collectionOutcome,
    healthOutcome,
    snapshotOutcome,
  ] = await Promise.allSettled([
    fetchJson<ExecutiveBriefingApiResponse>("/api/copilot/executive-briefing"),
    fetchJson<NotificationListResponse>("/api/copilot/notifications?limit=50"),
    fetchJson<CollectionActionsResponse>("/api/copilot/collection-actions"),
    fetchJson<HealthResponse>("/api/operacional/health"),
    fetchJson<FinancialSnapshotResponse>("/api/copilot/financial-snapshot"),
  ]);

  const warnings: string[] = [];

  const briefingData = getValue(briefingOutcome);
  if (!briefingData?.ok) {
    warnings.push(buildWarning("el resumen coordinado"));
  }

  const notificationsData = getValue(notificationsOutcome);
  if (!notificationsData?.ok) {
    warnings.push(buildWarning("las notificaciones base"));
  }

  const collectionData = getValue(collectionOutcome);
  if (!collectionData?.ok) {
    warnings.push(buildWarning("los seguimientos de cobranza"));
  }

  const healthData = getValue(healthOutcome);
  if (!healthData?.ok) {
    warnings.push(buildWarning("el estado operacional"));
  }

  const snapshotData = getValue(snapshotOutcome);
  if (!snapshotData?.ok) {
    warnings.push(buildWarning("la lectura financiera"));
  }

  const briefing = briefingData?.ok ? briefingData.briefing : null;
  const notifications =
    notificationsData?.ok ? notificationsData.notifications : [];

  const collectionByCompanyId =
    collectionData?.ok && collectionData.actions?.length
      ? groupCollectionActionsByCompany(collectionData.actions)
      : undefined;

  const operationalHealth =
    healthData?.ok && healthData.data ? healthData.data : null;
  const financialSnapshot =
    snapshotData?.ok && snapshotData.data ? snapshotData.data : null;

  const executiveBrief = buildDailyExecutiveBrief(briefing, notifications);
  const collectionBrief = buildCollectionAgentBrief(
    notifications,
    collectionByCompanyId
  );
  const treasuryBrief = buildTreasuryAgentBrief(notifications);
  const dataIntegrityBrief = buildDataIntegrityAgentBrief({
    notifications,
    operationalHealth,
  });
  const cfoBrief = buildCfoAgentBrief({ notifications, financialSnapshot });
  const riskBrief = buildRiskAgentBrief({
    cfoBrief,
    treasuryBrief,
    collectionBrief,
    dataIntegrityBrief,
    notifications,
  });

  return {
    orchestration: orchestrateAgents({
      executiveBrief,
      collectionBrief,
      treasuryBrief,
      dataIntegrityBrief,
      cfoBrief,
      riskBrief,
    }),
    warnings,
  };
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]/70">
      {children}
    </p>
  );
}

function PartialWarning({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;

  return (
    <div className={`rounded-2xl border px-4 py-3 ${warningFinancialCardClass}`}>
      <div className="flex items-start gap-2.5">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-[var(--copilot-warning-text)]"
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[var(--copilot-warning-text-strong)]">
            Se cargó una versión parcial del análisis.
          </p>
          <ul className="mt-1 space-y-1 text-[12px] leading-relaxed text-[var(--copilot-warning-text-strong)]">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function BriefStatusSummary({ brief }: { brief: CopilotAgentBrief }) {
  const cfg = STATUS_CONFIG[brief.status];
  const StatusIcon = cfg.icon;

  return (
    <div className={`flex items-start gap-2.5 rounded-xl border p-3 ${cfg.surfaceCls}`}>
      <StatusIcon
        className={`mt-0.5 h-4 w-4 shrink-0 ${cfg.iconCls}`}
        aria-hidden
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-semibold text-[var(--copilot-ink)]">
            Estado
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold leading-none ${cfg.badgeCls}`}
          >
            {cfg.label}
          </span>
        </div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--copilot-ink-muted)]">
          {brief.summary}
        </p>
      </div>
    </div>
  );
}

function BriefCardBody({
  brief,
  emptyMessage,
}: {
  brief: CopilotAgentBrief;
  emptyMessage: string;
}) {
  const priorities = brief.priorities.slice(0, 3);

  return (
    <div className="space-y-4">
      <BriefStatusSummary brief={brief} />

      {priorities.length > 0 ? (
        <div className="space-y-2.5">
          {priorities.map((priority, index) => (
            <AgentPriorityCard
              key={priority.id}
              priority={priority}
              index={index}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--copilot-border)]/60 bg-[rgba(44,40,37,0.02)] px-4 py-3">
          <p className="text-[12.5px] text-[var(--copilot-ink-muted)]">
            {emptyMessage}
          </p>
        </div>
      )}
    </div>
  );
}

function SummarySection({
  orchestration,
  onRegenerate,
}: {
  orchestration: CopilotAgentsOrchestration;
  onRegenerate: () => void;
}) {
  const cfg = STATUS_CONFIG[orchestration.status];
  const StatusIcon = cfg.icon;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <SectionEyebrow>Resumen coordinado</SectionEyebrow>
          <p className="mt-1 text-[14px] text-[var(--copilot-ink-muted)]">
            La lectura principal para entender qué revisar primero.
          </p>
        </div>
        <button
          type="button"
          onClick={onRegenerate}
          className="inline-flex items-center gap-1.5 self-start rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-2 text-[12px] font-semibold text-[var(--copilot-ink)] transition-colors hover:bg-[rgba(44,40,37,0.03)]"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Actualizar análisis
        </button>
      </div>

      <div className="rounded-3xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-5 shadow-sm sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.9fr)]">
          <div className="space-y-4">
            <div className={`flex items-start gap-3 rounded-2xl border p-4 ${cfg.surfaceCls}`}>
              <StatusIcon
                className={`mt-0.5 h-5 w-5 shrink-0 ${cfg.iconCls}`}
                aria-hidden
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[14px] font-semibold text-[var(--copilot-ink)]">
                    Estado global
                  </p>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-bold leading-none ${cfg.badgeCls}`}
                  >
                    {cfg.label}
                  </span>
                </div>
                <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-[var(--copilot-ink-muted)]">
                  {orchestration.summary}
                </p>
              </div>
            </div>

            <div>
              <p className="mb-3 text-[12px] font-semibold text-[var(--copilot-ink)]">
                Prioridades globales
              </p>
              {orchestration.topPriorities.length > 0 ? (
                <div className="space-y-2.5">
                  {orchestration.topPriorities.map((priority, index) => (
                    <AgentPriorityCard
                      key={priority.id}
                      priority={priority}
                      index={index}
                    />
                  ))}
                </div>
              ) : (
                <div className={softCalloutClass}>
                  <p className="text-[12.5px] text-[var(--copilot-ink-muted)]">
                    No hay prioridades urgentes en este momento.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className={`${positiveFinancialCardClass} rounded-2xl border p-4 sm:p-5`}>
            <SectionEyebrow>Próximo paso</SectionEyebrow>
            <p className="mt-3 text-[16px] font-semibold text-[var(--copilot-ink)]">
              {orchestration.nextBestAction.label}
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--copilot-ink-muted)]">
              Si empezás por este módulo, resolvés antes la prioridad más
              importante que detectaron los agentes.
            </p>
            <Link
              href={normalizeAgentHref(orchestration.nextBestAction.href)}
              className="mt-5 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--copilot-accent)] px-4 py-3 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              Ir ahora
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <div className="mt-4 flex items-center gap-1.5 text-[11.5px] text-[var(--copilot-ink-muted)]/70">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              Recomendación generada con la información disponible en esta sesión.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function RiskSection({ brief }: { brief: CopilotAgentBrief }) {
  return (
    <section className="space-y-4">
      <div>
        <SectionEyebrow>Agente de Riesgo</SectionEyebrow>
        <p className="mt-1 text-[14px] text-[var(--copilot-ink-muted)]">
          Una lectura global para entender si conviene mirar caja, cobranza,
          datos o finanzas primero.
        </p>
      </div>

      <AgentCard
        icon={AGENT_ICON.risk}
        name="Análisis de riesgo"
        description={AGENT_DESCRIPTION.risk}
        status="active"
        showStatusBadge={false}
        ctaLabel={brief.nextBestAction?.label}
        ctaHref={brief.nextBestAction?.href}
      >
        <BriefCardBody
          brief={brief}
          emptyMessage="Hoy no se ven señales fuertes de riesgo operativo."
        />
      </AgentCard>
    </section>
  );
}

function OperationalAgentsSection({ briefs }: { briefs: CopilotAgentBrief[] }) {
  return (
    <section className="space-y-4">
      <div>
        <SectionEyebrow>Agentes operativos</SectionEyebrow>
        <p className="mt-1 text-[14px] text-[var(--copilot-ink-muted)]">
          Cada agente mira una parte distinta del negocio y muestra un resumen
          corto con hasta 3 prioridades.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {briefs.map((brief) => (
          <AgentCard
            key={brief.agentId}
            icon={AGENT_ICON[brief.agentId]}
            name={brief.title}
            description={
              AGENT_DESCRIPTION[
                brief.agentId as keyof typeof AGENT_DESCRIPTION
              ] ?? "Resume una parte del negocio y recomienda dónde revisar."
            }
            status="active"
            showStatusBadge={false}
            ctaLabel={brief.nextBestAction?.label}
            ctaHref={brief.nextBestAction?.href}
          >
            <BriefCardBody
              brief={brief}
              emptyMessage="No hay prioridades urgentes para revisar ahora."
            />
          </AgentCard>
        ))}
      </div>
    </section>
  );
}

function SupplementalCardsSection() {
  return (
    <section className="space-y-4">
      <div>
        <SectionEyebrow>Más contexto</SectionEyebrow>
        <p className="mt-1 text-[14px] text-[var(--copilot-ink-muted)]">
          El Agente de Cliente vive en la ficha 360 y Alertas queda preparado
          para una próxima versión.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${actionCardClass} p-5`}>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--copilot-accent)]/10">
              <Users className="h-5 w-5 text-[var(--copilot-accent)]" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[14px] font-semibold text-[var(--copilot-ink)]">
                  Agente de Cliente
                </p>
                <span className="rounded-full border border-[var(--copilot-border)] bg-[var(--copilot-tone-neutral-bg)] px-2 py-0.5 text-[10.5px] font-semibold leading-none text-[var(--copilot-accent)]">
                  En fichas de cliente
                </span>
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--copilot-ink-muted)]">
                Disponible dentro de cada ficha de cliente. Resume qué pasa con
                ese cliente, por qué importa y cuál es el siguiente paso recomendado.
              </p>
            </div>
          </div>

          <div className={softCalloutClass}>
            <p className="text-[12.5px] text-[var(--copilot-ink-muted)]">
              No aparece como agente global porque no analiza todo el negocio.
            </p>
          </div>

          <Link
            href="/copilot/clientes"
            className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--copilot-accent)] px-4 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            Ver Clientes
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        {COMING_SOON_AGENTS.map((agent) => {
          const Icon = AGENT_ICON[agent.id];

          return (
            <div
              key={agent.id}
              className={`${neutralFinancialCardClass} rounded-2xl border p-5 opacity-80`}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--copilot-soft-bg)]">
                  <Icon className="h-5 w-5 text-[var(--copilot-ink-muted)]" aria-hidden />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[14px] font-semibold text-[var(--copilot-ink)]">
                      {agent.label}
                    </p>
                    <span className="rounded-full border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] px-2 py-0.5 text-[10.5px] font-semibold leading-none text-[var(--copilot-ink-muted)]">
                      Próximamente
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-[var(--copilot-ink-muted)]">
                    {COMING_SOON_DESCRIPTION[agent.id] ?? agent.description}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SecuritySection() {
  return (
    <section className="space-y-4">
      <div>
        <SectionEyebrow>Seguridad</SectionEyebrow>
        <p className="mt-1 text-[14px] text-[var(--copilot-ink-muted)]">
          Qué pueden y qué no pueden hacer los agentes.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${positiveFinancialCardClass} rounded-2xl border p-5`}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-[var(--copilot-success-text)]" aria-hidden />
            <p className="text-[13px] font-semibold text-[var(--copilot-success-text-strong)]">
              Pueden
            </p>
          </div>
          <ul className="mt-3 space-y-2 text-[13px] text-[var(--copilot-success-text-strong)]/90">
            {[
              "Leer información del Copilot.",
              "Resumir la situación actual.",
              "Priorizar lo más urgente.",
              "Sugerir el siguiente paso.",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--copilot-success-text)]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className={`${dangerFinancialCardClass} rounded-2xl border p-5`}>
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-[var(--copilot-danger-text)]" aria-hidden />
            <p className="text-[13px] font-semibold text-[var(--copilot-danger-text-strong)]">
              No pueden
            </p>
          </div>
          <ul className="mt-3 space-y-2 text-[13px] text-[var(--copilot-danger-text-strong)]/90">
            {[
              "Pagar o borrar información.",
              "Modificar importes.",
              "Enviar mensajes automáticamente.",
              "Marcar facturas como pagadas.",
              "Ejecutar acciones solos.",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--copilot-danger-text)]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function OrchestrationResults({
  data,
  onRegenerate,
}: {
  data: OrchestrationLoadResult;
  onRegenerate: () => void;
}) {
  const riskBrief =
    data.orchestration.agentBriefs.find((brief) => brief.agentId === "risk") ??
    null;
  const operationalBriefs = sortOperationalBriefs(
    data.orchestration.agentBriefs.filter((brief) =>
      OPERATIONAL_AGENT_ORDER.includes(brief.agentId)
    )
  );

  return (
    <div className="space-y-8">
      <PartialWarning warnings={data.warnings} />
      <SummarySection
        orchestration={data.orchestration}
        onRegenerate={onRegenerate}
      />
      {riskBrief ? <RiskSection brief={riskBrief} /> : null}
      <OperationalAgentsSection briefs={operationalBriefs} />
      <SupplementalCardsSection />
      <SecuritySection />
    </div>
  );
}

export function AgentesOrchestrationView() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const generate = () => {
    setPhase({ kind: "loading" });
    fetchAndOrchestrate()
      .then((data) => setPhase({ kind: "done", data }))
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
      {phase.kind === "idle" ? (
        <div className="rounded-3xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-8 shadow-sm">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--copilot-accent)]/10">
              <Bot className="h-7 w-7 text-[var(--copilot-accent)]" aria-hidden />
            </div>
            <h2 className="text-[18px] font-semibold text-[var(--copilot-ink)]">
              Generar lectura coordinada
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-[13.5px] leading-relaxed text-[var(--copilot-ink-muted)]">
              Vas a ver un resumen global, el nivel de riesgo, los agentes
              operativos y las prioridades más importantes de esta sesión.
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
        </div>
      ) : null}

      {phase.kind === "loading" ? (
        <div className="rounded-3xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-6 py-12 shadow-sm">
          <div className="flex flex-col items-center gap-4 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--copilot-accent)]" />
            <div>
              <p className="text-[14px] font-semibold text-[var(--copilot-ink)]">
                Analizando tu negocio...
              </p>
              <p className="mt-1 text-[12.5px] text-[var(--copilot-ink-muted)]">
                Resumen coordinado, riesgo, cobranza, tesorería, datos y finanzas
                trabajando en conjunto.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {phase.kind === "error" ? (
        <div className="rounded-3xl border border-[var(--copilot-danger-border)] bg-[var(--copilot-card-bg)] p-5 text-center">
          <p className="text-[13px] text-[var(--copilot-danger-text-strong)]">{phase.message}</p>
          <button
            type="button"
            onClick={generate}
            className="mt-3 text-[12px] font-medium text-[var(--copilot-danger-text)] underline underline-offset-2"
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {phase.kind === "done" ? (
        <OrchestrationResults data={phase.data} onRegenerate={generate} />
      ) : null}
    </div>
  );
}
