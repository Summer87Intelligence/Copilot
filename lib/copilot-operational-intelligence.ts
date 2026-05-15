import type { OperationalWorkflowExecution } from "@/lib/copilot-operational-workflows-types";
import type { OperationalTimelineItem } from "@/lib/copilot-operational-events-types";
import type {
  IntelligenceInsightCategory,
  IntelligenceInsightSeverity,
  OperationalIntelligenceHealth,
  OperationalIntelligenceInput,
  OperationalIntelligenceInsight,
  OperationalIntelligencePattern,
  OperationalIntelligenceResponse,
} from "@/lib/copilot-operational-intelligence-types";

const MAX_INSIGHTS = 5;

const SEVERITY_ORDER: Record<IntelligenceInsightSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function isOpenWorkflow(w: OperationalWorkflowExecution): boolean {
  return w.status === "active" || w.status === "blocked";
}

function baseConfidence(
  input: OperationalIntelligenceInput
): OperationalIntelligenceInsight["confidence"] {
  const status = input.snapshotHealth?.status;
  if (status === "degraded" || status === "error") return "low";
  if (status === "partial" || status === "stale") return "medium";
  return "high";
}

// ── Rule 1: Critical cash + active workflow ──────────────────────────────────

function buildCriticalCashInsights(
  input: OperationalIntelligenceInput
): OperationalIntelligenceInsight[] {
  const conf = baseConfidence(input);
  return input.workflows
    .filter((w) => isOpenWorkflow(w) && w.type === "critical_cash")
    .map((w) => {
      const slaBreached = w.slaStatus === "breached";
      const severity: IntelligenceInsightSeverity = slaBreached ? "critical" : "high";
      const evidence: string[] = [
        `Tipo: ${w.type}`,
        `Estado: ${w.status}`,
        `SLA: ${w.slaStatus ?? "sin dato"}`,
      ];
      if (w.urgencyScore !== undefined) evidence.push(`Urgencia: ${w.urgencyScore}`);
      if (!w.ownerLabel && !w.assignedUserId) evidence.push("Sin responsable asignado");

      return {
        id: `insight:cashflow:critical:${w.id}`,
        severity,
        category: "cashflow" as IntelligenceInsightCategory,
        title: `Presión de caja: ${w.title}`,
        cause:
          "Workflow de caja crítica activo. La cobertura de liquidez puede estar comprometida si no se resuelve antes del vencimiento.",
        impact:
          "Riesgo de descalce operativo. Cada ciclo de inacción amplifica la presión sobre el flujo de fondos.",
        nextBestAction:
          "Priorizar cobros pendientes de mayor monto y revisar pagos diferibles antes del vencimiento del SLA.",
        consequenceIfIgnored:
          "Ruptura de liquidez operativa con impacto directo en la capacidad de pago a proveedores y caja disponible.",
        confidence: conf,
        evidence,
        linkedWorkflowIds: [w.id],
        linkedEventIds: [],
        linkedActionIds: [],
      };
    });
}

// ── Rule 2: Recurring / reopened workflow ────────────────────────────────────

const REOPEN_THRESHOLD = 2;

