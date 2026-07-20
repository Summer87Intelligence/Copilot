import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FASE BANK-CANONICAL-CONFIRM-UI-001 — contrato estático (mismo patrón que
 * `bank-canonical-routing-contract.test.ts`) sobre los dos endpoints nuevos
 * de confirmación/rechazo. Garantiza: workspace/actor se derivan del contexto
 * de sesión server-side (nunca del body), RBAC de escritura obligatorio, y la
 * ÚNICA escritura permitida es a través de los adapters que llaman
 * `confirm_bank_reconciliation_v1` / `reject_bank_suggestion_v1`.
 */

const API_ROOT = join(process.cwd(), "app", "api", "copilot", "bank-reconciliation", "[suggestionId]");
const LIB_ROOT = join(process.cwd(), "lib", "bank", "canonical");

const confirmRoute = readFileSync(join(API_ROOT, "confirm", "route.ts"), "utf8");
const rejectRoute = readFileSync(join(API_ROOT, "reject", "route.ts"), "utf8");
const confirmAdapter = readFileSync(join(LIB_ROOT, "confirm-canonical-suggestion.server.ts"), "utf8");
const rejectAdapter = readFileSync(join(LIB_ROOT, "reject-canonical-suggestion.server.ts"), "utf8");
const apiSchema = readFileSync(join(LIB_ROOT, "canonical-confirm-reject-api.ts"), "utf8");

describe("POST /api/copilot/bank-reconciliation/[suggestionId]/confirm", () => {
  it("exige RBAC de escritura sobre bank_movements", () => {
    expect(confirmRoute).toContain('requireCopilotModuleWriteAccess(request, "bank_movements"');
  });

  it("deriva workspace y actor del contexto de sesión, nunca del body", () => {
    expect(confirmRoute).toContain("auth.ctx.tenantCompanyId");
    expect(confirmRoute).toContain("auth.ctx.appUser.id");
    expect(confirmRoute).not.toMatch(/parsed\.data\.workspaceId/);
    expect(confirmRoute).not.toMatch(/parsed\.data\.actorUserId/);
  });

  it("valida el body con Zod antes de tocar el adapter", () => {
    expect(confirmRoute).toContain("parseAndValidateJsonBody");
    expect(confirmRoute).toContain("confirmCanonicalSuggestionBodySchema");
  });

  it("delega la escritura exclusivamente en confirmCanonicalSuggestion (nunca .rpc/.insert/.update directo en la ruta)", () => {
    expect(confirmRoute).toContain("confirmCanonicalSuggestion(");
    expect(confirmRoute).not.toMatch(/\.rpc\(/);
    expect(confirmRoute).not.toMatch(/\.insert\(/);
    expect(confirmRoute).not.toMatch(/\.update\(/);
  });

  it("nunca muestra el código crudo de error sin un mensaje legible acompañándolo", () => {
    expect(confirmRoute).toContain("result.message");
  });
});

describe("POST /api/copilot/bank-reconciliation/[suggestionId]/reject", () => {
  it("exige RBAC de escritura sobre bank_movements", () => {
    expect(rejectRoute).toContain('requireCopilotModuleWriteAccess(request, "bank_movements"');
  });

  it("deriva workspace y actor del contexto de sesión, nunca del body", () => {
    expect(rejectRoute).toContain("auth.ctx.tenantCompanyId");
    expect(rejectRoute).toContain("auth.ctx.appUser.id");
    expect(rejectRoute).not.toMatch(/parsed\.data\.workspaceId/);
    expect(rejectRoute).not.toMatch(/parsed\.data\.actorUserId/);
  });

  it("delega la escritura exclusivamente en rejectCanonicalSuggestion", () => {
    expect(rejectRoute).toContain("rejectCanonicalSuggestion(");
    expect(rejectRoute).not.toMatch(/\.rpc\(/);
    expect(rejectRoute).not.toMatch(/\.insert\(/);
    expect(rejectRoute).not.toMatch(/\.update\(/);
  });
});

describe("Adapters: única RPC permitida por acción, sin escrituras directas a tablas financieras", () => {
  it("confirmCanonicalSuggestion solo invoca confirm_bank_reconciliation_v1", () => {
    const rpcCalls = [...confirmAdapter.matchAll(/supabase\.rpc\("([a-z_0-9]+)"/g)].map((m) => m[1]);
    expect(rpcCalls).toEqual(["confirm_bank_reconciliation_v1"]);
    expect(confirmAdapter).not.toMatch(/\.insert\(/);
    expect(confirmAdapter).not.toMatch(/\.update\(/);
    expect(confirmAdapter).not.toMatch(/\.delete\(/);
  });

  it("rejectCanonicalSuggestion solo invoca reject_bank_suggestion_v1, y nunca toca bank_movements", () => {
    const rpcCalls = [...rejectAdapter.matchAll(/supabase\.rpc\("([a-z_0-9]+)"/g)].map((m) => m[1]);
    expect(rpcCalls).toEqual(["reject_bank_suggestion_v1"]);
    expect(rejectAdapter).not.toContain('.from("bank_movements")');
    expect(rejectAdapter).not.toMatch(/\.insert\(/);
    expect(rejectAdapter).not.toMatch(/\.update\(/);
    expect(rejectAdapter).not.toMatch(/\.delete\(/);
  });

  it("confirmCanonicalSuggestion revalida scope='operational' antes de confirmar (defensa en profundidad)", () => {
    expect(confirmAdapter).toContain('suggestion.suggestionScope !== "operational"');
  });

  it("rejectCanonicalSuggestion revalida scope='operational' antes de rechazar, aunque la RPC acepte historical_review", () => {
    expect(rejectAdapter).toContain('suggestion.suggestionScope !== "operational"');
  });
});

describe("Contrato Zod: el cliente nunca puede enviar workspace/actor/scope", () => {
  it("los schemas de confirm/reject no incluyen workspaceId, actorUserId ni suggestionScope", () => {
    expect(apiSchema).not.toMatch(/workspaceId/);
    expect(apiSchema).not.toMatch(/actorUserId/);
    expect(apiSchema).not.toMatch(/suggestionScope/);
  });
});
