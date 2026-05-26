import { describe, expect, it } from "vitest";
import {
  buildAccountStatementMessage,
  type AccountStatementMessageInput,
} from "./build-account-statement-message";

const base: AccountStatementMessageInput = {
  clientName: "Empresa ABC",
  periodFrom: "2026-01-01",
  periodTo: "2026-01-31",
  currency: "UYU",
  debtAmount: 150000,
  channel: "email",
  tone: "friendly",
};

describe("buildAccountStatementMessage", () => {
  it("email friendly – has subject and contains client name", () => {
    const result = buildAccountStatementMessage(base);
    expect(result.subject).toContain("Empresa ABC");
    expect(result.body).toContain("Empresa ABC");
  });

  it("email friendly – formats UYU amount correctly", () => {
    const result = buildAccountStatementMessage(base);
    expect(result.body).toContain("$ 150.000");
  });

  it("email friendly – formats USD amount correctly", () => {
    const result = buildAccountStatementMessage({ ...base, currency: "USD", debtAmount: 3200 });
    expect(result.body).toContain("U$S 3.200");
  });

  it("email friendly – period formatted as DD/MM/YYYY", () => {
    const result = buildAccountStatementMessage(base);
    expect(result.body).toContain("01/01/2026");
    expect(result.body).toContain("31/01/2026");
  });

  it("email friendly – includes overdue amount when present", () => {
    const result = buildAccountStatementMessage({ ...base, overdueAmount: 50000 });
    expect(result.body).toContain("$ 50.000");
  });

  it("email friendly – no overdue mention when overdueAmount is 0", () => {
    const result = buildAccountStatementMessage({ ...base, overdueAmount: 0 });
    expect(result.body).not.toContain("Vencido");
    expect(result.body).not.toContain("vencido");
  });

  it("email firm – contains firm language", () => {
    const result = buildAccountStatementMessage({ ...base, tone: "firm" });
    expect(result.body).toContain("Estimado");
    expect(result.subject).toBeDefined();
  });

  it("email brief – is shorter than friendly", () => {
    const friendly = buildAccountStatementMessage({ ...base, tone: "friendly" });
    const brief = buildAccountStatementMessage({ ...base, tone: "brief" });
    expect(brief.body.length).toBeLessThan(friendly.body.length);
  });

  it("whatsapp – has no subject", () => {
    const result = buildAccountStatementMessage({ ...base, channel: "whatsapp" });
    expect(result.subject).toBeUndefined();
    expect(result.body).toBeTruthy();
  });

  it("whatsapp friendly – includes overdue warning when present", () => {
    const result = buildAccountStatementMessage({
      ...base,
      channel: "whatsapp",
      tone: "friendly",
      overdueAmount: 20000,
    });
    expect(result.body).toContain("$ 20.000");
  });
});
