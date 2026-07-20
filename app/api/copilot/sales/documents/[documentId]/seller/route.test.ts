/**
 * FASE SALES-DOCUMENT-SELLER-CORRECTION-001 — endpoint canónico
 * `PUT /api/copilot/sales/documents/[documentId]/seller`.
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

import { PUT } from "@/app/api/copilot/sales/documents/[documentId]/seller/route";

const DOC_ID = "11111111-1111-1111-1111-111111111111";
const SELLER_ID = "22222222-2222-2222-2222-222222222222";

function fakeRequest(body: unknown) {
  return { json: async () => body } as never;
}

function ctx(documentId: string) {
  return { params: Promise.resolve({ documentId }) };
}

describe("PUT /api/copilot/sales/documents/[documentId]/seller", () => {
  beforeEach(() => {
    requireWrite.mockReset();
    assignDocumentSeller.mockReset();
  });

  it("documentId no-UUID → 422 sin llegar a auth ni al repositorio", async () => {
    const res = await PUT(fakeRequest({ sellerId: SELLER_ID }), ctx("not-a-uuid"));
    expect(res.status).toBe(422);
    expect(requireWrite).not.toHaveBeenCalled();
    expect(assignDocumentSeller).not.toHaveBeenCalled();
  });

  it("body inválido (sellerId no-uuid ni null) → 400", async () => {
    const res = await PUT(fakeRequest({ sellerId: 123 }), ctx(DOC_ID));
    expect(res.status).toBe(400);
    expect(requireWrite).not.toHaveBeenCalled();
  });

  it("usuario read-only → 403 (RBAC bloquea antes del repositorio)", async () => {
    requireWrite.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    const res = await PUT(fakeRequest({ sellerId: SELLER_ID }), ctx(DOC_ID));
    expect(res.status).toBe(403);
    expect(assignDocumentSeller).not.toHaveBeenCalled();
  });

  it("asigna correctamente y responde 200 con el vendedor asignado", async () => {
    requireWrite.mockResolvedValue({
      ok: true,
      ctx: { supabase: {}, tenantCompanyId: "ws-1", appUser: { id: "user-1" } },
    });
    assignDocumentSeller.mockResolvedValue({ ok: true, sellerId: SELLER_ID, changed: true });

    const res = await PUT(fakeRequest({ sellerId: SELLER_ID }), ctx(DOC_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, data: { documentId: DOC_ID, sellerId: SELLER_ID, changed: true } });
    expect(assignDocumentSeller).toHaveBeenCalledWith({}, "ws-1", "user-1", { documentId: DOC_ID, sellerId: SELLER_ID });
  });

  it("desasignar (sellerId=null) también es válido", async () => {
    requireWrite.mockResolvedValue({
      ok: true,
      ctx: { supabase: {}, tenantCompanyId: "ws-1", appUser: { id: "user-1" } },
    });
    assignDocumentSeller.mockResolvedValue({ ok: true, sellerId: null, changed: true });
    const res = await PUT(fakeRequest({ sellerId: null }), ctx(DOC_ID));
    expect(res.status).toBe(200);
  });

  it("documento de otro workspace (repo NOT_FOUND) → 404", async () => {
    requireWrite.mockResolvedValue({
      ok: true,
      ctx: { supabase: {}, tenantCompanyId: "ws-1", appUser: { id: "user-1" } },
    });
    assignDocumentSeller.mockResolvedValue({ ok: false, code: "NOT_FOUND", message: "no encontrado" });
    const res = await PUT(fakeRequest({ sellerId: SELLER_ID }), ctx(DOC_ID));
    expect(res.status).toBe(404);
  });

  it("vendedor inactivo (repo INACTIVE_SELLER) → 422", async () => {
    requireWrite.mockResolvedValue({
      ok: true,
      ctx: { supabase: {}, tenantCompanyId: "ws-1", appUser: { id: "user-1" } },
    });
    assignDocumentSeller.mockResolvedValue({ ok: false, code: "INACTIVE_SELLER", message: "inactivo" });
    const res = await PUT(fakeRequest({ sellerId: SELLER_ID }), ctx(DOC_ID));
    expect(res.status).toBe(422);
  });

  it("nota de crédito (repo CREDIT_NOTE_NOT_ALLOWED) → 422", async () => {
    requireWrite.mockResolvedValue({
      ok: true,
      ctx: { supabase: {}, tenantCompanyId: "ws-1", appUser: { id: "user-1" } },
    });
    assignDocumentSeller.mockResolvedValue({ ok: false, code: "CREDIT_NOTE_NOT_ALLOWED", message: "nc" });
    const res = await PUT(fakeRequest({ sellerId: SELLER_ID }), ctx(DOC_ID));
    expect(res.status).toBe(422);
  });

  it("migración pendiente (repo MIGRATION_PENDING) → 503", async () => {
    requireWrite.mockResolvedValue({
      ok: true,
      ctx: { supabase: {}, tenantCompanyId: "ws-1", appUser: { id: "user-1" } },
    });
    assignDocumentSeller.mockResolvedValue({ ok: false, code: "MIGRATION_PENDING", message: "pendiente" });
    const res = await PUT(fakeRequest({ sellerId: SELLER_ID }), ctx(DOC_ID));
    expect(res.status).toBe(503);
  });
});
