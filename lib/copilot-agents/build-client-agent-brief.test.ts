import { describe, expect, it } from "vitest";
import { buildClientAgentBrief } from "./build-client-agent-brief";
import type { BuildClientAgentBriefInput } from "./build-client-agent-brief";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOW = new Date("2026-05-25T12:00:00Z");

function base(overrides: Partial<BuildClientAgentBriefInput> = {}): BuildClientAgentBriefInput {
  return {
    clientName: "Empresa Test",
    debtUyu: 0,
    debtUsd: 0,
    overdueUyu: 0,
    overdueUsd: 0,
    invoiceCount: 0,
    receiptCount: 0,
    contactsCount: 0,
    hasEmail: false,
    hasUsableWhatsapp: false,
    lastSyncAt: "2026-05-24T09:00:00Z",
    lastMovement: null,
    lastCollectionAction: null,
    now: NOW,
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("buildClientAgentBrief", () => {
  it("cliente sin deuda → stable", () => {
    const result = buildClientAgentBrief(base());
    expect(result.status).toBe("stable");
    expect(result.summary).toContain("no tiene deuda");
    expect(result.insights.every((i) => i.id !== "overdue-uyu")).toBe(true);
    expect(result.recommendedAction.label).toBe("Ver estado de cuenta");
  });

  it("cliente con deuda sin vencido → attention", () => {
    const result = buildClientAgentBrief(base({ debtUyu: 15000, debtUsd: 0, hasEmail: true }));
    expect(result.status).toBe("attention");
    expect(result.summary).toContain("pendiente");
    expect(result.insights.find((i) => i.id === "debt-current")).toBeDefined();
    expect(result.recommendedAction.label).toBe("Ver estado de cuenta");
  });

  it("cliente con vencido > 50% → critical", () => {
    const result = buildClientAgentBrief(
      base({ debtUyu: 20000, overdueUyu: 15000, hasEmail: true })
    );
    expect(result.status).toBe("critical");
    expect(result.insights.find((i) => i.id === "overdue-uyu")).toBeDefined();
  });

  it("cliente con vencido < 50% → attention", () => {
    const result = buildClientAgentBrief(
      base({ debtUyu: 20000, overdueUyu: 5000, hasEmail: true })
    );
    expect(result.status).toBe("attention");
  });

  it("promesa futura → atenúa de critical a attention", () => {
    const result = buildClientAgentBrief(
      base({
        debtUyu: 20000,
        overdueUyu: 15000,
        hasEmail: true,
        lastCollectionAction: {
          outcome: "promised_payment",
          promiseDate: "2026-06-01", // future
          createdAt: "2026-05-20T10:00:00Z",
        },
      })
    );
    expect(result.status).toBe("attention");
    expect(result.insights.find((i) => i.id === "promise-active")).toBeDefined();
  });

  it("promesa vencida + deuda → critical", () => {
    const result = buildClientAgentBrief(
      base({
        debtUyu: 10000,
        overdueUyu: 3000,
        hasEmail: true,
        lastCollectionAction: {
          outcome: "promised_payment",
          promiseDate: "2026-05-10", // past
          createdAt: "2026-05-05T10:00:00Z",
        },
      })
    );
    expect(result.status).toBe("critical");
    expect(result.insights.find((i) => i.id === "promise-expired")).toBeDefined();
    expect(result.summary).toContain("promesa");
    expect(result.recommendedAction.label).toBe("Ver seguimiento");
  });

  it("deuda + sin contacto → insight contacto faltante + critical", () => {
    const result = buildClientAgentBrief(
      base({
        debtUyu: 10000,
        overdueUyu: 3000,
        hasEmail: false,
        hasUsableWhatsapp: false,
        contactsCount: 0,
      })
    );
    expect(result.status).toBe("critical");
    const contactInsight = result.insights.find((i) => i.id === "contact-missing");
    expect(contactInsight).toBeDefined();
    expect(contactInsight!.severity).toBe("high");
    expect(result.recommendedAction.tab).toBe("contactos");
    expect(result.recommendedAction.label).toBe("Ver contactos");
  });

  it("email disponible → insight contacto disponible con email", () => {
    const result = buildClientAgentBrief(
      base({ debtUyu: 5000, hasEmail: true, hasUsableWhatsapp: false })
    );
    const contactInsight = result.insights.find((i) => i.id === "contact-email");
    expect(contactInsight).toBeDefined();
    expect(contactInsight!.body).toContain("email");
  });

  it("whatsapp válido → insight contacto disponible con WhatsApp", () => {
    const result = buildClientAgentBrief(
      base({ debtUyu: 5000, hasEmail: false, hasUsableWhatsapp: true })
    );
    const contactInsight = result.insights.find((i) => i.id === "contact-wa");
    expect(contactInsight).toBeDefined();
    expect(contactInsight!.body).toContain("WhatsApp");
  });

  it("UYU y USD no se mezclan: insights separados por moneda", () => {
    const result = buildClientAgentBrief(
      base({ debtUyu: 20000, overdueUyu: 15000, debtUsd: 5000, overdueUsd: 3000, hasEmail: true })
    );
    const uyuInsight = result.insights.find((i) => i.id === "overdue-uyu");
    const usdInsight = result.insights.find((i) => i.id === "overdue-usd");
    expect(uyuInsight).toBeDefined();
    expect(usdInsight).toBeDefined();
    // amounts are not summed
    expect(uyuInsight!.body).not.toContain("U$S");
    expect(usdInsight!.body).not.toContain("$ ");
    expect(usdInsight!.body).toContain("U$S");
  });

  it("sin gestiones + deuda → insight sin gestiones", () => {
    const result = buildClientAgentBrief(
      base({ debtUyu: 5000, lastCollectionAction: null, hasEmail: true })
    );
    const noActionsInsight = result.insights.find((i) => i.id === "no-actions");
    expect(noActionsInsight).toBeDefined();
  });

  it("con gestión registrada → insight última gestión con canal", () => {
    const result = buildClientAgentBrief(
      base({
        debtUyu: 5000,
        hasEmail: true,
        lastCollectionAction: {
          channel: "whatsapp",
          createdAt: "2026-05-24T10:00:00Z",
        },
      })
    );
    const lastActionInsight = result.insights.find((i) => i.id === "last-action");
    expect(lastActionInsight).toBeDefined();
    expect(lastActionInsight!.body).toContain("WhatsApp");
  });

  it("promesa vencida tiene summary específico y CTA de ver seguimiento", () => {
    const result = buildClientAgentBrief(
      base({
        debtUyu: 8000,
        overdueUyu: 2000,
        hasEmail: true,
        lastCollectionAction: {
          outcome: "promised_payment",
          promiseDate: "2026-05-01",
          createdAt: "2026-04-28T10:00:00Z",
        },
      })
    );
    expect(result.recommendedAction.scrollToAssistant).toBe(true);
    expect(result.recommendedAction.label).toBe("Ver seguimiento");
  });

  it("sin deuda tiene CTA de ver estado de cuenta", () => {
    const result = buildClientAgentBrief(base());
    expect(result.recommendedAction.tab).toBe("cuenta");
  });

  it("vencido con contacto → CTA de preparar cobranza", () => {
    const result = buildClientAgentBrief(
      base({ debtUyu: 10000, overdueUyu: 3000, hasEmail: true })
    );
    expect(result.recommendedAction.scrollToAssistant).toBe(true);
    expect(result.recommendedAction.label).toBe("Preparar cobranza");
  });

  it("usa último movimiento y último sync en la explicación", () => {
    const result = buildClientAgentBrief(
      base({
        debtUyu: 8000,
        hasEmail: true,
        invoiceCount: 3,
        receiptCount: 1,
        contactsCount: 2,
        lastMovement: {
          kind: "recibo",
          date: "2026-05-24",
        },
        lastSyncAt: "2026-05-23T08:00:00Z",
      })
    );

    expect(result.whyItMatters).toContain("La ficha muestra");
    expect(result.whyItMatters).toContain("Último movimiento");
    expect(result.whyItMatters).toContain("Último sync");
  });

  it("sin deuda y sync viejo → CTA de ver actualización", () => {
    const result = buildClientAgentBrief(
      base({
        debtUyu: 0,
        debtUsd: 0,
        lastSyncAt: "2026-05-10T08:00:00Z",
      })
    );

    expect(result.status).toBe("stable");
    expect(result.recommendedAction.label).toBe("Ver actualización");
    expect(result.recommendedAction.tab).toBe("zeta");
  });
});
