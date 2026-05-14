import type { FiscalAlertCategory, FiscalAlertItem } from "@/lib/copilot-tax-alerts";

export type CopilotAlertOpsActionKind =
  | "followup"
  | "finanzas"
  | "tesoreria"
  | "clientes"
  | "evidence"
  | "hoy";

export type CopilotAlertOpsAction = {
  id: string;
  label: string;
  href: string;
  kind: CopilotAlertOpsActionKind;
  primary?: boolean;
};

export type CopilotAlertOpsContext = {
  impact: string;
  whyItMatters: string;
  primary: CopilotAlertOpsAction;
  quick: CopilotAlertOpsAction[];
  technicalDetail: string;
};

const PRIORITY_LABEL = {
  critical: "crítica",
  high: "alta",
  medium: "media",
} as const;

export function buildAccionesHrefFromAlert(alert: FiscalAlertItem): string {
  const params = new URLSearchParams();
  params.set("source", "alert");
  params.set("alertId", alert.id);
  params.set("priority", alert.priority);
  params.set("alertType", alert.type);
  if (alert.obligationId) params.set("obligationId", alert.obligationId);
  params.set("alertTitle", alert.title);
  return `/copilot/acciones?${params.toString()}`;
}

export function buildOperationalActionHref(actionId: string): string {
  const params = new URLSearchParams();
  params.set("operationalActionId", actionId);
  return `/copilot/acciones?${params.toString()}`;
}

export function buildAlertasDeepLink(alert: FiscalAlertItem): string {
  const params = new URLSearchParams();
  params.set("priority", alert.priority);
  return `/copilot/alertas?${params.toString()}`;
}

function finanzasLiquidityHref(): string {
  return "/copilot/finanzas?focus=liquidity#copilot-finanzas-cobertura";
}

function finanzasFiscalHref(obligationId: string | null): string {
  if (obligationId) {
    return `/copilot/finanzas#copilot-finanzas-fiscal-priority-intervention`;
  }
  return "/copilot/finanzas#copilot-finanzas-fiscal";
}

function tesoreriaSectionHref(section: "obligations" | "bank" | "dashboard"): string {
  return `/copilot/tesoreria?section=${section}`;
}

function followupAction(alert: FiscalAlertItem): CopilotAlertOpsAction {
  return {
    id: "followup",
    label: "Crear seguimiento",
    href: buildAccionesHrefFromAlert(alert),
    kind: "followup",
    primary: true,
  };
}

function whyByType(type: FiscalAlertCategory, priority: FiscalAlertItem["priority"]): string {
  switch (type) {
    case "fiscalidad":
      return "Un vencimiento fiscal sin cierre empuja recargos, ruido con organismos y presión en la próxima ronda de egresos.";
    case "liquidez":
      return "La caja proyectada no alcanza para cubrir salidas ya modeladas; el riesgo es de días, no de meses.";
    case "cobertura":
      return "Caja más cobranza esperada no cubre egresos: un desvío de ingreso vuelve a poner en riesgo el cumplimiento.";
    case "conciliacion":
      return "Pagos o movimientos sin vínculo claro distorsionan la lectura fiscal y operativa del período.";
    default:
      return `Prioridad ${PRIORITY_LABEL[priority]}: conviene cerrar lectura y responsable hoy.`;
  }
}

