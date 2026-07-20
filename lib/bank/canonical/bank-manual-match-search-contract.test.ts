import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FASE BANK-MANUAL-CANONICAL-MATCH-SELECTION-001 — contrato estático de los
 * dos endpoints de búsqueda server-side (clientes/recibos) usados por la
 * selección manual de "otra coincidencia" en el drawer de Ingresos. Ambos
 * son 100% lectura: nunca deben escribir nada, y el workspace siempre se
 * deriva del contexto de sesión (nunca de un query param).
 */

const API_ROOT = join(process.cwd(), "app", "api", "copilot", "bank-reconciliation");
const clientsSearchRoute = readFileSync(join(API_ROOT, "clients-search", "route.ts"), "utf8");
const receiptsSearchRoute = readFileSync(join(API_ROOT, "receipts-search", "route.ts"), "utf8");

describe("GET /api/copilot/bank-reconciliation/clients-search", () => {
  it("exige RBAC (lectura) sobre bank_movements y solo expone GET", () => {
    expect(clientsSearchRoute).toContain('requireCopilotModuleAccess(request, "bank_movements")');
    expect(clientsSearchRoute).toContain("export async function GET");
    expect(clientsSearchRoute).not.toMatch(/export async function (POST|PATCH|DELETE)/);
  });

  it("deriva el workspace del contexto de sesión, nunca de un query param", () => {
    expect(clientsSearchRoute).toContain("auth.ctx.tenantCompanyId");
    expect(clientsSearchRoute).not.toMatch(/params\.get\("workspace/);
  });

  it("nunca escribe: sin insert/update/delete en ninguna tabla", () => {
    expect(clientsSearchRoute).not.toMatch(/\.insert\(/);
    expect(clientsSearchRoute).not.toMatch(/\.update\(/);
    expect(clientsSearchRoute).not.toMatch(/\.delete\(/);
  });

  it("acota el límite de resultados (nunca devuelve el portfolio completo)", () => {
    expect(clientsSearchRoute).toMatch(/Math\.min\(limitRaw, 50\)/);
  });
});

describe("GET /api/copilot/bank-reconciliation/receipts-search", () => {
  it("exige RBAC (lectura) sobre bank_movements y solo expone GET", () => {
    expect(receiptsSearchRoute).toContain('requireCopilotModuleAccess(request, "bank_movements")');
    expect(receiptsSearchRoute).toContain("export async function GET");
    expect(receiptsSearchRoute).not.toMatch(/export async function (POST|PATCH|DELETE)/);
  });

  it("exige clientId y currency explícitos (nunca lista recibos sin acotar por cliente)", () => {
    expect(receiptsSearchRoute).toContain('params.get("clientId")');
    expect(receiptsSearchRoute).toContain('params.get("currency")');
    expect(receiptsSearchRoute).toMatch(/if \(!clientId \|\| !currency\)/);
  });

  it("valida que el cliente pertenezca al workspace antes de listar sus recibos (getShadowClientById)", () => {
    expect(receiptsSearchRoute).toContain("getShadowClientById");
  });

  it("marca recibos ya usados cruzando contra links activos (listReconciledReceiptIds), nunca confía en el cliente", () => {
    expect(receiptsSearchRoute).toContain("listReconciledReceiptIds");
  });

  it("nunca escribe: sin insert/update/delete en ninguna tabla", () => {
    expect(receiptsSearchRoute).not.toMatch(/\.insert\(/);
    expect(receiptsSearchRoute).not.toMatch(/\.update\(/);
    expect(receiptsSearchRoute).not.toMatch(/\.delete\(/);
  });
});
