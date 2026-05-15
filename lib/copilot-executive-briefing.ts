import type { OperationalWorkflowExecution } from "@/lib/copilot-operational-workflows-types";
import type { OperationalTimelineItem } from "@/lib/copilot-operational-events-types";
import type {
  ExecutiveBriefing,
  ExecutiveBriefingDoFirst,
  ExecutiveBriefingInput,
  ExecutiveBriefingNeedsApproval,
  ExecutiveBriefingStatus,
} from "@/lib/copilot-executive-briefing-types";

const MAX_DO_FIRST = 3;
const MAX_NEEDS_APPROVAL = 3;
const MAX_RISKS_INCREASING = 3;
const MAX_RESOLVED_RECENTLY = 3;

function isOpenWorkflow(w: OperationalWorkflowExecution): boolean {
  return w.status === "active" || w.status === "blocked";
}

function isCriticalCash(w: OperationalWorkflowExecution): boolean {
  return w.type === "critical_cash";
}

function isSlaBreached(w: OperationalWorkflowExecution): boolean {
  return w.slaStatus === "breached";
}

function isBlocked(w: OperationalWorkflowExecution): boolean {
  return w.status === "blocked";
}

function deriveStatus(input: ExecutiveBriefingInput): ExecutiveBriefingStatus {
  const { workflows, snapshotHealth } = input;

  const hasCriticalBreached = workflows.some(
    (w) => isOpenWorkflow(w) && isCriticalCash(w) && isSlaBreached(w)
  );
  const hasCriticalBlocked = workflows.some(
    (w) => isOpenWorkflow(w) && isCriticalCash(w) && isBlocked(w)
  );

  if (hasCriticalBreached || hasCriticalBlocked || snapshotHealth?.status === "degraded") {
    return "critical";
  }

  const hasWarning = workflows.some(
    (w) => isOpenWorkflow(w) && (w.slaStatus === "warning" || w.isOverdue)
  );
  if (hasWarning || snapshotHealth?.status === "partial" || snapshotHealth?.status === "stale") {
    return "warning";
  }

  return "stable";
}

function deriveHeadline(
  status: ExecutiveBriefingStatus,
  input: ExecutiveBriefingInput
): string {
  const { workflows } = input;

  const hasCriticalBlockedOrBreached = workflows.some(
    (w) => isOpenWorkflow(w) && isCriticalCash(w) && (isSlaBreached(w) || isBlocked(w))
  );
  if (hasCriticalBlockedOrBreached) {
    return "Hay bloqueos operativos que requieren atención.";
  }

  const hasCriticalCashActive = workflows.some(
    (w) => w.status === "active" && isCriticalCash(w)
  );
  if (hasCriticalCashActive) {
    return "La presión de caja sigue siendo la prioridad principal.";
  }

  if (status === "warning") return "Hay señales que requieren seguimiento.";
  return "Operación en estado normal.";
}

function deriveSummary(
  status: ExecutiveBriefingStatus,
  input: ExecutiveBriefingInput
): string {
  const open = input.workflows.filter(isOpenWorkflow);
  const blocked = open.filter(isBlocked);
  const breached = open.filter(isSlaBreached);

  if (status === "critical") {
    const parts: string[] = [];
    if (breached.length > 0) parts.push(`${breached.length} SLA vencido${breached.length > 1 ? "s" : ""}`);
    if (blocked.length > 0) parts.push(`${blocked.length} bloqueado${blocked.length > 1 ? "s" : ""}`);
    return `Existen situaciones críticas activas: ${parts.join(", ")}. Revisión inmediata recomendada.`;
  }

  if (status === "warning") {
    return `Hay ${open.length} workflow${open.length !== 1 ? "s" : ""} activo${open.length !== 1 ? "s" : ""} con señales de alerta. Revisión recomendada en el día.`;
  }

  if (open.length === 0) return "Sin workflows operativos activos. Estado controlado.";
  return `${open.length} workflow${open.length !== 1 ? "s" : ""} activo${open.length !== 1 ? "s" : ""} dentro de parámetros normales.`;
}

const EVENT_TYPE_LABEL: Partial<Record<OperationalTimelineItem["eventType"], string>> = {
  workflow_escalated: "Escalación registrada",
  workflow_blocked: "Workflow bloqueado",
  workflow_unblocked: "Workflow desbloqueado",
  workflow_completed: "Workflow completado",
  workflow_cancelled: "Workflow cancelado",
  workflow_assigned: "Responsable asignado",
  workflow_reopened: "Workflow reabierto",
  workflow_sla_breached: "SLA vencido",
  step_completed: "Paso completado",
  action_resolved: "Acción resuelta",
  workflow_recurring_detected: "Patrón recurrente detectado",
  workflow_followup_recommended: "Seguimiento recomendado",
  workflow_resolution_recommended: "Resolución sugerida",
};

