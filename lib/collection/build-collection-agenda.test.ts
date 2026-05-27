import { describe, expect, it } from "vitest";
import { buildCollectionAgenda } from "./build-collection-agenda";
import type { BuildCollectionAgendaInput } from "./build-collection-agenda";
import type { CollectionAction } from "@/lib/copilot-collection-types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOW = new Date("2026-05-27T12:00:00Z");
const TODAY = "2026-05-27";

function makeAction(
  companyId: string,
  overrides: Partial<CollectionAction> = {}
): CollectionAction {
  return {
    id: `action-${companyId}`,
    workspaceCompanyId: "ws1",
    companyId,
    status: "contacted",
    actionType: "whatsapp",
    priority: "medium",
    assignedTo: null,
    createdBy: null,
    dueDate: null,
    contactDate: null,
    nextActionDate: null,
    promiseDate: null,
    promiseAmount: null,
    promiseCurrency: null,
    notes: null,
    metadata: { ui_outcome: "contacted" },
    isActive: true,
    archivedAt: null,
    createdAt: `${TODAY}T10:00:00Z`,
    updatedAt: `${TODAY}T10:00:00Z`,
    ...overrides,
  };
}

function base(
  overrides: Partial<BuildCollectionAgendaInput> = {}
): BuildCollectionAgendaInput {
  return {
    actions: [],
    clients: [
      { companyId: "c1", name: "Empresa Alpha" },
      { companyId: "c2", name: "Empresa Beta" },
      { companyId: "c3", name: "Empresa Gamma" },
    ],
    now: NOW,
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("buildCollectionAgenda — clasificación básica", () => {
  it("seguimiento vencido va a overdueFollowups", () => {
    const action = makeAction("c1", { nextActionDate: "2026-05-20" });
    const agenda = buildCollectionAgenda(base({ actions: [action] }));
    expect(agenda.overdueFollowups).toHaveLength(1);
    expect(agenda.overdueFollowups[0].companyId).toBe("c1");
    expect(agenda.overdueFollowups[0].type).toBe("followup_overdue");
    expect(agenda.overdueFollowups[0].severity).toBe("high");
    expect(agenda.dueTodayFollowups).toHaveLength(0);
    expect(agenda.upcomingFollowups).toHaveLength(0);
  });

  it("seguimiento hoy va a dueTodayFollowups", () => {
    const action = makeAction("c1", { nextActionDate: TODAY });
    const agenda = buildCollectionAgenda(base({ actions: [action] }));
    expect(agenda.dueTodayFollowups).toHaveLength(1);
    expect(agenda.dueTodayFollowups[0].type).toBe("followup_today");
    expect(agenda.dueTodayFollowups[0].severity).toBe("high");
    expect(agenda.overdueFollowups).toHaveLength(0);
  });

  it("seguimiento futuro va a upcomingFollowups", () => {
    const action = makeAction("c1", { nextActionDate: "2026-06-10" });
    const agenda = buildCollectionAgenda(base({ actions: [action] }));
    expect(agenda.upcomingFollowups).toHaveLength(1);
    expect(agenda.upcomingFollowups[0].type).toBe("followup_upcoming");
    expect(agenda.upcomingFollowups[0].severity).toBe("low");
    expect(agenda.overdueFollowups).toHaveLength(0);
  });

  it("promesa vencida va a overduePromises", () => {
    const action = makeAction("c1", {
      metadata: { ui_outcome: "promised_payment" },
      status: "promised_payment",
      promiseDate: "2026-05-15",
      promiseAmount: 10000,
      promiseCurrency: "UYU",
    });
    const agenda = buildCollectionAgenda(base({ actions: [action] }));
    expect(agenda.overduePromises).toHaveLength(1);
    expect(agenda.overduePromises[0].type).toBe("promise_overdue");
    expect(agenda.overduePromises[0].severity).toBe("critical");
    expect(agenda.overduePromises[0].amountLabel).toContain("10.000");
    expect(agenda.upcomingPromises).toHaveLength(0);
  });

  it("promesa futura va a upcomingPromises", () => {
    const action = makeAction("c1", {
      metadata: { ui_outcome: "promised_payment" },
      status: "promised_payment",
      promiseDate: "2026-06-05",
      promiseAmount: 500,
      promiseCurrency: "USD",
    });
    const agenda = buildCollectionAgenda(base({ actions: [action] }));
    expect(agenda.upcomingPromises).toHaveLength(1);
    expect(agenda.upcomingPromises[0].type).toBe("promise_upcoming");
    expect(agenda.upcomingPromises[0].amountLabel).toContain("U$S");
  });

  it("contacto reciente va a recentContacts", () => {
    const action = makeAction("c1", {
      createdAt: `${TODAY}T08:00:00Z`,
      metadata: { ui_outcome: "contacted" },
    });
    const agenda = buildCollectionAgenda(base({ actions: [action] }));
    expect(agenda.recentContacts).toHaveLength(1);
    expect(agenda.recentContacts[0].type).toBe("recent_contact");
    expect(agenda.recentContacts[0].severity).toBe("low");
    expect(agenda.recentContacts[0].dateLabel).toContain("hoy");
  });
});

describe("buildCollectionAgenda — prioridad entre secciones", () => {
  it("promesa vencida gana sobre seguimiento vencido", () => {
    const action = makeAction("c1", {
      metadata: { ui_outcome: "promised_payment" },
      status: "promised_payment",
      promiseDate: "2026-05-10",
      nextActionDate: "2026-05-20", // también vencido
    });
    const agenda = buildCollectionAgenda(base({ actions: [action] }));
    expect(agenda.overduePromises).toHaveLength(1);
    expect(agenda.overdueFollowups).toHaveLength(0);
  });

  it("seguimiento vencido gana sobre promesa futura", () => {
    const action = makeAction("c1", {
      metadata: { ui_outcome: "promised_payment" },
      status: "promised_payment",
      promiseDate: "2026-06-15", // futura
      nextActionDate: "2026-05-20", // vencido
    });
    const agenda = buildCollectionAgenda(base({ actions: [action] }));
    expect(agenda.overdueFollowups).toHaveLength(1);
    expect(agenda.upcomingPromises).toHaveLength(0);
  });

  it("cliente sin respuesta hace 6 días → overdueFollowups high", () => {
    const sixDaysAgo = new Date(NOW.getTime() - 6 * 86_400_000).toISOString();
    const action = makeAction("c1", {
      metadata: { ui_outcome: "no_response" },
      status: "paused",
      createdAt: sixDaysAgo,
    });
    const agenda = buildCollectionAgenda(base({ actions: [action] }));
    expect(agenda.overdueFollowups).toHaveLength(1);
    expect(agenda.overdueFollowups[0].severity).toBe("high");
    expect(agenda.overdueFollowups[0].outcomeLabel).toContain("Sin respuesta");
  });

  it("contacto incorrecto → overdueFollowups high", () => {
    const action = makeAction("c1", {
      metadata: { ui_outcome: "wrong_contact" },
      status: "paused",
    });
    const agenda = buildCollectionAgenda(base({ actions: [action] }));
    expect(agenda.overdueFollowups).toHaveLength(1);
    expect(agenda.overdueFollowups[0].severity).toBe("high");
    expect(agenda.overdueFollowups[0].outcomeLabel).toContain("incorrecto");
  });

  it("no duplica cliente en varias secciones — toma la acción más reciente", () => {
    const old = makeAction("c1", {
      id: "old",
      createdAt: "2026-05-10T10:00:00Z",
      metadata: { ui_outcome: "no_response" },
      nextActionDate: "2026-05-20",
    });
    const recent = makeAction("c1", {
      id: "recent",
      createdAt: `${TODAY}T10:00:00Z`,
      metadata: { ui_outcome: "contacted" },
      nextActionDate: null,
    });
    const agenda = buildCollectionAgenda(base({ actions: [old, recent] }));
    const total =
      agenda.overdueFollowups.length +
      agenda.dueTodayFollowups.length +
      agenda.upcomingFollowups.length +
      agenda.overduePromises.length +
      agenda.upcomingPromises.length +
      agenda.recentContacts.length;
    expect(total).toBe(1);
    expect(agenda.recentContacts).toHaveLength(1);
  });
});

describe("buildCollectionAgenda — ordenamiento y casos edge", () => {
  it("ordena próximos por fecha ascendente", () => {
    const a1 = makeAction("c1", { nextActionDate: "2026-07-01" });
    const a2 = makeAction("c2", { nextActionDate: "2026-06-01" });
    const a3 = makeAction("c3", { nextActionDate: "2026-06-15" });
    const agenda = buildCollectionAgenda(
      base({ actions: [a1, a2, a3] })
    );
    expect(agenda.upcomingFollowups).toHaveLength(3);
    const dates = agenda.upcomingFollowups.map((i) => i.companyId);
    expect(dates[0]).toBe("c2"); // jun 1 antes que jun 15 antes que jul 1
    expect(dates[1]).toBe("c3");
    expect(dates[2]).toBe("c1");
  });

  it("ignora fechas inválidas en nextActionDate", () => {
    const action = makeAction("c1", { nextActionDate: "invalid-date" });
    const agenda = buildCollectionAgenda(base({ actions: [action] }));
    const total =
      agenda.overdueFollowups.length +
      agenda.dueTodayFollowups.length +
      agenda.upcomingFollowups.length;
    expect(total).toBe(0);
  });

  it("ignora fechas inválidas en promiseDate", () => {
    const action = makeAction("c1", {
      metadata: { ui_outcome: "promised_payment" },
      status: "promised_payment",
      promiseDate: "not-a-date",
    });
    const agenda = buildCollectionAgenda(base({ actions: [action] }));
    expect(agenda.overduePromises).toHaveLength(0);
    expect(agenda.upcomingPromises).toHaveLength(0);
  });

  it("genera href correcto", () => {
    const action = makeAction("c1");
    const agenda = buildCollectionAgenda(base({ actions: [action] }));
    const item = agenda.recentContacts[0];
    expect(item.href).toBe("/copilot/clientes/c1");
  });

  it("no cambia montos ni deuda — solo los incluye en label si vienen del input", () => {
    const action = makeAction("c1", {
      metadata: { ui_outcome: "promised_payment" },
      status: "promised_payment",
      promiseDate: "2026-05-10",
      promiseAmount: 25000,
      promiseCurrency: "UYU",
    });
    const agenda = buildCollectionAgenda(base({ actions: [action] }));
    const item = agenda.overduePromises[0];
    expect(item.amountLabel).toContain("25.000");
    expect(item.amountLabel).not.toContain("U$S");
  });

  it("clientName usa companyId como fallback si no hay cliente en el mapa", () => {
    const action = makeAction("unknown-company", { nextActionDate: TODAY });
    const agenda = buildCollectionAgenda(base({ actions: [action] }));
    expect(agenda.dueTodayFollowups[0].clientName).toBe("unknown-company");
  });

  it("ignora acciones con isActive = false", () => {
    const action = makeAction("c1", {
      isActive: false,
      nextActionDate: "2026-05-20",
    });
    const agenda = buildCollectionAgenda(base({ actions: [action] }));
    expect(agenda.overdueFollowups).toHaveLength(0);
  });

  it("summary refleja counts correctamente", () => {
    const actions = [
      makeAction("c1", { nextActionDate: "2026-05-20" }), // overdue
      makeAction("c2", { nextActionDate: TODAY }),          // today
      makeAction("c3", { nextActionDate: "2026-06-10" }),  // upcoming
    ];
    const agenda = buildCollectionAgenda(base({ actions }));
    expect(agenda.summary.overdueFollowupsCount).toBe(1);
    expect(agenda.summary.dueTodayCount).toBe(1);
    expect(agenda.summary.upcomingCount).toBe(1);
  });
});
