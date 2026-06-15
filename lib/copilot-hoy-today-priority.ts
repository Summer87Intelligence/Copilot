/**
 * Prioridad única del día en /copilot/hoy — heurística UI pura (sin APIs nuevas).
 */

export type HoyTodayPriorityKind =
  | "critical_clients"
  | "active_debt"
  | "collection_agenda"
  | "treasury_review"
  | "daily_summary";

export type HoyTodayPriorityAction =
  | { type: "link"; href: string }
  | { type: "scroll_critical" };

export type HoyTodayPriority = {
  kind: HoyTodayPriorityKind;
  title: string;
  description: string;
  primaryCta: { label: string; action: HoyTodayPriorityAction };
  secondaryCta?: { label: string; href: string };
};

export type ResolveHoyTodayPriorityInput = {
  /** Clientes con deuda vencida o señal de demora. */
  attentionClientsCount: number;
  /** Total de clientes con cualquier deuda activa (incluye al día). */
  debtorClientsCount: number;
  agendaOverdueCount: number;
  agendaDueTodayCount: number;
  cashAfterPaymentsCritical: boolean;
};

export function resolveHoyTodayPriority(
  input: ResolveHoyTodayPriorityInput
): HoyTodayPriority {
  const { attentionClientsCount, debtorClientsCount } = input;

  if (attentionClientsCount > 0) {
    const total = debtorClientsCount;
    const overdue = attentionClientsCount;
    const current = Math.max(0, total - overdue);
    const totalLabel = `${total} ${total === 1 ? "cliente" : "clientes"} con deuda actual`;
    const overdueLabel = `${overdue} ${overdue === 1 ? "tiene" : "tienen"} deuda atrasada`;
    const currentLabel = `${current} ${current === 1 ? "está" : "están"} al día`;
    const description =
      current > 0
        ? `${totalLabel}. ${overdueLabel} y ${currentLabel}.`
        : `${totalLabel}. ${overdueLabel}.`;
    return {
      kind: "critical_clients",
      title: "Gestionar clientes con deuda",
      description,
      primaryCta: {
        label: "Ver clientes con deuda",
        action: { type: "scroll_critical" },
      },
      secondaryCta: { label: "Ver acciones", href: "/copilot/acciones" },
    };
  }

  const agendaUrgent = input.agendaOverdueCount + input.agendaDueTodayCount;
  if (agendaUrgent > 0) {
    const parts: string[] = [];
    if (input.agendaOverdueCount > 0) {
      parts.push(
        `${input.agendaOverdueCount} vencido${input.agendaOverdueCount === 1 ? "" : "s"}`
      );
    }
    if (input.agendaDueTodayCount > 0) {
      parts.push(`${input.agendaDueTodayCount} para hoy`);
    }
    return {
      kind: "collection_agenda",
      title: "Revisar agenda de cobranza",
      description: `Tenés seguimientos pendientes: ${parts.join(" y ")}.`,
      primaryCta: {
        label: "Ver agenda",
        action: { type: "link", href: "/copilot/acciones?tab=agenda" },
      },
    };
  }

  if (input.cashAfterPaymentsCritical) {
    return {
      kind: "treasury_review",
      title: "Revisar cobertura de pagos",
      description:
        "La cobertura con cobros esperados queda ajustada. Revisá saldo actual y compromisos.",
      primaryCta: {
        label: "Ver pagos próximos",
        action: { type: "link", href: "/copilot/tesoreria?section=obligations" },
      },
      secondaryCta: { label: "Ver Tesorería", href: "/copilot/tesoreria" },
    };
  }

  if (debtorClientsCount > 0) {
    const n = debtorClientsCount;
    return {
      kind: "active_debt",
      title: "Gestionar clientes con deuda",
      description: `${n} ${n === 1 ? "cliente" : "clientes"} con deuda actual al día. Sin vencimientos pendientes.`,
      primaryCta: {
        label: "Ver clientes con deuda",
        action: { type: "scroll_critical" },
      },
    };
  }

  return {
    kind: "daily_summary",
    title: "Revisar resumen del día",
    description:
      "No hay urgencias críticas en cobranza. Revisá la bandeja por si hay algo pendiente.",
    primaryCta: {
      label: "Ver acciones",
      action: { type: "link", href: "/copilot/acciones" },
    },
  };
}