function deriveWhatChanged(input: ExecutiveBriefingInput): string[] {
  const recent = input.operationalEvents
    .slice(0, 10)
    .filter((ev) => EVENT_TYPE_LABEL[ev.eventType]);

  const seen = new Set<string>();
  const result: string[] = [];

  for (const ev of recent) {
    const label = EVENT_TYPE_LABEL[ev.eventType];
    if (!label) continue;
    const key = `${ev.eventType}:${ev.entityId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const suffix = ev.entityLabel ? ` — ${ev.entityLabel}` : "";
    result.push(`${label}${suffix}`);
    if (result.length >= 5) break;
  }

  return result;
}

function deriveWhyItMatters(input: ExecutiveBriefingInput): string[] {
  const reasons: string[] = [];

  const criticalBreached = input.workflows.filter(
    (w) => isOpenWorkflow(w) && isCriticalCash(w) && isSlaBreached(w)
  );
  if (criticalBreached.length > 0) {
    reasons.push(`${criticalBreached.length} workflow${criticalBreached.length > 1 ? "s" : ""} de caja crítica con SLA vencido impactan directamente el flujo de fondos.`);
  }

  const escalationCount = input.operationalAutomation?.escalations.length ?? 0;
  if (escalationCount > 0) {
    reasons.push(`${escalationCount} escalación${escalationCount > 1 ? "es" : ""} automática${escalationCount > 1 ? "s" : ""} sin responsable asignado.`);
  }

  const recurring = input.memorySignals.filter((s) => s.type === "recurring_issue");
  if (recurring.length > 0) {
    reasons.push(`${recurring.length} señal${recurring.length > 1 ? "es" : ""} de memoria indican problemas recurrentes sin resolución definitiva.`);
  }

  const blockedCritical = input.workflows.filter(
    (w) => isOpenWorkflow(w) && isBlocked(w) && isCriticalCash(w)
  );
  if (blockedCritical.length > 0) {
    reasons.push(`${blockedCritical.length} workflow${blockedCritical.length > 1 ? "s" : ""} crítico${blockedCritical.length > 1 ? "s" : ""} bloqueado${blockedCritical.length > 1 ? "s" : ""} sin plan de desbloqueo.`);
  }

  return reasons.slice(0, 4);
}

function deriveDoFirst(input: ExecutiveBriefingInput): ExecutiveBriefingDoFirst[] {
  const items: ExecutiveBriefingDoFirst[] = [];

  // Priority 1: critical_cash blocked or SLA breached
  const criticalUrgent = input.workflows.filter(
    (w) =>
      isOpenWorkflow(w) &&
      isCriticalCash(w) &&
      (isSlaBreached(w) || isBlocked(w))
  );

  for (const w of criticalUrgent) {
    if (items.length >= MAX_DO_FIRST) break;
    const reason = isSlaBreached(w)
      ? "SLA vencido en workflow de caja crítica."
      : "Workflow de caja crítica bloqueado sin responsable.";
    items.push({
      title: w.title,
      reason,
      actionLabel: isBlocked(w) ? "Desbloquear" : "Revisar SLA",
      href: `/copilot/rutas`,
    });
  }

  // Priority 2: any other SLA breached
  if (items.length < MAX_DO_FIRST) {
    const otherBreached = input.workflows.filter(
      (w) => isOpenWorkflow(w) && isSlaBreached(w) && !isCriticalCash(w)
    );
    for (const w of otherBreached) {
      if (items.length >= MAX_DO_FIRST) break;
      items.push({
        title: w.title,
        reason: "SLA vencido.",
        actionLabel: "Revisar",
        href: `/copilot/rutas`,
      });
    }
  }

  // Priority 3: escalations without owner
  if (items.length < MAX_DO_FIRST) {
    const escalations = input.operationalAutomation?.escalations ?? [];
    for (const esc of escalations) {
      if (items.length >= MAX_DO_FIRST) break;
      // Avoid duplicating a workflow already listed
      const alreadyListed = items.some((item) => item.title === esc.title);
      if (alreadyListed) continue;
      items.push({
        title: esc.title,
        reason: esc.detail,
        actionLabel: "Asignar responsable",
        href: `/copilot/rutas`,
      });
    }
  }

  return items;
}

function deriveNeedsApproval(input: ExecutiveBriefingInput): ExecutiveBriefingNeedsApproval[] {
  const items: ExecutiveBriefingNeedsApproval[] = [];

  const supervised = input.governance.activeAutomations.filter(
    (ga) => ga.rule.riskLevel === "supervised" || ga.rule.riskLevel === "restricted"
  );

  for (const ga of supervised) {
    if (items.length >= MAX_NEEDS_APPROVAL) break;
    items.push({
      title: ga.automation.title,
      reason: ga.explanation.summary,
      riskLevel: ga.rule.riskLevel,
    });
  }

  // Fill with recommendations not yet covered
  if (items.length < MAX_NEEDS_APPROVAL) {
    const recs = input.operationalAutomation?.recommendations ?? [];
    for (const rec of recs) {
      if (items.length >= MAX_NEEDS_APPROVAL) break;
      if (rec.riskLevel !== "supervised" && rec.riskLevel !== "restricted") continue;
      const alreadyListed = items.some((item) => item.title === rec.title);
      if (alreadyListed) continue;
      items.push({
        title: rec.title,
        reason: rec.summary,
        riskLevel: rec.riskLevel,
      });
    }
  }

  return items;
}

function deriveResolvedRecently(input: ExecutiveBriefingInput): string[] {
  const resolved: string[] = [];
  const RESOLVED_TYPES = new Set<OperationalTimelineItem["eventType"]>([
    "workflow_completed",
    "workflow_auto_completed",
    "action_resolved",
    "step_completed",
  ]);

  for (const ev of input.operationalEvents) {
    if (!RESOLVED_TYPES.has(ev.eventType)) continue;
    const label = ev.entityLabel
      ? `${ev.entityLabel} resuelto`
      : `Evento resuelto: ${ev.eventType}`;
    if (!resolved.includes(label)) {
      resolved.push(label);
    }
    if (resolved.length >= MAX_RESOLVED_RECENTLY) break;
  }

  return resolved;
}

function deriveRisksIncreasing(input: ExecutiveBriefingInput): string[] {
  const risks: string[] = [];

  const slaWarning = input.workflows.filter(
    (w) => isOpenWorkflow(w) && w.slaStatus === "warning"
  );
  if (slaWarning.length > 0) {
    risks.push(`${slaWarning.length} workflow${slaWarning.length > 1 ? "s" : ""} en alerta de SLA — riesgo de vencimiento próximo.`);
  }

  const recurringAutomations = (input.operationalAutomation?.automations ?? []).filter(
    (a) => a.kind === "recurring_detection"
  );
  if (recurringAutomations.length > 0) {
    risks.push(`${recurringAutomations.length} patrón${recurringAutomations.length > 1 ? "es" : ""} recurrente${recurringAutomations.length > 1 ? "s" : ""} detectado${recurringAutomations.length > 1 ? "s" : ""} sin acción correctiva registrada.`);
  }

  const openTooLong = input.memorySignals.filter((s) => s.type === "open_too_long");
  if (openTooLong.length > 0) {
    risks.push(`${openTooLong.length} acción${openTooLong.length > 1 ? "es" : ""} abierta${openTooLong.length > 1 ? "s" : ""} hace demasiado tiempo según memoria operacional.`);
  }

  const blockedNoOwner = input.workflows.filter(
    (w) => isBlocked(w) && !w.assignedUserId && !w.ownerLabel
  );
  if (blockedNoOwner.length > 0 && risks.length < MAX_RISKS_INCREASING) {
    risks.push(`${blockedNoOwner.length} workflow${blockedNoOwner.length > 1 ? "s" : ""} bloqueado${blockedNoOwner.length > 1 ? "s" : ""} sin responsable asignado.`);
  }

  return risks.slice(0, MAX_RISKS_INCREASING);
}

function deriveConfidence(input: ExecutiveBriefingInput): ExecutiveBriefing["confidence"] {
  const healthStatus = input.snapshotHealth?.status;
  if (healthStatus === "degraded" || healthStatus === "error") return "low";
  if (healthStatus === "partial" || healthStatus === "stale") return "medium";
  return "high";
}

function deriveEvidence(input: ExecutiveBriefingInput): string[] {
  const open = input.workflows.filter(isOpenWorkflow);
  const breached = open.filter(isSlaBreached);
  const blocked = open.filter(isBlocked);
  const escalations = input.operationalAutomation?.escalations.length ?? 0;
  const automations = input.operationalAutomation?.automations.length ?? 0;
  const memorySignals = input.memorySignals.length;

  const evidence: string[] = [];
  evidence.push(`${open.length} workflow${open.length !== 1 ? "s" : ""} abierto${open.length !== 1 ? "s" : ""}`);
  if (breached.length > 0) evidence.push(`${breached.length} SLA vencido${breached.length > 1 ? "s" : ""}`);
  if (blocked.length > 0) evidence.push(`${blocked.length} bloqueado${blocked.length > 1 ? "s" : ""}`);
  if (escalations > 0) evidence.push(`${escalations} escalación${escalations > 1 ? "es" : ""}`);
  if (automations > 0) evidence.push(`${automations} automatización${automations > 1 ? "es" : ""} activa${automations > 1 ? "s" : ""}`);
  if (memorySignals > 0) evidence.push(`${memorySignals} señal${memorySignals > 1 ? "es" : ""} de memoria`);

  return evidence;
}

export function buildExecutiveBriefing(input: ExecutiveBriefingInput): ExecutiveBriefing {
  const status = deriveStatus(input);
  const headline = deriveHeadline(status, input);
  const summary = deriveSummary(status, input);

  return {
    generatedAt: input.now.toISOString(),
    status,
    headline,
    summary,
    whatChanged: deriveWhatChanged(input),
    whyItMatters: deriveWhyItMatters(input),
    doFirst: deriveDoFirst(input),
    needsApproval: deriveNeedsApproval(input),
    resolvedRecently: deriveResolvedRecently(input),
    risksIncreasing: deriveRisksIncreasing(input),
    confidence: deriveConfidence(input),
    evidence: deriveEvidence(input),
  };
}
