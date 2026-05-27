import { describe, expect, it } from "vitest";
import { formatYmd, formatActionDate, formatRelative } from "./collection-date-helpers";

// ─── formatYmd ────────────────────────────────────────────────────────────────

describe("formatYmd", () => {
  it("fecha válida devuelve string legible", () => {
    const r = formatYmd("2026-05-26");
    expect(r).not.toBeNull();
    expect(r).not.toBe("Invalid Date");
    expect(r).toContain("26");
  });

  it("null devuelve null", () => {
    expect(formatYmd(null)).toBeNull();
  });

  it("undefined devuelve null", () => {
    expect(formatYmd(undefined)).toBeNull();
  });

  it("string vacío devuelve null", () => {
    expect(formatYmd("")).toBeNull();
  });

  it("string inválido devuelve null — nunca 'Invalid Date'", () => {
    const r = formatYmd("not-a-date");
    expect(r).toBeNull();
  });

  it("fecha con año 0 devuelve null si es inválida", () => {
    const r = formatYmd("0000-00-00");
    expect(r).toBeNull();
  });
});

// ─── formatActionDate ─────────────────────────────────────────────────────────

describe("formatActionDate", () => {
  it("ISO válido devuelve string legible", () => {
    const r = formatActionDate("2026-05-26T15:00:00Z");
    expect(r).not.toBe("—");
    expect(r).not.toContain("Invalid");
    expect(r).toContain("2026");
  });

  it("string inválido devuelve '—' — nunca 'Invalid Date'", () => {
    expect(formatActionDate("garbage")).toBe("—");
  });

  it("string vacío devuelve '—'", () => {
    expect(formatActionDate("")).toBe("—");
  });
});

// ─── formatRelative ───────────────────────────────────────────────────────────

describe("formatRelative", () => {
  it("ISO válido de hoy devuelve 'hoy'", () => {
    expect(formatRelative(new Date().toISOString())).toBe("hoy");
  });

  it("string inválido devuelve '—' — nunca 'Invalid Date'", () => {
    expect(formatRelative("bad-date")).toBe("—");
  });
});

// ─── Prefill desde estado de cuenta ──────────────────────────────────────────

describe("prefill desde estado de cuenta", () => {
  it("outcome es 'contacted', no 'promised_payment'", async () => {
    const { buildAccountStatementFollowupPrefill } = await import(
      "@/lib/account-statement/build-account-statement-followup-prefill"
    );
    const r = buildAccountStatementFollowupPrefill({
      lastAction: "emailed",
      channel: "email",
      periodFrom: "2026-01-01",
      periodTo: "2026-05-26",
      currency: "UYU",
    });
    expect(r.outcome).toBe("contacted");
    expect(r.outcome).not.toBe("promised_payment");
  });

  it("prefill no incluye promiseDate ni promiseAmount", async () => {
    const { buildAccountStatementFollowupPrefill } = await import(
      "@/lib/account-statement/build-account-statement-followup-prefill"
    );
    const r = buildAccountStatementFollowupPrefill({
      lastAction: "copied",
      channel: "whatsapp",
      periodFrom: "2026-01-01",
      periodTo: "2026-05-26",
      currency: "USD",
    });
    expect((r as Record<string, unknown>).promiseDate).toBeUndefined();
    expect((r as Record<string, unknown>).promiseAmount).toBeUndefined();
  });
});
