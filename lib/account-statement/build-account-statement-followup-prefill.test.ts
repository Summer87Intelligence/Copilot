import { describe, expect, it } from "vitest";
import { buildAccountStatementFollowupPrefill } from "./build-account-statement-followup-prefill";

const base = {
  periodFrom: "2026-01-01",
  periodTo: "2026-05-26",
  currency: "UYU" as const,
  channel: "email" as const,
};

describe("buildAccountStatementFollowupPrefill", () => {
  it("emailed → channel email", () => {
    const r = buildAccountStatementFollowupPrefill({ ...base, lastAction: "emailed" });
    expect(r.channel).toBe("email");
  });

  it("whatsapped → channel whatsapp", () => {
    const r = buildAccountStatementFollowupPrefill({
      ...base,
      channel: "whatsapp",
      lastAction: "whatsapped",
    });
    expect(r.channel).toBe("whatsapp");
  });

  it("copied → usa canal seleccionado (email)", () => {
    const r = buildAccountStatementFollowupPrefill({ ...base, lastAction: "copied" });
    expect(r.channel).toBe("email");
  });

  it("copied → usa canal seleccionado (whatsapp)", () => {
    const r = buildAccountStatementFollowupPrefill({
      ...base,
      channel: "whatsapp",
      lastAction: "copied",
    });
    expect(r.channel).toBe("whatsapp");
  });

  it("nota incluye período formateado", () => {
    const r = buildAccountStatementFollowupPrefill({ ...base, lastAction: "emailed" });
    expect(r.note).toContain("01/01/2026");
    expect(r.note).toContain("26/05/2026");
  });

  it("nota incluye moneda UYU", () => {
    const r = buildAccountStatementFollowupPrefill({ ...base, lastAction: "emailed" });
    expect(r.note).toContain("UYU");
  });

  it("nota incluye moneda USD", () => {
    const r = buildAccountStatementFollowupPrefill({
      ...base,
      currency: "USD",
      lastAction: "emailed",
    });
    expect(r.note).toContain("USD");
  });

  it("nota no menciona 'pagado'", () => {
    const r = buildAccountStatementFollowupPrefill({ ...base, lastAction: "emailed" });
    expect(r.note.toLowerCase()).not.toContain("pagado");
  });

  it("outcome es 'contacted'", () => {
    const r = buildAccountStatementFollowupPrefill({ ...base, lastAction: "copied" });
    expect(r.outcome).toBe("contacted");
  });

  it("verbo 'preparó' para acción copied", () => {
    const r = buildAccountStatementFollowupPrefill({ ...base, lastAction: "copied" });
    expect(r.note).toContain("preparó");
  });

  it("verbo 'envió' para acción emailed o whatsapped", () => {
    const byEmail = buildAccountStatementFollowupPrefill({ ...base, lastAction: "emailed" });
    const byWa = buildAccountStatementFollowupPrefill({
      ...base,
      channel: "whatsapp",
      lastAction: "whatsapped",
    });
    expect(byEmail.note).toContain("envió");
    expect(byWa.note).toContain("envió");
  });
});
