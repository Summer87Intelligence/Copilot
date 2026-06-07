import { describe, expect, it } from "vitest";
import { resolveHoyTodayPriority } from "@/lib/copilot-hoy-today-priority";

const BASE = {
  attentionClientsCount: 0,
  debtorClientsCount: 0,
  agendaOverdueCount: 0,
  agendaDueTodayCount: 0,
  cashAfterPaymentsCritical: false,
};

describe("resolveHoyTodayPriority", () => {
  it("prioriza clientes con atención (vencidos)", () => {
    const p = resolveHoyTodayPriority({
      ...BASE,
      attentionClientsCount: 3,
      debtorClientsCount: 3,
      agendaOverdueCount: 2,
      agendaDueTodayCount: 1,
      cashAfterPaymentsCritical: true,
    });
    expect(p.kind).toBe("critical_clients");
    expect(p.primaryCta.action).toEqual({ type: "scroll_critical" });
  });

  it("título es 'Gestionar clientes con deuda' cuando hay vencidos", () => {
    const p = resolveHoyTodayPriority({
      ...BASE,
      attentionClientsCount: 2,
      debtorClientsCount: 5,
    });
    expect(p.kind).toBe("critical_clients");
    expect(p.title).toBe("Gestionar clientes con deuda");
  });

  it("descripción incluye total y vencidos cuando hay clientes al día además", () => {
    const p = resolveHoyTodayPriority({
      ...BASE,
      attentionClientsCount: 12,
      debtorClientsCount: 19,
    });
    expect(p.kind).toBe("critical_clients");
    expect(p.description).toContain("19 clientes con deuda activa");
    expect(p.description).toContain("12 tienen deuda vencida");
    expect(p.description).toContain("7 están al día");
  });

  it("descripción solo menciona vencidos cuando todos los deudores están vencidos", () => {
    const p = resolveHoyTodayPriority({
      ...BASE,
      attentionClientsCount: 5,
      debtorClientsCount: 5,
    });
    expect(p.kind).toBe("critical_clients");
    expect(p.description).toContain("5 clientes con deuda activa");
    expect(p.description).toContain("5 tienen deuda vencida");
    expect(p.description).not.toContain("al día");
  });

  it("CTA principal es scroll_critical cuando hay vencidos", () => {
    const p = resolveHoyTodayPriority({
      ...BASE,
      attentionClientsCount: 1,
      debtorClientsCount: 1,
    });
    expect(p.primaryCta.action.type).toBe("scroll_critical");
    expect(p.secondaryCta?.href).toBe("/copilot/acciones");
  });

  it("prioriza agenda si no hay clientes con atención", () => {
    const p = resolveHoyTodayPriority({
      ...BASE,
      agendaOverdueCount: 1,
    });
    expect(p.kind).toBe("collection_agenda");
    expect(p.primaryCta.action).toEqual({
      type: "link",
      href: "/copilot/acciones?tab=agenda",
    });
  });

  it("prioriza tesorería si caja ajustada y sin cobranza urgente", () => {
    const p = resolveHoyTodayPriority({
      ...BASE,
      cashAfterPaymentsCritical: true,
    });
    expect(p.kind).toBe("treasury_review");
  });

  it("active_debt cuando hay deuda al día pero sin vencidos", () => {
    const p = resolveHoyTodayPriority({
      ...BASE,
      debtorClientsCount: 7,
    });
    expect(p.kind).toBe("active_debt");
    expect(p.title).toBe("Gestionar clientes con deuda");
    expect(p.description).toContain("7 clientes con deuda activa al día");
    expect(p.description).toContain("Sin vencimientos");
    expect(p.primaryCta.action.type).toBe("scroll_critical");
  });

  it("active_debt singular cuando hay 1 cliente al día", () => {
    const p = resolveHoyTodayPriority({
      ...BASE,
      debtorClientsCount: 1,
    });
    expect(p.kind).toBe("active_debt");
    expect(p.description).toContain("1 cliente con deuda activa al día");
  });

  it("active_debt no se activa si hay vencidos (critical_clients tiene precedencia)", () => {
    const p = resolveHoyTodayPriority({
      ...BASE,
      attentionClientsCount: 1,
      debtorClientsCount: 3,
    });
    expect(p.kind).toBe("critical_clients");
  });

  it("active_debt tiene menor precedencia que agenda", () => {
    const p = resolveHoyTodayPriority({
      ...BASE,
      debtorClientsCount: 5,
      agendaOverdueCount: 2,
    });
    expect(p.kind).toBe("collection_agenda");
  });

  it("active_debt tiene menor precedencia que treasury_review", () => {
    const p = resolveHoyTodayPriority({
      ...BASE,
      debtorClientsCount: 5,
      cashAfterPaymentsCritical: true,
    });
    expect(p.kind).toBe("treasury_review");
  });

  it("fallback a daily_summary cuando no hay nada", () => {
    const p = resolveHoyTodayPriority({ ...BASE });
    expect(p.kind).toBe("daily_summary");
    expect(p.primaryCta.action).toEqual({
      type: "link",
      href: "/copilot/acciones",
    });
  });
});
