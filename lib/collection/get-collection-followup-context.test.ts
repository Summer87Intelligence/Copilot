import { describe, expect, it } from "vitest";
import { getCollectionFollowupContext } from "./get-collection-followup-context";
import type { CollectionAction } from "@/lib/copilot-collection-types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOW = new Date("2026-05-27T12:00:00Z");
const TODAY_YMD = "2026-05-27";

function makeAction(overrides: Partial<CollectionAction> = {}): CollectionAction {
  return {
    id: "test-id",
    workspaceCompanyId: "ws1",
    companyId: "company-1",
    status: "contacted",
    actionType: "email",
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
    createdAt: `${TODAY_YMD}T10:00:00Z`,
    updatedAt: `${TODAY_YMD}T10:00:00Z`,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("getCollectionFollowupContext — sin gestiones", () => {
  it("array vacío → tone normal, todas las flags en false", () => {
    const ctx = getCollectionFollowupContext([], NOW);
    expect(ctx.hasRecentContact).toBe(false);
    expect(ctx.hasPromiseToPay).toBe(false);
    expect(ctx.hasOverduePromise).toBe(false);
    expect(ctx.hasUpcomingPromise).toBe(false);
    expect(ctx.hasNextFollowupDue).toBe(false);
    expect(ctx.daysSinceLatest).toBeNull();
    expect(ctx.recommendedTone).toBe("normal");
    expect(ctx.latestActionLabel).toBeNull();
  });
});

describe("getCollectionFollowupContext — contacto reciente", () => {
  it("contactado hoy → hasRecentContact, tone monitor", () => {
    const ctx = getCollectionFollowupContext([makeAction()], NOW);
    expect(ctx.hasRecentContact).toBe(true);
    expect(ctx.recommendedTone).toBe("monitor");
    expect(ctx.reason).toContain("hoy");
    expect(ctx.daysSinceLatest).toBe(0);
  });

  it("contactado ayer → hasRecentContact, reason menciona 'ayer'", () => {
    const yesterday = new Date(NOW.getTime() - 86_400_000).toISOString();
    const ctx = getCollectionFollowupContext(
      [makeAction({ createdAt: yesterday })],
      NOW
    );
    expect(ctx.hasRecentContact).toBe(true);
    expect(ctx.reason).toContain("ayer");
    expect(ctx.daysSinceLatest).toBe(1);
  });

  it("contactado hace 10 días → hasRecentContact false, tone normal", () => {
    const old = new Date(NOW.getTime() - 10 * 86_400_000).toISOString();
    const ctx = getCollectionFollowupContext(
      [makeAction({ createdAt: old })],
      NOW
    );
    expect(ctx.hasRecentContact).toBe(false);
    expect(ctx.recommendedTone).toBe("normal");
  });

  it("estado de cuenta enviado hoy (outcome contacted) → contacto reciente", () => {
    const action = makeAction({
      actionType: "email",
      metadata: { ui_outcome: "contacted" },
      notes: "Se envió estado de cuenta del período 01/01/2026 al 27/05/2026 en UYU.",
    });
    const ctx = getCollectionFollowupContext([action], NOW);
    expect(ctx.hasRecentContact).toBe(true);
    expect(ctx.latestActionLabel).toBe("email");
  });
});

describe("getCollectionFollowupContext — promesas", () => {
  it("promesa futura → hasUpcomingPromise, tone monitor", () => {
    const action = makeAction({
      status: "promised_payment",
      metadata: { ui_outcome: "promised_payment" },
      promiseDate: "2026-06-01",
    });
    const ctx = getCollectionFollowupContext([action], NOW);
    expect(ctx.hasPromiseToPay).toBe(true);
    expect(ctx.hasUpcomingPromise).toBe(true);
    expect(ctx.hasOverduePromise).toBe(false);
    expect(ctx.recommendedTone).toBe("monitor");
    expect(ctx.reason).toContain("vigente");
  });

  it("promesa vencida → hasOverduePromise, tone urgent", () => {
    const action = makeAction({
      status: "promised_payment",
      metadata: { ui_outcome: "promised_payment" },
      promiseDate: "2026-05-20",
    });
    const ctx = getCollectionFollowupContext([action], NOW);
    expect(ctx.hasOverduePromise).toBe(true);
    expect(ctx.hasUpcomingPromise).toBe(false);
    expect(ctx.recommendedTone).toBe("urgent");
    expect(ctx.reason).toContain("vencida");
  });
});

describe("getCollectionFollowupContext — seguimientos", () => {
  it("próximo seguimiento vencido → hasNextFollowupDue, tone follow_up", () => {
    const action = makeAction({
      nextActionDate: "2026-05-25", // pasado
    });
    const ctx = getCollectionFollowupContext([action], NOW);
    expect(ctx.hasNextFollowupDue).toBe(true);
    expect(ctx.recommendedTone).toBe("follow_up");
  });

  it("próximo seguimiento futuro → no activa hasNextFollowupDue", () => {
    const action = makeAction({
      nextActionDate: "2026-06-15",
    });
    const ctx = getCollectionFollowupContext([action], NOW);
    expect(ctx.hasNextFollowupDue).toBe(false);
  });
});

describe("getCollectionFollowupContext — sin respuesta y contacto incorrecto", () => {
  it("sin respuesta hace 6 días → tone urgent", () => {
    const sixDaysAgo = new Date(NOW.getTime() - 6 * 86_400_000).toISOString();
    const action = makeAction({
      metadata: { ui_outcome: "no_response" },
      status: "paused",
      createdAt: sixDaysAgo,
    });
    const ctx = getCollectionFollowupContext([action], NOW);
    expect(ctx.recommendedTone).toBe("urgent");
    expect(ctx.reason).toContain("días");
  });

  it("sin respuesta hace 3 días → tone follow_up", () => {
    const threeDaysAgo = new Date(NOW.getTime() - 3 * 86_400_000).toISOString();
    const action = makeAction({
      metadata: { ui_outcome: "no_response" },
      status: "paused",
      createdAt: threeDaysAgo,
    });
    const ctx = getCollectionFollowupContext([action], NOW);
    expect(ctx.recommendedTone).toBe("follow_up");
  });

  it("contacto incorrecto → tone urgent", () => {
    const action = makeAction({
      metadata: { ui_outcome: "wrong_contact" },
      status: "paused",
    });
    const ctx = getCollectionFollowupContext([action], NOW);
    expect(ctx.recommendedTone).toBe("urgent");
    expect(ctx.hasRecentContact).toBe(false);
  });
});

describe("getCollectionFollowupContext — prioridad de reglas", () => {
  it("promesa vencida prevalece sobre followup due", () => {
    const action = makeAction({
      status: "promised_payment",
      metadata: { ui_outcome: "promised_payment" },
      promiseDate: "2026-05-20",
      nextActionDate: "2026-05-26",
    });
    const ctx = getCollectionFollowupContext([action], NOW);
    // La regla de promesa vencida debe tener mayor precedencia
    expect(ctx.recommendedTone).toBe("urgent");
    expect(ctx.hasOverduePromise).toBe(true);
  });

  it("toma la más reciente si hay múltiples gestiones", () => {
    const old = makeAction({
      createdAt: "2026-05-10T10:00:00Z",
      metadata: { ui_outcome: "wrong_contact" },
    });
    const recent = makeAction({
      createdAt: `${TODAY_YMD}T10:00:00Z`,
      metadata: { ui_outcome: "contacted" },
    });
    const ctx = getCollectionFollowupContext([old, recent], NOW);
    expect(ctx.hasRecentContact).toBe(true);
    expect(ctx.recommendedTone).toBe("monitor");
  });
});
