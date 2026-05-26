/**
 * Orquestador de Agentes IA.
 * Combina briefs de agentes activos, deduplica por href (prioridad más grave gana),
 * ordena por severidad y genera el resumen coordinado.
 * Sin LLM, sin Supabase, sin Zeta.
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
  treasuryBrief: CopilotAgentBrief;
  dataIntegrityBrief: CopilotAgentBrief;
  cfoBrief: CopilotAgentBrief;
  riskBrief: CopilotAgentBrief;
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

  // Agente de Tesorería
  allPriorities.push(...input.treasuryBrief.priorities);

  // Agente de Integridad de Datos
  allPriorities.push(...input.dataIntegrityBrief.priorities);

  // Agente CFO / Finanzas
  allPriorities.push(...input.cfoBrief.priorities);

  // El Agente de Riesgo aporta lectura global y resumen.
  // No agrega prioridades al top global para no tapar a Tesorería/Cobranza/CFO.

  // Deduplicar por href: mismo destino → conservar la prioridad más grave.
  // Esto evita que el Agente Ejecutivo y el de Tesorería muestren el mismo
  // pago vencido dos veces en el resumen global.
  const byHref = new Map<string, CopilotAgentPriority>();
  for (const p of allPriorities) {
    const existing = byHref.get(p.href);
    if (!existing || (SEV_ORDER[p.severity] ?? 4) < (SEV_ORDER[existing.severity] ?? 4)) {
      byHref.set(p.href, p);
    }
  }

  const sorted = [...byHref.values()].sort(
    (a, b) => (SEV_ORDER[a.severity] ?? 4) - (SEV_ORDER[b.severity] ?? 4)
  );

  const topPriorities = sorted.slice(0, 5);

  const hasCritical = topPriorities.some((p) => p.severity === "critical");
  const hasHigh = topPriorities.some((p) => p.severity === "high");
  const status: CopilotAgentsOrchestration["status"] =
    input.riskBrief.status === "critical" || hasCritical
      ? "critical"
      : input.riskBrief.status === "attention" || hasHigh
      ? "attention"
      : "stable";

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
  agentBriefs.push(input.treasuryBrief);
  agentBriefs.push(input.dataIntegrityBrief);
  agentBriefs.push(input.cfoBrief);
  agentBriefs.push(input.riskBrief);

  const nextBestAction =
    topPriorities[0]
      ? { label: topPriorities[0].ctaLabel, href: topPriorities[0].href }
      : { label: "Empezar por Acciones", href: "/copilot/acciones" };

  return {
    status,
    summary: buildOrchestrationSummary(status, topPriorities, input.riskBrief),
    topPriorities,
    agentBriefs,
    nextBestAction,
  };
}

// ─── Summary builder ──────────────────────────────────────────────────────────

function buildOrchestrationSummary(
  status: CopilotAgentsOrchestration["status"],
  priorities: CopilotAgentPriority[],
  riskBrief?: CopilotAgentBrief | null
): string {
  if (riskBrief?.status === "critical") {
    return "El riesgo operativo requiere revisión inmediata.";
  }
  if (riskBrief?.status === "attention" && status !== "critical") {
    return "Hay riesgos operativos para monitorear.";
  }
  if (status === "critical") {
    const hasTreasuryOverdue = priorities.some((p) => p.id === "treasury-overdue");
    const hasCashRisk = priorities.some((p) => p.id === "treasury-cash-risk");
    const hasDataIntegrity = priorities.some(
      (p) => p.agentId === "data_integrity" && p.severity === "critical"
    );
    const hasCfoLiquidity = priorities.some(
      (p) => (p.id === "cfo-liquidity-critical" || p.id === "cfo-cash-risk") && p.severity === "critical"
    );
    if (hasTreasuryOverdue && hasCashRisk) {
      return "Hay pagos vencidos y riesgo de caja que requieren atención hoy.";
    }
    if (hasTreasuryOverdue) {
      return "Hay pagos vencidos o compromisos de caja críticos para revisar hoy.";
    }
    if (hasCfoLiquidity) {
      return "La liquidez requiere revisión inmediata antes de asumir nuevos compromisos.";
    }
    if (hasDataIntegrity) {
      return "Hay problemas de actualización de datos para revisar.";
    }
    return "Tu negocio tiene situaciones críticas que requieren atención hoy.";
  }
  if (status === "attention") {
    const hasCollection = priorities.some(
      (p) => p.agentId === "collection" && p.severity !== "low"
    );
    const hasTreasury = priorities.some(
      (p) => p.agentId === "treasury" && p.severity !== "low"
    );
    const hasPromiseOverdue = priorities.some((p) =>
      p.id?.startsWith("followup-promise-overdue")
    );
    const hasFollowupOverdue = priorities.some((p) =>
      p.id?.startsWith("followup-overdue")
    );
    const hasDueToday = priorities.some((p) => p.id === "treasury-due-today");

    if (hasCollection && hasTreasury) {
      return "Hay clientes vencidos y compromisos de pago para revisar hoy.";
    }
    if (hasPromiseOverdue) {
      return "Hay promesas de pago vencidas y clientes pendientes de gestionar.";
    }
    if (hasFollowupOverdue) {
      return "Hay seguimientos de cobranza vencidos y clientes para contactar.";
    }
    if (hasDueToday) {
      return "Hay pagos programados para hoy y señales que requieren revisión.";
    }
    const hasDataIntegrityIssue = priorities.some((p) => p.agentId === "data_integrity");
    const hasCfoAttention = priorities.some((p) => p.agentId === "cfo");
    if (hasCollection && hasTreasury) {
      return "Hay clientes vencidos y compromisos de pago para revisar hoy.";
    }
    if (hasCollection && hasCfoAttention) {
      return "Hay cartera vencida y señales financieras para revisar.";
    }
    if (hasCollection) {
      return "Hay clientes con saldo vencido para gestionar.";
    }
    if (hasTreasury) {
      return "Hay compromisos de pago próximos o vencidos para revisar.";
    }
    if (hasCfoAttention) {
      return "Hay indicadores financieros que conviene revisar esta sesión.";
    }
    if (hasDataIntegrityIssue) {
      return "Algunas lecturas pueden depender de la última sincronización disponible.";
    }
    return "Tu negocio tiene señales para revisar esta sesión.";
  }
  return "Todo en orden. No hay prioridades urgentes por el momento.";
}