function buildRecurringInsights(
  input: OperationalIntelligenceInput
): OperationalIntelligenceInsight[] {
  const conf = baseConfidence(input);

  // From lifecycle data
  const fromLifecycle = input.workflows
    .filter(
      (w) =>
        isOpenWorkflow(w) &&
        (w.lifecycle?.reopenCount ?? 0) >= REOPEN_THRESHOLD
    )
    .map((w) => {
      const reopenCount = w.lifecycle!.reopenCount!;
      const severity: IntelligenceInsightSeverity = reopenCount >= 4 ? "high" : "medium";
      const evidence: string[] = [
        `Reaperturas: ${reopenCount}`,
        `Clave operativa: ${w.dedupeKey}`,
        `Estado actual: ${w.status}`,
      ];

      return {
        id: `insight:execution:recurring:${w.id}`,
        severity,
        category: "execution" as IntelligenceInsightCategory,
        title: `Patrón recurrente: ${w.title}`,
        cause: `El workflow fue reabierto ${reopenCount} veces con la misma clave operativa. El problema de fondo no fue resuelto.`,
        impact:
          "Repetición operacional que consume tiempo y recursos sin avanzar hacia una resolución definitiva.",
        nextBestAction:
          "Identificar y atacar la causa raíz antes de cerrar el workflow. Documentar el hallazgo como nota operativa.",
        consequenceIfIgnored:
          "El ciclo se repite: el workflow se cierra y se reabre indefinidamente, degradando la confianza en el sistema.",
        confidence: conf,
        evidence,
        linkedWorkflowIds: [w.id],
        linkedEventIds: [],
        linkedActionIds: [],
      };
    });

  // From automation recurring_detection (deduped with lifecycle ones)
  const lifecycleWorkflowIds = new Set(fromLifecycle.map((i) => i.linkedWorkflowIds[0]));
  const fromAutomation = (input.operationalAutomation?.automations ?? [])
    .filter(
      (a) =>
        a.kind === "recurring_detection" &&
        !lifecycleWorkflowIds.has(a.workflowId)
    )
    .map((a) => {
      const evidence: string[] = [`Automatización: ${a.title}`, `Razón: ${a.summary}`];
      if (a.metadata?.dedupeKey) evidence.push(`Clave: ${String(a.metadata.dedupeKey)}`);

      return {
        id: `insight:execution:recurring:auto:${a.workflowId}`,
        severity: "medium" as IntelligenceInsightSeverity,
        category: "execution" as IntelligenceInsightCategory,
        title: `Recurrencia detectada: ${a.title}`,
        cause:
          "La automatización detectó un patrón de recurrencia operacional para este workflow.",
        impact: "El patrón recurrente aumenta el costo operativo acumulado.",
        nextBestAction:
          "Revisar la causa raíz del workflow recurrente antes de cerrarlo nuevamente.",
        consequenceIfIgnored:
          "El patrón continuará sin corrección y el costo acumulado seguirá creciendo.",
        confidence: "medium" as const,
        evidence,
        linkedWorkflowIds: [a.workflowId],
        linkedEventIds: [],
        linkedActionIds: [],
      };
    });

  return [...fromLifecycle, ...fromAutomation];
}

// ── Rule 3: SLA breached ─────────────────────────────────────────────────────

function buildSlaBreachedInsights(
  input: OperationalIntelligenceInput,
  usedWorkflowIds: Set<string>
): OperationalIntelligenceInsight[] {
  const conf = baseConfidence(input);

  return input.workflows
    .filter(
      (w) =>
        isOpenWorkflow(w) &&
        w.slaStatus === "breached" &&
        // Avoid double-counting critical_cash (already covered by Rule 1)
        w.type !== "critical_cash"
    )
    .filter((w) => !usedWorkflowIds.has(`execution:sla:${w.id}`))
    .map((w) => {
      const evidence: string[] = [
        `SLA: breached`,
        `Tipo: ${w.type}`,
        `Estado: ${w.status}`,
      ];
      if (w.ownerLabel) evidence.push(`Responsable: ${w.ownerLabel}`);
      else evidence.push("Sin responsable asignado");
      if (w.slaDueAt) evidence.push(`Venció: ${w.slaDueAt}`);

      return {
        id: `insight:execution:sla:${w.id}`,
        severity: "high" as IntelligenceInsightSeverity,
        category: "execution" as IntelligenceInsightCategory,
        title: `SLA vencido: ${w.title}`,
        cause:
          "El workflow superó su límite de tiempo operativo sin ser atendido o desbloqueado.",
        impact:
          "Pérdida de control operativo. El retraso se acumula y puede derivar en escalación.",
        nextBestAction: w.ownerLabel
          ? `Verificar con ${w.ownerLabel} el estado y plan de desbloqueo.`
          : "Asignar un responsable e iniciar el proceso de desbloqueo de inmediato.",
        consequenceIfIgnored:
          "Escalación automática y posible impacto en clientes o en el flujo de fondos.",
        confidence: conf,
        evidence,
        linkedWorkflowIds: [w.id],
        linkedEventIds: [],
        linkedActionIds: [],
      };
    });
}