function actionsForType(alert: FiscalAlertItem): {
  primary: CopilotAlertOpsAction;
  quick: CopilotAlertOpsAction[];
} {
  const followup = followupAction(alert);
  const finanzas = {
    id: "finanzas",
    label: "Ver en Finanzas",
    href: finanzasFiscalHref(alert.obligationId),
    kind: "finanzas" as const,
  };
  const tesoreriaObligations = {
    id: "tesoreria-obligations",
    label: "Ir a Tesorería",
    href: tesoreriaSectionHref("obligations"),
    kind: "tesoreria" as const,
  };
  const tesoreriaBank = {
    id: "tesoreria-bank",
    label: "Conciliar movimiento",
    href: tesoreriaSectionHref("bank"),
    kind: "tesoreria" as const,
  };
  const clientes = {
    id: "clientes",
    label: "Ver clientes",
    href: "/copilot/clientes",
    kind: "clientes" as const,
  };
  const hoy = {
    id: "hoy",
    label: "Volver a Hoy",
    href: "/copilot/rutas",
    kind: "hoy" as const,
  };

  switch (alert.type) {
    case "fiscalidad":
      return {
        primary: alert.obligationId
          ? {
              id: "register-payment",
              label: "Registrar pago",
              href: finanzasFiscalHref(alert.obligationId),
              kind: "finanzas",
              primary: true,
            }
          : followup,
        quick: [
          followup,
          tesoreriaObligations,
          finanzas,
          hoy,
        ].filter((action, index, list) => list.findIndex((a) => a.id === action.id) === index),
      };
    case "liquidez":
      return {
        primary: {
          id: "liquidity-plan",
          label: "Ver plan de liquidez",
          href: finanzasLiquidityHref(),
          kind: "finanzas",
          primary: true,
        },
        quick: [followup, tesoreriaObligations, clientes, hoy],
      };
    case "cobertura":
      return {
        primary: {
          id: "coverage-plan",
          label: "Ver cobertura en Finanzas",
          href: finanzasLiquidityHref(),
          kind: "finanzas",
          primary: true,
        },
        quick: [followup, clientes, tesoreriaObligations, hoy],
      };
    case "conciliacion":
      return {
        primary: tesoreriaBank,
        quick: [followup, finanzas, hoy],
      };
    default:
      return { primary: followup, quick: [finanzas, hoy] };
  }
}

export function buildCopilotAlertOpsContext(alert: FiscalAlertItem): CopilotAlertOpsContext {
  const { primary, quick } = actionsForType(alert);
  const quickFiltered = quick.filter((action) => action.id !== primary.id);

  return {
    impact: alert.summary,
    whyItMatters: whyByType(alert.type, alert.priority),
    primary,
    quick: quickFiltered,
    technicalDetail: alert.detail,
  };
}

export type CopilotActionProvenanceQuery = {
  source: string | null;
  alertId: string | null;
  priority: FiscalAlertItem["priority"] | null;
  alertType: FiscalAlertCategory | null;
  obligationId: string | null;
  alertTitle: string | null;
  insightId: string | null;
  operationalActionId: string | null;
};

export function parseCopilotActionProvenance(
  searchParams: URLSearchParams
): CopilotActionProvenanceQuery {
  const priorityRaw = searchParams.get("priority");
  const typeRaw = searchParams.get("alertType");
  const priority =
    priorityRaw === "critical" || priorityRaw === "high" || priorityRaw === "medium"
      ? priorityRaw
      : null;
  const alertType =
    typeRaw === "fiscalidad" ||
    typeRaw === "liquidez" ||
    typeRaw === "cobertura" ||
    typeRaw === "conciliacion"
      ? typeRaw
      : null;

  return {
    source: searchParams.get("source"),
    alertId: searchParams.get("alertId"),
    priority,
    alertType,
    obligationId: searchParams.get("obligationId"),
    alertTitle: searchParams.get("alertTitle"),
    insightId: searchParams.get("insightId"),
    operationalActionId: searchParams.get("operationalActionId"),
  };
}

export function formatActionProvenanceLabel(
  provenance: CopilotActionProvenanceQuery
): string | null {
  if (provenance.source === "alert" && provenance.priority) {
    const entity = provenance.alertTitle ? ` · ${provenance.alertTitle}` : "";
    return `Generada desde alerta ${PRIORITY_LABEL[provenance.priority]}${entity}`;
  }
  if (provenance.source === "insight") {
    return "Seguimiento desde insight recomendado";
  }
  if (provenance.source === "recommendation") {
    return "Seguimiento desde recomendación de Hoy";
  }
  return null;
}

export function provenanceBadgeTone(
  priority: FiscalAlertItem["priority"] | null
): "neutral" | "warning" | "danger" | "success" {
  if (priority === "critical") return "danger";
  if (priority === "high") return "warning";
  return "neutral";
}

export function buildInsightAccionesHref(insightId: string, title: string): string {
  const params = new URLSearchParams();
  params.set("source", "insight");
  params.set("insightId", insightId);
  params.set("alertTitle", title);
  return `/copilot/acciones?${params.toString()}`;
}

export function buildRecommendationAccionesHref(title: string): string {
  const params = new URLSearchParams();
  params.set("source", "recommendation");
  params.set("alertTitle", title);
  return `/copilot/acciones?${params.toString()}`;
}
