import { describe, expect, it } from "vitest";
import { buildCollectionFollowupPriorities } from "./build-collection-followup-agent-brief";
import type { CollectionAction } from "@/lib/copilot-collection-types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TODAY = "2026-05-25";

function makeAction(overrides: Partial<CollectionAction>): CollectionAction {
  return {
    id: "test-id",
    workspaceCompanyId: "ws1",
    companyId: "company-1",
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
    metadata: null,
    isActive: true,
    archivedAt: null,
    createdAt: "2026-05-24T10:00:00Z",
    updatedAt: "2026-05-24T10:00:00Z",
    ...overrides,
  };
}

const emptyNames = new Map<string, string>();

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("buildCollectionFollowupPriorities", () => {
  it("sin gestiones → no genera prioridades", () => {
    const result = buildCollectionFollowupPriorities([], emptyNames, TODAY);
    expect(result).toHaveLength(0);
  });

  it("next_follow_up_at = hoy → prioridad alta con motivo 'hoy'", () => {
    const action = makeAction({ nextActionDate: TODAY });
    const result = buildCollectionFollowupPriorities([action], emptyNames, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("high");
    expect(result[0].id).toContain("followup-overdue");
    expect(result[0].reason).toContain("hoy");
    expect(result[0].ctaLabel).toBe("Ver cliente");
  });

  it("next_follow_up_at = ayer → prioridad alta con motivo 'vencido'", () => {
    const action = makeAction({ nextActionDate: "2026-05-24" });
    const result = buildCollectionFollowupPriorities([action], emptyNames, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("high");
    expect(result[0].reason).toContain("vencido");
  });

  it("promesa de pago vencida → prioridad crítica", () => {
    const action = makeAction({
      status: "promised_payment",
      metadata: { ui_outcome: "promised_payment" },
      promiseDate: "2026-05-24",
    });
    const result = buildCollectionFollowupPriorities([action], emptyNames, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("critical");
    expect(result[0].id).toContain("promise-overdue");
    expect(result[0].ctaLabel).toBe("Ver cliente");
  });

  it("promesa de pago futura → prioridad baja", () => {
    const action = makeAction({
      status: "promised_payment",
      metadata: { ui_outcome: "promised_payment" },
      promiseDate: "2026-05-30",
    });
    const result = buildCollectionFollowupPriorities([action], emptyNames, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("low");
    expect(result[0].id).toContain("promise-future");
    expect(result[0].ctaLabel).toBe("Ver seguimiento");
  });

  it("no_response hace 3 días → reintentar contacto (medium)", () => {
    const action = makeAction({
      status: "paused",
      metadata: { ui_outcome: "no_response" },
      createdAt: "2026-05-22T10:00:00Z",
    });
    const result = buildCollectionFollowupPriorities([action], emptyNames, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Reintentar contacto");
    expect(result[0].severity).toBe("medium");
  });

  it("no_response hace 7 días → reintentar contacto (high)", () => {
    const action = makeAction({
      status: "paused",
      metadata: { ui_outcome: "no_response" },
      createdAt: "2026-05-18T00:00:00Z", // 7 días antes, sin ambigüedad de horario
    });
    const result = buildCollectionFollowupPriorities([action], emptyNames, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("high");
  });

  it("no_response hace 1 día → no genera prioridad (aún no vence el umbral)", () => {
    const action = makeAction({
      status: "paused",
      metadata: { ui_outcome: "no_response" },
      createdAt: "2026-05-24T10:00:00Z",
    });
    const result = buildCollectionFollowupPriorities([action], emptyNames, TODAY);
    expect(result).toHaveLength(0);
  });

  it("wrong_contact → actualizar contacto del cliente (high)", () => {
    const action = makeAction({
      status: "paused",
      metadata: { ui_outcome: "wrong_contact" },
    });
    const result = buildCollectionFollowupPriorities([action], emptyNames, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Actualizar contacto del cliente");
    expect(result[0].severity).toBe("high");
    expect(result[0].ctaLabel).toBe("Ver cliente");
  });

  it("acción con status paid → no genera prioridad de seguimiento", () => {
    const action = makeAction({
      status: "paid",
      metadata: { ui_outcome: "paid" },
    });
    const result = buildCollectionFollowupPriorities([action], emptyNames, TODAY);
    expect(result).toHaveLength(0);
  });

  it("acción inactiva → no genera prioridad", () => {
    const action = makeAction({
      metadata: { ui_outcome: "wrong_contact" },
      isActive: false,
    });
    const result = buildCollectionFollowupPriorities([action], emptyNames, TODAY);
    expect(result).toHaveLength(0);
  });

  it("cliente con nombre en el map → incluye el nombre en el título", () => {
    const action = makeAction({
      companyId: "company-abc",
      metadata: { ui_outcome: "wrong_contact" },
    });
    const names = new Map([["company-abc", "Empresa ABC S.A."]]);
    const result = buildCollectionFollowupPriorities([action], names, TODAY);
    expect(result[0].reason).toContain("Empresa ABC S.A.");
  });

  it("promesa vencida con nombre → incluye nombre en reason", () => {
    const action = makeAction({
      companyId: "company-xyz",
      status: "promised_payment",
      metadata: { ui_outcome: "promised_payment" },
      promiseDate: "2026-05-20",
    });
    const names = new Map([["company-xyz", "Importadora XYZ"]]);
    const result = buildCollectionFollowupPriorities([action], names, TODAY);
    expect(result[0].reason).toContain("Importadora XYZ");
  });

  it("múltiples empresas → ordenadas por severidad (critical primero)", () => {
    const actions = [
      makeAction({
        companyId: "company-1",
        metadata: { ui_outcome: "no_response" },
        createdAt: "2026-05-22T10:00:00Z", // medium
      }),
      makeAction({
        companyId: "company-2",
        status: "promised_payment",
        metadata: { ui_outcome: "promised_payment" },
        promiseDate: "2026-05-24", // critical
      }),
      makeAction({
        companyId: "company-3",
        metadata: { ui_outcome: "wrong_contact" }, // high
      }),
    ];
    const result = buildCollectionFollowupPriorities(actions, emptyNames, TODAY);
    expect(result[0].severity).toBe("critical");
    expect(result[1].severity).toBe("high");
    expect(result[2].severity).toBe("medium");
  });

  it("una sola prioridad por empresa — toma la más reciente si hay varias acciones", () => {
    const actions = [
      makeAction({
        id: "old",
        companyId: "company-1",
        metadata: { ui_outcome: "wrong_contact" },
        createdAt: "2026-05-10T10:00:00Z",
      }),
      makeAction({
        id: "recent",
        companyId: "company-1",
        metadata: { ui_outcome: "contacted" }, // no genera prioridad
        createdAt: "2026-05-24T10:00:00Z",
      }),
    ];
    const result = buildCollectionFollowupPriorities(actions, emptyNames, TODAY);
    // La más reciente es "contacted" — no genera prioridad
    expect(result).toHaveLength(0);
  });
});
