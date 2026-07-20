/**
 * FASE SALES-DOCUMENT-SELLER-CORRECTION-001 — el endpoint per-documento
 * (`/api/copilot/sales/assignments`) fue REACTIVADO: ya no responde 410 Gone.
 * Ahora delega en `assignDocumentSeller` (misma lógica que el endpoint
 * canónico `PUT /api/copilot/sales/documents/[documentId]/seller`). Mantiene
 * el guard RBAC del módulo.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const requireWrite = vi.fn();
const assignDocumentSeller = vi.fn();

vi.mock("@/lib/auth/copilot-module-api-auth", () => ({
  requireCopilotModuleWriteAccess: (...args: unknown[]) => requireWrite(...args),
}));

vi.mock("@/lib/sales/sales-document-seller-repository", () => ({
  assignDocumentSeller: (...args: unknown[]) => assignDocumentSeller(...args),
}));

import { POST } from "@/app/api/copilot/sales/assignments/route";

const DOC_ID = "11111111-1111-1111-1111-111111111111";
const SELLER_ID = "22222222-2222-2222-2222-222222222222";

function fakeRequest(body: unknown) {
  return { json: async () => body } as never;
}

describe("reactivated per-document seller assignment endpoint", () => {
  beforeEach(() => {
    requireWrite.mockReset();
    assignDocumentSeller.mockReset();
  });

  it("con acceso de módulo asigna el vendedor y responde 200", async () => {
    requireWrite.mockResolvedValue({
      ok: true,
      ctx: { supabase: {}, tenantCompanyId: "ws-1", appUser: { id: "user-1" } },
    });
    assignDocumentSeller.mockResolvedValue({ ok: true, sellerId: SELLER_ID, changed: true });

    const res = await POST(fakeRequest({ documentId: DOC_ID, salespersonId: SELLER_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({ documentId: DOC_ID, salespersonId: SELLER_ID, changed: true });
    expect(assignDocumentSeller).toHaveBeenCalledWith({}, "ws-1", "user-1", {
      documentId: DOC_ID,
      sellerId: SELLER_ID,
    });
  });

  it("sin acceso de módulo respeta RBAC (403) sin llamar al repositorio", async () => {
    const forbidden = new Response(null, { status: 403 });
    requireWrite.mockResolvedValue({ ok: false, response: forbidden });
    const res = await POST(fakeRequest({ documentId: DOC_ID, salespersonId: SELLER_ID }));
    expect(res.status).toBe(403);
    expect(assignDocumentSeller).not.toHaveBeenCalled();
  });

  it("nota de crédito → 422 CREDIT_NOTE_NOT_ALLOWED", async () => {
    requireWrite.mockResolvedValue({
      ok: true,
      ctx: { supabase: {}, tenantCompanyId: "ws-1", appUser: { id: "user-1" } },
    });
    assignDocumentSeller.mockResolvedValue({
      ok: false,
      code: "CREDIT_NOTE_NOT_ALLOWED",
      message: "Las notas de crédito no admiten asignación de vendedor.",
    });
    const res = await POST(fakeRequest({ documentId: DOC_ID, salespersonId: SELLER_ID }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("CREDIT_NOTE_NOT_ALLOWED");
  });

  it("body inválido → error de validación antes de llegar al RBAC", async () => {
    const res = await POST(fakeRequest({ documentId: "not-a-uuid", salespersonId: null }));
    expect(res.status).toBe(400);
    expect(requireWrite).not.toHaveBeenCalled();
  });
});
