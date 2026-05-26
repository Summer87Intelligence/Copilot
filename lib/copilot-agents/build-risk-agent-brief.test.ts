import { describe, expect, it } from "vitest";

import type { CopilotNotification } from "@/lib/copilot-notifications/notification-types";

import { buildRiskAgentBrief } from "./build-risk-agent-brief";
import type { CopilotAgentBrief, CopilotAgentPriority } from "./types";

function makePriority(
  overrides: Partial<CopilotAgentPriority>
): CopilotAgentPriority {
  return {
    id: "priority-1",
    agentId: "treasury",
    title: "Prioridad",
    reason: "Razón",
    severity: "medium",
    href: "/copilot/tesoreria",
    ctaLabel: "Ver Tesorería",
    ...overrides,
  };
}

function makeBrief(
  agentId: CopilotAgentBrief["agentId"],
  overrides: Partial<CopilotAgentBrief> = {}
): CopilotAgentBrief {
  return {
    agentId,
    title: agentId,
    status: "stable",
    summary: "Sin señales.",
    priorities: [],
    nextBestAction: { label: "Ver", href: "/copilot/hoy" },
    ...overrides,
  };
}

function makeNotif(
  overrides: Partial<CopilotNotification>
): CopilotNotification {
  return {
    id: "notif-1",
    workspace_company_id: "ws1",
    type: "cash_risk_detected",
    severity: "warning",
    title: "Riesgo detectado",
    body: null,
    entity_type: null,
    entity_id: null,
    amount: null,
    currency: null,
    action_href: null,
    dedup_key: null,
    metadata: {},
    read_at: null,
    created_at: "2026-05-25T10:00:00Z",
    ...overrides,
  };
}

