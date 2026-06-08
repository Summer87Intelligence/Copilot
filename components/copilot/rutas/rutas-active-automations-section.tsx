"use client";

import { useMemo, useState } from "react";

import { CopilotBadge, CopilotCard, CopilotGhostButton } from "@/components/copilot/copilot-ui";
import { useRutasOperationalFeedSnapshot } from "@/components/copilot/rutas/rutas-operational-feed-context";
import type { OperationalAutomationGovernanceResponse } from "@/lib/copilot-operational-governance-types";

function riskTone(risk: string): "neutral" | "warning" | "danger" {
  if (risk === "restricted") return "danger";
  if (risk === "supervised") return "warning";
  return "neutral";
}

function riskLabel(risk: string): string {
  if (risk === "restricted") return "Restringida";
  if (risk === "supervised") return "Supervisada";
  return "Segura";
}

function actionModeLabel(mode: string): string {
  if (mode === "auto_event") return "Evento automático";
  if (mode === "auto_flag") return "Marcado automático";
  if (mode === "requires_confirmation") return "Requiere confirmación";
  return "Solo sugerencia";
}

export function RutasActiveAutomationsSection() {
  const { operationalAutomation, governance, loading } = useRutasOperationalFeedSnapshot();
  const [expanded, setExpanded] = useState(false);

  const activeRuleCount = useMemo(() => {
    if (!governance) return 0;
    return governance.rules.filter((rule) => rule.runtime.enabled && rule.riskLevel !== "restricted").length;
  }, [governance]);

  const recommendationCount =
    operationalAutomation?.recommendations.length ?? governance?.activeAutomations.length ?? 0;

  const supervisedCount = useMemo(() => {
    const items = governance?.activeAutomations ?? [];
    return items.filter((item) => item.rule.riskLevel === "supervised").length;
  }, [governance]);

  if (loading && !governance) return null;

  return (
    <CopilotCard className="border border-[var(--copilot-border)]/60 bg-[var(--copilot-card-bg)]/60 px-2.5 py-2 shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <HeaderCopy
          activeRuleCount={activeRuleCount}
          recommendationCount={recommendationCount}
          supervisedCount={supervisedCount}
        />
        <CopilotGhostButton type="button" className="px-2 py-1 text-[10px]" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Ocultar reglas" : "Ver reglas"}
        </CopilotGhostButton>
      </div>
      {expanded && governance ? (
        <GovernanceDetails governance={governance} operationalRecommendationCount={recommendationCount} />
      ) : null}
    </CopilotCard>
  );
}

function HeaderCopy({
  activeRuleCount,
  recommendationCount,
  supervisedCount,
}: {
  activeRuleCount: number;
  recommendationCount: number;
  supervisedCount: number;
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="text-[11px] font-semibold text-[var(--copilot-ink)]">Automatizaciones funcionando</p>
      <p className="text-[10px] text-[var(--copilot-ink-muted)]">
        {activeRuleCount} reglas activas · {recommendationCount} recomendaciones
        {supervisedCount > 0 ? ` · ${supervisedCount} supervisadas` : " · estado seguro"}
      </p>
    </div>
  );
}

function GovernanceDetails({
  governance,
  operationalRecommendationCount,
}: {
  governance: OperationalAutomationGovernanceResponse;
  operationalRecommendationCount: number;
}) {
  return (
    <div className="mt-2 space-y-2 border-t border-[var(--copilot-border)]/50 pt-2">
      <p className="text-[10px] text-[var(--copilot-ink-muted)]">
        Generado {new Date(governance.generatedAt).toLocaleString("es-AR")} ·{" "}
        {operationalRecommendationCount} recomendaciones en runtime
      </p>
      <ul className="space-y-2">
        {governance.rules.map((rule) => (
          <li key={rule.id} className="rounded-md border border-[var(--copilot-border)]/40 px-2 py-1.5">
            <RuleCopy rule={rule} />
            <CopilotBadge tone={rule.runtime.enabled ? riskTone(rule.riskLevel) : "neutral"}>
              {rule.runtime.enabled ? riskLabel(rule.riskLevel) : "Deshabilitada"}
            </CopilotBadge>
          </li>
        ))}
      </ul>
      {governance.activeAutomations.length > 0 ? (
        <ul className="space-y-2">
          {governance.activeAutomations.slice(0, 6).map((item) => (
            <li key={item.automation.id} className="rounded-md bg-[var(--copilot-surface-muted)]/40 px-2 py-1.5">
              <p className="text-[10px] font-medium text-[var(--copilot-ink)]">{item.automation.title}</p>
              <p className="mt-0.5 text-[10px] text-[var(--copilot-ink-muted)]">
                Por qué: {item.explanation.summary}
              </p>
              <p className="mt-0.5 text-[10px] text-[var(--copilot-ink-muted)]">
                Regla: {item.rule.name} · {riskLabel(item.rule.riskLevel)} ·{" "}
                {actionModeLabel(item.rule.actionMode)}
              </p>
              {item.explanation.evidence.length > 0 ? (
                <p className="mt-0.5 text-[10px] text-[var(--copilot-ink-muted)]">
                  Evidencia: {item.explanation.evidence.join(" · ")}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function RuleCopy({
  rule,
}: {
  rule: OperationalAutomationGovernanceResponse["rules"][number];
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium text-[var(--copilot-ink)]">{rule.name}</p>
      <p className="text-[10px] text-[var(--copilot-ink-muted)]">{rule.description}</p>
    </div>
  );
}