// ── Rule 4: Governance supervised / restricted ───────────────────────────────

function buildGovernanceInsights(
  input: OperationalIntelligenceInput
): OperationalIntelligenceInsight[] {
  const conf = baseConfidence(input);

  return input.governance.activeAutomations
    .filter(
      (ga) => ga.rule.riskLevel === "supervised" || ga.rule.riskLevel === "restricted"
    )
    .map((ga) => {
      const isRestricted = ga.rule.riskLevel === "restricted";
      const severity: IntelligenceInsightSeverity = isRestricted ? "high" : "medium";
      const evidence: string[] = [
        `Regla: ${ga.rule.name}`,
        `Nivel de riesgo: ${ga.rule.riskLevel}`,
        `Razón: ${ga.explanation.summary}`,
      ];
      if (ga.explanation.evidence.length > 0) {
        evidence.push(...ga.explanation.evidence.slice(0, 2));
      }

      return {
        id: `insight:governance:${ga.automation.id}`,
        severity,
        category: "governance" as IntelligenceInsightCategory,
        title: `Automatización retenida: ${ga.automation.title}`,
        cause: `La regla "${ga.rule.name}" detectó una condición que requiere aprobación humana antes de ejecutar.`,
        impact: isRestricted
          ? "Acción bloqueada por política de alto riesgo. No se puede ejecutar sin aprobación explícita."
          : "Acción en espera de revisión. El flujo operativo está pausado hasta que se decida.",
        nextBestAction:
          "Revisar la automatización en el panel de governance y aprobar o rechazar explícitamente.",
        consequenceIfIgnored:
          "La situación detectada permanece sin resolución mientras la automatización queda pendiente indefinidamente.",
        confidence: conf,
        evidence,
        linkedWorkflowIds: [ga.automation.workflowId],
        linkedEventIds: [],
        linkedActionIds: [],
      };
    });
}

// ── Rule 5: Recent closures (positive signal) ────────────────────────────────

const RESOLVED_EVENT_TYPES = new Set<OperationalTimelineItem["eventType"]>([
  "workflow_completed",
  "workflow_auto_completed",
  "action_resolved",
]);

