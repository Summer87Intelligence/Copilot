import type {
  OperationalWorkflowTemplate,
  OperationalWorkflowType,
} from "@/lib/copilot-operational-workflows-types";

const CRITICAL_CASH_STEPS = [
  { id: "review-overdue-collections", title: "Revisar cobranza atrasada", href: "/copilot/cobranza" },
  { id: "contact-priority-clients", title: "Contactar clientes prioritarios", href: "/copilot/cobranza" },
  { id: "review-non-critical-payments", title: "Revisar pagos no críticos", href: "/copilot/tesoreria" },
  { id: "adjust-outflows", title: "Ajustar egresos", href: "/copilot/tesoreria" },
  { id: "confirm-stabilization", title: "Confirmar estabilización", href: "/copilot/hoy" },
] as const;

const PRIORITY_COLLECTIONS_STEPS = [
  { id: "identify-main-debt", title: "Identificar deuda principal", href: "/copilot/cobranza" },
  { id: "contact-client", title: "Contactar cliente", href: "/copilot/cobranza" },
  { id: "record-response", title: "Registrar respuesta", href: "/copilot/cobranza" },
  { id: "reschedule-followup", title: "Reprogramar seguimiento", href: "/copilot/cobranza" },
  { id: "escalate-no-response", title: "Escalar si no responde", href: "/copilot/cobranza" },
] as const;

const BLOCKED_FOLLOWUP_STEPS = [
  { id: "identify-blocker", title: "Identificar bloqueo", href: "/copilot/cobranza" },
  { id: "validate-dependency", title: "Validar dependencia", href: "/copilot/cobranza" },
  { id: "assign-resolution", title: "Asignar resolución", href: "/copilot/cobranza" },
  { id: "confirm-unblock", title: "Confirmar desbloqueo", href: "/copilot/cobranza" },
  { id: "resume-execution", title: "Retomar ejecución", href: "/copilot/hoy" },
] as const;

function buildTemplate(
  type: OperationalWorkflowType,
  title: string,
  steps: ReadonlyArray<{ id: string; title: string; href?: string }>
): OperationalWorkflowTemplate {
  return {
    id: `template:${type}`,
    type,
    title,
    steps: steps.map((step, index) => ({
      id: step.id,
      order: index + 1,
      title: step.title,
      href: step.href,
    })),
  };
}

export const OPERATIONAL_WORKFLOW_TEMPLATES: OperationalWorkflowTemplate[] = [
  buildTemplate("critical_cash", "Caja crítica", CRITICAL_CASH_STEPS),
  buildTemplate("priority_collections", "Cobranza prioritaria", PRIORITY_COLLECTIONS_STEPS),
  buildTemplate("blocked_followup", "Seguimiento bloqueado", BLOCKED_FOLLOWUP_STEPS),
];

export function getOperationalWorkflowTemplate(
  type: OperationalWorkflowType
): OperationalWorkflowTemplate {
  const template = OPERATIONAL_WORKFLOW_TEMPLATES.find((row) => row.type === type);
  if (!template) {
    throw new Error(`Plantilla de workflow no encontrada: ${type}`);
  }
  return template;
}
