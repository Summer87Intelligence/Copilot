/**
 * Prioridad única del día en /copilot/hoy — heurística UI pura (sin APIs nuevas).
 */

export type HoyTodayPriorityKind =
  | "critical_clients"
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
  attentionClientsCount: number;
  agendaOverdueCount: number;
  agendaDueTodayCount: number;
  cashAfterPaymentsCritical: boolean;
};

export function resolveHoyTodayPriority(
  input: ResolveHoyTodayPriorityInput
): HoyTodayPriority {
  if (input.attentionClientsCount > 0) {
    const n = input.attentionClientsCount;
    return {
      kind: "critical_clients",
      title: "Contactar clientes vencidos",
      description: `Empezá por los clientes con deuda vencida. Hay ${n} ${n === 1 ? "caso" : "casos"} que requieren seguimiento.`,
      primaryCta: {
        label: "Ver clientes críticos",
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
      parts.push(
        `${input.agendaDueTodayCount} para hoy`
      );
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
      title: "Revisar Tesorería",
      description:
        "La caja después de pagos programados queda ajustada. Revisá saldo actual y compromisos.",
      primaryCta: {
        label: "Ver Tesorería",
        action: { type: "link", href: "/copilot/tesoreria" },
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
