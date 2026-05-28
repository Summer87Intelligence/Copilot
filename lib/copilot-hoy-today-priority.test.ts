import { describe, expect, it } from "vitest";
import { resolveHoyTodayPriority } from "@/lib/copilot-hoy-today-priority";

describe("resolveHoyTodayPriority", () => {
  it("prioriza clientes con atención", () => {
    const p = resolveHoyTodayPriority({
      attentionClientsCount: 3,
      agendaOverdueCount: 2,
      agendaDueTodayCount: 1,
      cashAfterPaymentsCritical: true,
    });
    expect(p.kind).toBe("critical_clients");
    expect(p.primaryCta.action).toEqual({ type: "scroll_critical" });
  });

  it("prioriza agenda si no hay clientes críticos", () => {
    const p = resolveHoyTodayPriority({
      attentionClientsCount: 0,
      agendaOverdueCount: 1,
      agendaDueTodayCount: 0,
      cashAfterPaymentsCritical: false,
    });
    expect(p.kind).toBe("collection_agenda");
    expect(p.primaryCta.action).toEqual({
      type: "link",
      href: "/copilot/acciones?tab=agenda",
    });
  });

  it("prioriza tesorería si caja ajustada y sin cobranza urgente", () => {
    const p = resolveHoyTodayPriority({
      attentionClientsCount: 0,
      agendaOverdueCount: 0,
      agendaDueTodayCount: 0,
      cashAfterPaymentsCritical: true,
    });
    expect(p.kind).toBe("treasury_review");
  });

  it("fallback a acciones", () => {
    const p = resolveHoyTodayPriority({
      attentionClientsCount: 0,
      agendaOverdueCount: 0,
      agendaDueTodayCount: 0,
      cashAfterPaymentsCritical: false,
    });
    expect(p.kind).toBe("daily_summary");
    expect(p.primaryCta.action).toEqual({
      type: "link",
      href: "/copilot/acciones",
    });
  });
});
