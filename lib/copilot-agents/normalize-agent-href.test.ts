import { describe, it, expect } from "vitest";
import { normalizeAgentHref } from "./normalize-agent-href";

const FALLBACK = "/copilot/acciones";

describe("normalizeAgentHref", () => {
  // ── Falsy inputs ───────────────────────────────────────────────────────────
  it("undefined → fallback", () => {
    expect(normalizeAgentHref(undefined)).toBe(FALLBACK);
  });

  it("null → fallback", () => {
    expect(normalizeAgentHref(null)).toBe(FALLBACK);
  });

  it('"" → fallback', () => {
    expect(normalizeAgentHref("")).toBe(FALLBACK);
  });

  it('"  " (whitespace only) → fallback', () => {
    expect(normalizeAgentHref("   ")).toBe(FALLBACK);
  });

  // ── Sentinel strings ───────────────────────────────────────────────────────
  it('"#" → fallback', () => {
    expect(normalizeAgentHref("#")).toBe(FALLBACK);
  });

  it('"undefined" (coerced string) → fallback', () => {
    expect(normalizeAgentHref("undefined")).toBe(FALLBACK);
  });

  it('"null" (coerced string) → fallback', () => {
    expect(normalizeAgentHref("null")).toBe(FALLBACK);
  });

  // ── Paths containing /undefined or /null ──────────────────────────────────
  it('"/copilot/clientes/undefined" → fallback', () => {
    expect(normalizeAgentHref("/copilot/clientes/undefined")).toBe(FALLBACK);
  });

  it('"/copilot/clientes/null" → fallback', () => {
    expect(normalizeAgentHref("/copilot/clientes/null")).toBe(FALLBACK);
  });

  it('"/copilot/acciones/undefined" → fallback', () => {
    expect(normalizeAgentHref("/copilot/acciones/undefined")).toBe(FALLBACK);
  });

  // ── Empty-segment client path ──────────────────────────────────────────────
  it('"/copilot/clientes/" (missing companyId) → fallback', () => {
    expect(normalizeAgentHref("/copilot/clientes/")).toBe(FALLBACK);
  });

  // ── Wrong-root paths ───────────────────────────────────────────────────────
  it('"acciones" (relative, no slash) → fallback', () => {
    expect(normalizeAgentHref("acciones")).toBe(FALLBACK);
  });

  it('"/acciones" (wrong root) → fallback', () => {
    expect(normalizeAgentHref("/acciones")).toBe(FALLBACK);
  });

  // ── External URLs ──────────────────────────────────────────────────────────
  it('"https://example.com" → fallback', () => {
    expect(normalizeAgentHref("https://example.com")).toBe(FALLBACK);
  });

  it('"http://example.com" → fallback', () => {
    expect(normalizeAgentHref("http://example.com")).toBe(FALLBACK);
  });

  // ── API routes ─────────────────────────────────────────────────────────────
  it('"/api/copilot/test" → fallback', () => {
    expect(normalizeAgentHref("/api/copilot/test")).toBe(FALLBACK);
  });

  it('"/api/copilot/financial-snapshot" → fallback', () => {
    expect(normalizeAgentHref("/api/copilot/financial-snapshot")).toBe(FALLBACK);
  });

  // ── Auth routes ────────────────────────────────────────────────────────────
  it('"/login" → fallback', () => {
    expect(normalizeAgentHref("/login")).toBe(FALLBACK);
  });

  it('"/logout" → fallback', () => {
    expect(normalizeAgentHref("/logout")).toBe(FALLBACK);
  });

  // ── Valid /copilot/* paths — must pass through unchanged ──────────────────
  it('"/copilot/acciones" → same', () => {
    expect(normalizeAgentHref("/copilot/acciones")).toBe("/copilot/acciones");
  });

  it('"/copilot/tesoreria?section=pagos" → same', () => {
    expect(normalizeAgentHref("/copilot/tesoreria?section=pagos")).toBe(
      "/copilot/tesoreria?section=pagos"
    );
  });

  it('"/copilot/tesoreria" → same', () => {
    expect(normalizeAgentHref("/copilot/tesoreria")).toBe("/copilot/tesoreria");
  });

  it('"/copilot/cartera" → same', () => {
    expect(normalizeAgentHref("/copilot/cartera")).toBe("/copilot/cartera");
  });

  it('"/copilot/clientes" → same', () => {
    expect(normalizeAgentHref("/copilot/clientes")).toBe("/copilot/clientes");
  });

  it('"/copilot/clientes/abc123" (valid companyId) → same', () => {
    expect(normalizeAgentHref("/copilot/clientes/abc123")).toBe(
      "/copilot/clientes/abc123"
    );
  });

  it('"/copilot/clientes/040321ff-aaaa-bbbb-cccc-123456789012" (uuid) → same', () => {
    const href = "/copilot/clientes/040321ff-aaaa-bbbb-cccc-123456789012";
    expect(normalizeAgentHref(href)).toBe(href);
  });

  it('"/copilot/operacional" → same', () => {
    expect(normalizeAgentHref("/copilot/operacional")).toBe("/copilot/operacional");
  });

  it('"/copilot/finanzas" → same', () => {
    expect(normalizeAgentHref("/copilot/finanzas")).toBe("/copilot/finanzas");
  });

  it('"/copilot/alertas" → same', () => {
    expect(normalizeAgentHref("/copilot/alertas")).toBe("/copilot/alertas");
  });

  it('"/copilot/hoy" → same', () => {
    expect(normalizeAgentHref("/copilot/hoy")).toBe("/copilot/hoy");
  });

  // ── Trim: valid path with leading/trailing whitespace ─────────────────────
  it('"  /copilot/acciones  " (padded) → trimmed valid path', () => {
    expect(normalizeAgentHref("  /copilot/acciones  ")).toBe("/copilot/acciones");
  });
});
