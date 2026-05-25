import { describe, expect, it } from "vitest";
import { buildTreasuryAgentBrief } from "./build-treasury-agent-brief";
import type { CopilotNotification } from "@/lib/copilot-notifications/notification-types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNotif(overrides: Partial<CopilotNotification>): CopilotNotification {
  return {
    id: "notif-1",
    workspace_company_id: "ws1",
    type: "treasury_payment_due",
    severity: "warning",
    title: "Pago próximo",
    body: null,
    entity_type: "planned_cash_obligation",
    entity_id: "obl-1",
    amount: null,
    currency: null,
    action_href: "/copilot/tesoreria?section=pagos",
    dedup_key: null,
    metadata: {},
    read_at: null,
    created_at: "2026-05-25T10:00:00Z",
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("buildTreasuryAgentBrief", () => {
  it("sin señales → brief estable sin prioridades", () => {
    const result = buildTreasuryAgentBrief([]);
    expect(result.status).toBe("stable");
    expect(result.priorities).toHaveLength(0);
    expect(result.summary).toContain("Sin pagos críticos");
    expect(result.nextBestAction!.href).toBe("/copilot/tesoreria");
  });

  it("treasury_payment_overdue → prioridad critical, CTA Ver pagos", () => {
    const n = makeNotif({
      type: "treasury_payment_overdue",
      severity: "critical",
      title: "Pago vencido",
      body: "Impuestos está vencido desde el 20/may.",
      amount: 50000,
      currency: "UYU",
      dedup_key: "treasury_payment_overdue:obl-1:2026-05-20",
    });
    const result = buildTreasuryAgentBrief([n]);
    expect(result.status).toBe("critical");
    expect(result.priorities).toHaveLength(1);
    expect(result.priorities[0].severity).toBe("critical");
    expect(result.priorities[0].id).toBe("treasury-overdue");
    expect(result.priorities[0].ctaLabel).toBe("Ver pagos");
    expect(result.priorities[0].href).toBe("/copilot/tesoreria?section=pagos");
  });

  it("treasury_payment_overdue → amount y currency se copian del notification", () => {
    const n = makeNotif({
      type: "treasury_payment_overdue",
      severity: "critical",
      amount: 12500,
      currency: "USD",
      dedup_key: "treasury_payment_overdue:obl-2:2026-05-19",
    });
    const result = buildTreasuryAgentBrief([n]);
    expect(result.priorities[0].amount).toBe(12500);
    expect(result.priorities[0].currency).toBe("USD");
  });

  it("treasury_payment_due sin amount → no inventa monto", () => {
    const n = makeNotif({
      type: "treasury_payment_due",
      dedup_key: "treasury_payment_due:obl-3:2026-05-25:today",
      amount: null,
      currency: null,
    });
    const result = buildTreasuryAgentBrief([n]);
    expect(result.priorities[0].amount).toBeUndefined();
    expect(result.priorities[0].currency).toBeUndefined();
  });

  it("treasury_payment_due con dedup_key :today → prioridad high", () => {
    const n = makeNotif({
      type: "treasury_payment_due",
      body: "Pago ABC vence hoy.",
      dedup_key: "treasury_payment_due:obl-4:2026-05-25:today",
      amount: 30000,
      currency: "UYU",
    });
    const result = buildTreasuryAgentBrief([n]);
    expect(result.priorities[0].id).toBe("treasury-due-today");
    expect(result.priorities[0].severity).toBe("high");
  });

  it("treasury_payment_due con dedup_key :3d → prioridad medium", () => {
    const n = makeNotif({
      type: "treasury_payment_due",
      body: "Pago XYZ vence en 3 días.",
      dedup_key: "treasury_payment_due:obl-5:2026-05-28:3d",
      amount: 20000,
      currency: "UYU",
    });
    const result = buildTreasuryAgentBrief([n]);
    expect(result.priorities[0].id).toBe("treasury-due-near");
    expect(result.priorities[0].severity).toBe("medium");
  });

  it("treasury_payment_due con dedup_key :1d → prioridad high", () => {
    const n = makeNotif({
      type: "treasury_payment_due",
      body: "Pago vence mañana.",
      dedup_key: "treasury_payment_due:obl-6:2026-05-26:1d",
      amount: 15000,
      currency: "UYU",
    });
    const result = buildTreasuryAgentBrief([n]);
    expect(result.priorities[0].id).toBe("treasury-due-near");
    expect(result.priorities[0].severity).toBe("high");
  });

  it("cash_risk_detected → CTA Ver tesorería", () => {
    const n = makeNotif({
      type: "cash_risk_detected",
      severity: "warning",
      body: "Los egresos próximos pueden superar la caja disponible.",
    });
    const result = buildTreasuryAgentBrief([n]);
    expect(result.priorities[0].id).toBe("treasury-cash-risk");
    expect(result.priorities[0].href).toBe("/copilot/tesoreria");
    expect(result.priorities[0].ctaLabel).toBe("Ver tesorería");
  });

  it("múltiples treasury_payment_due :today → una sola prioridad agrupada", () => {
    const n1 = makeNotif({
      id: "n1",
      type: "treasury_payment_due",
      dedup_key: "treasury_payment_due:obl-7:2026-05-25:today",
      amount: 10000,
      currency: "UYU",
    });
    const n2 = makeNotif({
      id: "n2",
      type: "treasury_payment_due",
      dedup_key: "treasury_payment_due:obl-8:2026-05-25:today",
      amount: 20000,
      currency: "UYU",
    });
    const result = buildTreasuryAgentBrief([n1, n2]);
    const todayPriorities = result.priorities.filter((p) => p.id === "treasury-due-today");
    expect(todayPriorities).toHaveLength(1);
    expect(todayPriorities[0].title).toContain("2");
  });

  it("múltiples treasury_payment_overdue → una sola prioridad, mayor monto en amount", () => {
    const n1 = makeNotif({
      id: "o1",
      type: "treasury_payment_overdue",
      severity: "critical",
      amount: 5000,
      currency: "UYU",
      dedup_key: "treasury_payment_overdue:obl-9:2026-05-20",
    });
    const n2 = makeNotif({
      id: "o2",
      type: "treasury_payment_overdue",
      severity: "critical",
      amount: 80000,
      currency: "UYU",
      dedup_key: "treasury_payment_overdue:obl-10:2026-05-21",
    });
    const result = buildTreasuryAgentBrief([n1, n2]);
    const overduePriorities = result.priorities.filter((p) => p.id === "treasury-overdue");
    expect(overduePriorities).toHaveLength(1);
    expect(overduePriorities[0].amount).toBe(80000);
  });

  it("notificaciones leídas (read_at !== null) → ignoradas", () => {
    const n = makeNotif({
      type: "treasury_payment_overdue",
      severity: "critical",
      read_at: "2026-05-24T08:00:00Z",
    });
    const result = buildTreasuryAgentBrief([n]);
    expect(result.status).toBe("stable");
    expect(result.priorities).toHaveLength(0);
  });

  it("UYU y USD en overdue → usa el de mayor monto (sin mezclar)", () => {
    const nUYU = makeNotif({
      id: "uyu",
      type: "treasury_payment_overdue",
      severity: "critical",
      amount: 100000,
      currency: "UYU",
      dedup_key: "treasury_payment_overdue:obl-11:2026-05-20",
    });
    const nUSD = makeNotif({
      id: "usd",
      type: "treasury_payment_overdue",
      severity: "critical",
      amount: 200,
      currency: "USD",
      dedup_key: "treasury_payment_overdue:obl-12:2026-05-21",
    });
    const result = buildTreasuryAgentBrief([nUYU, nUSD]);
    // UYU 100000 > USD 200 numerically → picks UYU amount
    expect(result.priorities[0].amount).toBe(100000);
    expect(result.priorities[0].currency).toBe("UYU");
  });

  it("overdue + cash_risk → ambas prioridades presentes, overdue primero", () => {
    const overdue = makeNotif({
      id: "ov",
      type: "treasury_payment_overdue",
      severity: "critical",
      dedup_key: "treasury_payment_overdue:obl-13:2026-05-20",
    });
    const risk = makeNotif({
      id: "cr",
      type: "cash_risk_detected",
      severity: "warning",
      body: "Caja ajustada.",
    });
    const result = buildTreasuryAgentBrief([overdue, risk]);
    expect(result.priorities[0].id).toBe("treasury-overdue");
    expect(result.priorities[1].id).toBe("treasury-cash-risk");
    expect(result.summary).toContain("pagos vencidos y riesgo de caja");
  });

  it("nextBestAction apunta a tesorería si no hay prioridades", () => {
    const result = buildTreasuryAgentBrief([]);
    expect(result.nextBestAction!.href).toBe("/copilot/tesoreria");
  });

  it("nextBestAction apunta a pagos si hay overdue", () => {
    const n = makeNotif({
      type: "treasury_payment_overdue",
      severity: "critical",
      dedup_key: "treasury_payment_overdue:obl-14:2026-05-20",
    });
    const result = buildTreasuryAgentBrief([n]);
    expect(result.nextBestAction!.href).toBe("/copilot/tesoreria?section=pagos");
  });
});