function buildResolvedInsights(
  input: OperationalIntelligenceInput
): OperationalIntelligenceInsight[] {
  const resolved: OperationalIntelligenceInsight[] = [];
  const seen = new Set<string>();

  for (const ev of input.operationalEvents) {
    if (!RESOLVED_EVENT_TYPES.has(ev.eventType)) continue;
    const key = `${ev.entityType}:${ev.entityId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const label = ev.entityLabel || ev.entityId;
    const evidence: string[] = [
      `Evento: ${ev.typeLabel}`,
      `Ocurrió: ${new Date(ev.occurredAt).toLocaleDateString("es-AR")}`,
    ];
    if (ev.actorLabel) evidence.push(`Por: ${ev.actorLabel}`);

    resolved.push({
      id: `insight:operations:resolved:${ev.entityId}`,
      severity: "low",
      category: "operations",
      title: `Resolución reciente: ${label}`,
      cause: "Un workflow o acción fue completado recientemente, reduciendo la presión operacional.",
      impact:
        "Señal positiva: liberación de carga operativa y reducción de elementos pendientes.",
      nextBestAction:
        "Verificar que la mejora se sostuvo: confirmar que no se reabrió ni derivó en otro problema.",
      consequenceIfIgnored:
        "Sin acción necesaria si la resolución persiste. Monitorear reaperturas en los próximos días.",
      confidence: "high",
      evidence,
      linkedWorkflowIds: ev.entityType === "workflow" ? [ev.entityId] : [],
      linkedEventIds: [ev.id],
      linkedActionIds: ev.entityType === "action" ? [ev.entityId] : [],
    });

    if (resolved.length >= 2) break;
  }

  return resolved;
}

// ── Top pattern detection ────────────────────────────────────────────────────

function detectTopPattern(
  insights: OperationalIntelligenceInsight[],
  input: OperationalIntelligenceInput
): OperationalIntelligencePattern | undefined {
  const slaCount = insights.filter(
    (i) => i.id.includes(":sla:") || (i.category === "cashflow" && i.severity === "critical")
  ).length;

  const recurringCount = insights.filter((i) => i.id.includes(":recurring:")).length;
  const governanceCount = insights.filter((i) => i.category === "governance").length;
  const cashflowCount = insights.filter((i) => i.category === "cashflow").length;

  if (slaCount >= 2) {
    const wfTitles = insights
      .filter((i) => i.id.includes(":sla:") || i.category === "cashflow")
      .map((i) => i.title)
      .slice(0, 3);
    return {
      title: "Patrón: múltiples SLA vencidos simultáneos",
      description:
        "Hay varios workflows con SLA vencido al mismo tiempo. Esto indica un problema sistémico de asignación o priorización, no un caso aislado.",
      evidence: wfTitles,
    };
  }

  if (recurringCount >= 2) {
    const reopenTotal = input.workflows
      .filter((w) => (w.lifecycle?.reopenCount ?? 0) >= REOPEN_THRESHOLD)
      .reduce((sum, w) => sum + (w.lifecycle?.reopenCount ?? 0), 0);
    return {
      title: "Patrón: recurrencia operacional sin resolución de raíz",
      description:
        "Múltiples workflows se repiten con la misma clave operativa. El equipo cierra situaciones sin atacar la causa subyacente.",
      evidence: [
        `${recurringCount} workflows recurrentes`,
        `${reopenTotal} reaperturas acumuladas`,
      ],
    };
  }

  if (governanceCount >= 2) {
    return {
      title: "Patrón: cola de governance acumulada",
      description:
        "Múltiples automatizaciones están retenidas esperando aprobación humana. La cola de governance puede convertirse en un cuello de botella operativo.",
      evidence: [`${governanceCount} automatizaciones en espera de aprobación`],
    };
  }

  if (cashflowCount >= 2) {
    return {
      title: "Patrón: presión de caja multifocal",
      description:
        "Varios workflows de caja crítica están activos simultáneamente. La presión de liquidez es multifocal y requiere priorización explícita.",
      evidence: [`${cashflowCount} workflows de caja crítica activos`],
    };
  }

  return undefined;
}

// ── Health ───────────────────────────────────────────────────────────────────

function deriveHealth(input: OperationalIntelligenceInput): OperationalIntelligenceHealth {
  const snapshotStatus = input.snapshotHealth?.status;
  const warnings: string[] = [];

  if (snapshotStatus === "degraded" || snapshotStatus === "error") {
    warnings.push("Snapshot degradado — insights basados en datos parciales.");
    return { status: "degraded", warnings };
  }
  if (snapshotStatus === "partial" || snapshotStatus === "stale") {
    warnings.push("Snapshot parcial — algunos insights pueden tener menor precisión.");
    return { status: "partial", warnings };
  }
  return { status: "ok", warnings };
}

// ── Main entry point ─────────────────────────────────────────────────────────

export function buildOperationalIntelligence(
  input: OperationalIntelligenceInput
): OperationalIntelligenceResponse {
  const usedDedupeKeys = new Set<string>();

  function deduped(
    insights: OperationalIntelligenceInsight[]
  ): OperationalIntelligenceInsight[] {
    return insights.filter((insight) => {
      if (usedDedupeKeys.has(insight.id)) return false;
      usedDedupeKeys.add(insight.id);
      return true;
    });
  }

  // Collect all candidates in priority order
  const candidates: OperationalIntelligenceInsight[] = [
    ...deduped(buildCriticalCashInsights(input)),
    ...deduped(buildSlaBreachedInsights(input, usedDedupeKeys)),
    ...deduped(buildRecurringInsights(input)),
    ...deduped(buildGovernanceInsights(input)),
    ...deduped(buildResolvedInsights(input)),
  ];

  // Sort by severity then trim to max
  const sorted = candidates.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );
  const insights = sorted.slice(0, MAX_INSIGHTS);

  return {
    generatedAt: input.now.toISOString(),
    insights,
    topPattern: detectTopPattern(insights, input),
    health: deriveHealth(input),
  };
}
