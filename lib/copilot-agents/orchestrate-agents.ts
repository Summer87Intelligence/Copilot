/**
 * Orquestador de Agentes IA.
 * Combina briefs de agentes activos, deduplica, ordena por severidad
 * y genera el resumen coordinado. Sin LLM, sin Supabase, sin Zeta.
 */

import type { DailyExecutiveBrief } from "./build-daily-executive-brief";
import type {
  CopilotAgentBrief,
  CopilotAgentPriority,
  CopilotAgentsOrchestration,
} from "./types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SEV_ORDER: Record<"critical" | "high" | "medium" | "low", number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ─── Input ───────────────────────────────────────────────────────────────────

export type OrchestrateAgentsInput = {
  executiveBrief: DailyExecutiveBrief | null;
  collectionBrief: CopilotAgentBrief;
};

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export function orchestrateAgents(
  input: OrchestrateAgentsInput
): CopilotAgentsOrchestration {
  const allPriorities: CopilotAgentPriority[] = [];

  // Agente Ejecutivo Diario → adaptar AgentPriority a CopilotAgentPriority
  if (input.executiveBrief) {
    for (const p of input.executiveBrief.priorities) {
      allPriorities.push({ ...p, agentId: "daily_executive" });
    }
  }

  // Agente de Cobranza
  allPriorities.push(...input.collectionBrief.priorities);

  // Deduplicar: misma href + severidad → conservar primera aparición
  const seenKeys = new Set<string>();
  const deduped = allPriorities.filter((p) => {
    const key = `${p.href}|${p.severity}`;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  // Ordenar: critical > high > medium > low
  const sorted = [...deduped].sort(
    (a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]
  );

  const topPriorities = sorted.slice(0, 5);

  const hasCritical = topPriorities.some((p) => p.severity === "critical");
  const hasHigh = topPriorities.some((p) => p.severity === "high");
  const status: CopilotAgentsOrchestration["status"] =
    hasCritical ? "critical" : hasHigh ? "attention" : "stable";

  // Construir briefs por agente
  const agentBriefs: CopilotAgentBrief[] = [];

  if (input.executiveBrief) {
    agentBriefs.push({
      agentId: "daily_executive",
      title: "Ejecutivo Diario",
      status: input.executiveBrief.status,
      summary: input.executiveBrief.summary,
      priorities: input.executiveBrief.priorities.map((p) => ({
        ...p,
        agentId: "daily_executive" as const,
      })),
      nextBestAction: input.executiveBrief.nextBestAction,
    });
  }

  agentBriefs.push(input.collectionBrief);

  const nextBestAction =
    topPriorities[0]
      ? { label: topPriorities[0].ctaLabel, href: topPriorities[0].href }
      : { label: "Empezar por Acciones", href: "/copilot/acciones" };

  return {
    status,
    summary: buildOrchestrationSummary(status, topPriorities),
    topPriorities,
    agentBriefs,
    nextBestAction,
  };
}

// ─── Summary builder ──────────────────────────────────────────────────────────

function buildOrchestrationSummary(
  status: CopilotAgentsOrchestration["status"],
  priorities: CopilotAgentPriority[]
): string {
  if (status === "critical") {
    return "Tu negocio tiene situaciones críticas que requieren atención hoy.";
  }
  if (status === "attention") {
    const hasCollection = priorities.some(
      (p) => p.agentId === "collection" && p.severity !== "low"
    );
    const hasTreasury = priorities.some(
      (p) => p.href.includes("tesoreria") || p.href.includes("pagos")
    );
    const hasPromiseOverdue = priorities.some((p) =>
      p.id?.startsWith("followup-promise-overdue")
    );
    const hasFollowupOverdue = priorities.some((p) =>
      p.id?.startsWith("followup-overdue")
    );
    if (hasCollection && hasTreasury) {
      return "Hay clientes vencidos y compromisos de pago para revisar hoy.";
    }
    if (hasPromiseOverdue) {
      return "Hay promesas de pago vencidas y clientes pendientes de gestionar.";
    }
    if (hasFollowupOverdue) {
      return "Hay seguimientos de cobranza vencidos y clientes para contactar.";
    }
    if (hasCollection) {
      return "Hay clientes con saldo vencido para gestionar.";
    }
    if (hasTreasury) {
      return "Hay compromisos de pago próximos o vencidos para revisar.";
    }
    return "Tu negocio tiene señales para revisar esta sesión.";
  }
  return "Todo en orden. No hay prioridades urgentes por el momento.";
}