describe("buildRiskAgentBrief", () => {
  it("todos stable → risk stable", () => {
    const result = buildRiskAgentBrief({
      cfoBrief: makeBrief("cfo"),
      treasuryBrief: makeBrief("treasury"),
      collectionBrief: makeBrief("collection"),
      dataIntegrityBrief: makeBrief("data_integrity"),
      notifications: [],
    });

    expect(result.status).toBe("stable");
    expect(result.priorities).toHaveLength(0);
    expect(result.summary).toContain("bajo");
  });

  it("treasury critical → risk critical", () => {
    const treasuryBrief = makeBrief("treasury", {
      status: "critical",
      priorities: [
        makePriority({
          id: "treasury-overdue",
          agentId: "treasury",
          severity: "critical",
          href: "/copilot/tesoreria?section=pagos",
          ctaLabel: "Ver pagos",
        }),
      ],
    });

    const result = buildRiskAgentBrief({ treasuryBrief });
    expect(result.status).toBe("critical");
    expect(result.priorities[0].id).toBe("risk-cash");
    expect(result.nextBestAction?.label).toBe("Ver Tesorería");
  });

  it("collection high → risk attention", () => {
    const collectionBrief = makeBrief("collection", {
      status: "attention",
      priorities: [
        makePriority({
          id: "collection-overdue-n1",
          agentId: "collection",
          severity: "high",
          href: "/copilot/clientes/123",
          ctaLabel: "Ver cliente",
        }),
      ],
    });

    const result = buildRiskAgentBrief({ collectionBrief });
    expect(result.status).toBe("attention");
    expect(result.priorities[0].id).toBe("risk-collections");
    expect(result.priorities[0].href).toBe("/copilot/cartera");
  });

  it("data integrity critical → risk critical", () => {
    const dataIntegrityBrief = makeBrief("data_integrity", {
      status: "critical",
      priorities: [
        makePriority({
          id: "data-integrity-sync-failed",
          agentId: "data_integrity",
          severity: "critical",
          href: "/copilot/operacional",
          ctaLabel: "Ver operacional",
        }),
      ],
    });

    const result = buildRiskAgentBrief({ dataIntegrityBrief });
    expect(result.status).toBe("critical");
    expect(result.priorities[0].id).toBe("risk-data");
  });

  it("cfo critical por liquidez → risk critical bajo caja", () => {
    const cfoBrief = makeBrief("cfo", {
      status: "critical",
      priorities: [
        makePriority({
          id: "cfo-liquidity-critical",
          agentId: "cfo",
          severity: "critical",
          href: "/copilot/finanzas",
          ctaLabel: "Ver Finanzas",
        }),
      ],
    });

    const result = buildRiskAgentBrief({ cfoBrief });
    expect(result.status).toBe("critical");
    expect(result.priorities[0].id).toBe("risk-cash");
    expect(result.nextBestAction?.label).toBe("Ver Tesorería");
  });

  it("cfo attention con lectura financiera → prioridad finanzas", () => {
    const cfoBrief = makeBrief("cfo", {
      status: "attention",
      priorities: [
        makePriority({
          id: "cfo-data-partial",
          agentId: "cfo",
          severity: "medium",
          href: "/copilot/finanzas",
          ctaLabel: "Ver Finanzas",
        }),
      ],
    });

    const result = buildRiskAgentBrief({ cfoBrief });
    expect(result.status).toBe("attention");
    expect(result.priorities[0].id).toBe("risk-finance");
  });

  it("múltiples señales → orden correcto", () => {
    const treasuryBrief = makeBrief("treasury", {
      status: "critical",
      priorities: [
        makePriority({
          id: "treasury-cash-risk",
          agentId: "treasury",
          severity: "critical",
          href: "/copilot/tesoreria",
          ctaLabel: "Ver tesorería",
        }),
      ],
    });
    const dataIntegrityBrief = makeBrief("data_integrity", {
      status: "critical",
      priorities: [
        makePriority({
          id: "data-integrity-health-critical",
          agentId: "data_integrity",
          severity: "critical",
          href: "/copilot/operacional",
          ctaLabel: "Ver operacional",
        }),
      ],
    });
    const collectionBrief = makeBrief("collection", {
      status: "attention",
      priorities: [
        makePriority({
          id: "followup-overdue-1",
          agentId: "collection",
          severity: "high",
          href: "/copilot/clientes/1",
          ctaLabel: "Ver seguimiento",
        }),
      ],
    });

    const result = buildRiskAgentBrief({
      treasuryBrief,
      dataIntegrityBrief,
      collectionBrief,
    });

    expect(result.priorities.map((priority) => priority.id)).toEqual([
      "risk-cash",
      "risk-data",
      "risk-collections",
    ]);
  });

  it("no duplica prioridades", () => {
    const collectionBrief = makeBrief("collection", {
      status: "attention",
      priorities: [
        makePriority({
          id: "collection-overdue-1",
          agentId: "collection",
          severity: "high",
          href: "/copilot/clientes/1",
          ctaLabel: "Ver cliente",
        }),
      ],
    });
    const cfoBrief = makeBrief("cfo", {
      status: "attention",
      priorities: [
        makePriority({
          id: "cfo-cartera-vencida",
          agentId: "cfo",
          severity: "high",
          href: "/copilot/cartera",
          ctaLabel: "Ver Cartera",
        }),
      ],
    });

    const result = buildRiskAgentBrief({ collectionBrief, cfoBrief });
    expect(result.priorities).toHaveLength(1);
    expect(result.priorities[0].id).toBe("risk-collections");
  });

  it("CTA principal según mayor riesgo", () => {
    const treasuryBrief = makeBrief("treasury", {
      status: "critical",
      priorities: [
        makePriority({
          id: "treasury-overdue",
          agentId: "treasury",
          severity: "critical",
          href: "/copilot/tesoreria?section=pagos",
          ctaLabel: "Ver pagos",
        }),
      ],
    });
    const collectionBrief = makeBrief("collection", {
      status: "attention",
      priorities: [
        makePriority({
          id: "followup-overdue-1",
          agentId: "collection",
          severity: "high",
          href: "/copilot/clientes/1",
          ctaLabel: "Ver seguimiento",
        }),
      ],
    });

    const result = buildRiskAgentBrief({ treasuryBrief, collectionBrief });
    expect(result.nextBestAction).toEqual({
      label: "Ver Tesorería",
      href: "/copilot/tesoreria",
    });
  });

  it("no inventa montos", () => {
    const result = buildRiskAgentBrief({
      notifications: [
        makeNotif({
          type: "cash_risk_detected",
          severity: "critical",
          amount: 50000,
          currency: "UYU",
        }),
      ],
    });

    expect(result.priorities[0].amount).toBeUndefined();
    expect(result.priorities[0].currency).toBeUndefined();
  });

  it("no genera más de 5 prioridades", () => {
    const result = buildRiskAgentBrief({
      treasuryBrief: makeBrief("treasury", {
        status: "critical",
        priorities: [
          makePriority({
            id: "treasury-overdue",
            agentId: "treasury",
            severity: "critical",
            href: "/copilot/tesoreria?section=pagos",
            ctaLabel: "Ver pagos",
          }),
        ],
      }),
      collectionBrief: makeBrief("collection", {
        status: "critical",
        priorities: [
          makePriority({
            id: "followup-promise-overdue-1",
            agentId: "collection",
            severity: "critical",
            href: "/copilot/clientes/1",
            ctaLabel: "Ver seguimiento",
          }),
        ],
      }),
      dataIntegrityBrief: makeBrief("data_integrity", {
        status: "critical",
        priorities: [
          makePriority({
            id: "data-integrity-sync-failed",
            agentId: "data_integrity",
            severity: "critical",
            href: "/copilot/operacional",
            ctaLabel: "Ver operacional",
          }),
        ],
      }),
      cfoBrief: makeBrief("cfo", {
        status: "critical",
        priorities: [
          makePriority({
            id: "cfo-liquidity-critical",
            agentId: "cfo",
            severity: "critical",
            href: "/copilot/finanzas",
            ctaLabel: "Ver Finanzas",
          }),
        ],
      }),
    });

    expect(result.priorities.length).toBeLessThanOrEqual(5);
    expect(result.priorities.length).toBe(4);
  });
});
