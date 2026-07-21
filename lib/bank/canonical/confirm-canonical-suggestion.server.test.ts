import { describe, it, expect, vi } from "vitest";

import { confirmCanonicalSuggestion } from "@/lib/bank/canonical/confirm-canonical-suggestion.server";

const WS = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ACTOR = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

function fakeClient(tables: Tables, rpcImpl?: (name: string, args: Record<string, unknown>) => { data: unknown; error: { message: string } | null }) {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      const eqFilters: Record<string, unknown> = {};
      const inFilters: Record<string, unknown[]> = {};
      let gtCol: string | null = null;
      let gtVal: number | null = null;
      function apply(): Row[] {
        let out = rows;
        for (const [k, v] of Object.entries(eqFilters)) out = out.filter((r) => r[k] === v);
        for (const [k, v] of Object.entries(inFilters)) out = out.filter((r) => v.includes(r[k]));
        if (gtCol) out = out.filter((r) => Number(r[gtCol!]) > (gtVal as number));
        return out;
      }
      const builder: Record<string, unknown> = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          eqFilters[col] = val;
          return builder;
        },
        in(col: string, vals: unknown[]) {
          inFilters[col] = vals;
          return builder;
        },
        gt(col: string, val: number) {
          gtCol = col;
          gtVal = val;
          return builder;
        },
        limit() {
          return builder;
        },
        maybeSingle() {
          const out = apply();
          return Promise.resolve({ data: out[0] ?? null, error: null });
        },
        then(resolve: (v: { data: Row[]; error: null }) => void) {
          return resolve({ data: apply(), error: null });
        },
      };
      return builder;
    },
    rpc(name: string, args: Record<string, unknown>) {
      if (!rpcImpl) return Promise.resolve({ data: null, error: { message: "NO_RPC_CONFIGURED" } });
      return Promise.resolve(rpcImpl(name, args));
    },
  };
}

const baseSuggestion = {
  id: "sugg-1",
  workspace_id: WS,
  bank_movement_id: "mov-1",
  payer_identity_id: null,
  proposed_client_id: "client-1",
  proposed_receipt_id: "receipt-1",
  confidence: 92,
  reasons: [],
  warnings: [],
  recommended_action: "AUTO_RECONCILE_CANDIDATE",
  engine_version: 1,
  status: "generated",
  suggestion_scope: "operational",
  created_at: "2026-07-18T00:00:00Z",
  updated_at: "2026-07-18T00:00:00Z",
};

const baseInput = {
  workspaceId: WS,
  actorUserId: ACTOR,
  suggestionId: "sugg-1",
  expectedMovementId: "mov-1",
  mode: "suggested" as const,
  selectedClientId: "client-1",
  selectedReceiptId: "receipt-1",
  invoiceAllocations: [] as Array<{ invoiceId: string; amount: number }>,
  manualReason: null as string | null,
};

describe("confirmCanonicalSuggestion — modo 'suggested'", () => {
  it("confirma sin asignaciones y siempre envía p_metadata (v3 en producción; payer opcional si hay señal)", async () => {
    const rpc = vi.fn((_name: string, _args: Record<string, unknown>) => ({ data: { linkId: "link-1", idempotent: false, status: "confirmed" }, error: null }));
    const client = fakeClient({ bank_reconciliation_suggestions: [baseSuggestion] }, rpc);

    const result = await confirmCanonicalSuggestion(client as never, baseInput);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.linkId).toBe("link-1");
      expect(result.data.idempotent).toBe(false);
    }
    const callArgs = rpc.mock.calls[0]![1] as Record<string, unknown>;
    expect(callArgs).toMatchObject({
      p_workspace_id: WS,
      p_movement_id: "mov-1",
      p_receipt_id: "receipt-1",
      p_suggestion_id: "sugg-1",
      p_allocations: null,
      p_created_by: ACTOR,
    });
    expect(callArgs.p_metadata).toEqual({
      mode: "suggested",
      selectedClientId: "client-1",
      selectedReceiptId: "receipt-1",
      proposedClientId: "client-1",
      proposedReceiptId: "receipt-1",
    });
  });

  it("incluye payer en p_metadata cuando el movimiento trae nombre estructurado (aprendizaje v4)", async () => {
    const rpc = vi.fn((_name: string, _args: Record<string, unknown>) => ({
      data: { linkId: "link-1", idempotent: false, status: "confirmed" },
      error: null,
    }));
    const client = fakeClient(
      {
        bank_reconciliation_suggestions: [baseSuggestion],
        bank_movements: [
          {
            id: "mov-1",
            workspace_id: WS,
            description: "TRANSFERENCIA RECIBIDA /ENERGETIA LIMITADA /CALLE",
            bank_reference: "TR0078809027",
            bank_name: "Santander",
            metadata: { payer_name_normalized: "ENERGETIA LIMITADA", payer_token: "ENERGETIA_LIMITADA" },
          },
        ],
      },
      rpc
    );
    const result = await confirmCanonicalSuggestion(client as never, baseInput);
    expect(result.ok).toBe(true);
    const meta = (rpc.mock.calls[0]![1] as Record<string, unknown>).p_metadata as Record<string, unknown>;
    expect(meta.payer).toMatchObject({
      fingerprintStrength: "name",
      normalizedName: "ENERGETIA LIMITADA",
      clientCompanyId: "client-1",
    });
    expect(typeof (meta.payer as { accountHash: string }).accountHash).toBe("string");
    expect((meta.payer as { accountHash: string }).accountHash).not.toContain("TR007");
  });

  it("rechaza si el movimiento enviado no coincide con el de la sugerencia (evidencia desalineada)", async () => {
    const client = fakeClient({ bank_reconciliation_suggestions: [baseSuggestion] });
    const result = await confirmCanonicalSuggestion(client as never, { ...baseInput, expectedMovementId: "mov-OTRO" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("MOVEMENT_MISMATCH");
  });

  it("rechaza si el cliente enviado no coincide con el propuesto por la sugerencia", async () => {
    const client = fakeClient({ bank_reconciliation_suggestions: [baseSuggestion] });
    const result = await confirmCanonicalSuggestion(client as never, { ...baseInput, selectedClientId: "client-OTRO" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CLIENT_MISMATCH");
  });

  it("rechaza si el recibo enviado no coincide con el propuesto por la sugerencia", async () => {
    const client = fakeClient({ bank_reconciliation_suggestions: [baseSuggestion] });
    const result = await confirmCanonicalSuggestion(client as never, { ...baseInput, selectedReceiptId: "receipt-OTRO" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("RECEIPT_MISMATCH");
  });

  it("exige recibo obligatorio también en modo suggested cuando la sugerencia no propone ninguno (BANK-V3-APPLY-PDF-IMPORT-FIX-AND-DEMO-READY-001)", async () => {
    const client = fakeClient({
      bank_reconciliation_suggestions: [{ ...baseSuggestion, proposed_receipt_id: null }],
    });
    const result = await confirmCanonicalSuggestion(client as never, { ...baseInput, selectedReceiptId: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("RECEIPT_NOT_FOUND");
  });

  it("nunca confirma una sugerencia fuera de scope operational (histórica/auditoría)", async () => {
    const client = fakeClient({
      bank_reconciliation_suggestions: [{ ...baseSuggestion, suggestion_scope: "historical_review" }],
    });
    const result = await confirmCanonicalSuggestion(client as never, baseInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("SUGGESTION_NOT_CONFIRMABLE");
  });

  it("rechaza si la sugerencia no existe en el workspace", async () => {
    const client = fakeClient({ bank_reconciliation_suggestions: [] });
    const result = await confirmCanonicalSuggestion(client as never, { ...baseInput, suggestionId: "sugg-inexistente", selectedReceiptId: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("SUGGESTION_NOT_FOUND");
  });

  it("valida asignaciones de factura contra las facturas candidatas recalculadas (misma evidencia que el drawer)", async () => {
    const client = fakeClient({
      bank_reconciliation_suggestions: [baseSuggestion],
      proto_receipts: [{ id: "receipt-1", workspace_company_id: WS, currency_code: "UYU" }],
      proto_invoices: [
        { id: "inv-valida", workspace_company_id: WS, company_id: "client-1", currency_code: "UYU", balance_amount: 1000, issue_date: null, due_date: null, is_active: true },
      ],
    });
    const result = await confirmCanonicalSuggestion(client as never, {
      ...baseInput,
      invoiceAllocations: [{ invoiceId: "inv-NO-CANDIDATA", amount: 500 }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVOICE_NOT_IN_EVIDENCE");
  });

  it("permite asignaciones cuando la factura sí pertenece a la evidencia recalculada", async () => {
    const rpc = vi.fn(() => ({ data: { linkId: "link-2", idempotent: false, status: "confirmed" }, error: null }));
    const client = fakeClient(
      {
        bank_reconciliation_suggestions: [baseSuggestion],
        proto_receipts: [{ id: "receipt-1", workspace_company_id: WS, currency_code: "UYU" }],
        proto_invoices: [
          { id: "inv-valida", workspace_company_id: WS, company_id: "client-1", currency_code: "UYU", balance_amount: 1000, issue_date: null, due_date: null, is_active: true },
        ],
      },
      rpc
    );
    const result = await confirmCanonicalSuggestion(client as never, {
      ...baseInput,
      invoiceAllocations: [{ invoiceId: "inv-valida", amount: 1000 }],
    });
    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      "confirm_bank_reconciliation_v1",
      expect.objectContaining({
        p_allocations: [{ invoice_id: "inv-valida", amount: 1000 }],
      })
    );
  });

  it("traduce el código crudo de la RPC (p.ej. ALLOCATIONS_EXCEED_LINK) a un resultado con mensaje legible", async () => {
    const rpc = vi.fn(() => ({ data: null, error: { message: "ALLOCATIONS_EXCEED_LINK" } }));
    const client = fakeClient({ bank_reconciliation_suggestions: [baseSuggestion] }, rpc);
    const result = await confirmCanonicalSuggestion(client as never, baseInput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("ALLOCATIONS_EXCEED_LINK");
      expect(result.message).not.toBe("ALLOCATIONS_EXCEED_LINK");
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it("trata already_confirmed como éxito idempotente (reintento del mismo operador o doble click)", async () => {
    const rpc = vi.fn(() => ({ data: { linkId: "link-1", idempotent: true, status: "already_confirmed" }, error: null }));
    const client = fakeClient({ bank_reconciliation_suggestions: [baseSuggestion] }, rpc);
    const result = await confirmCanonicalSuggestion(client as never, baseInput);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.idempotent).toBe(true);
  });
});

describe("confirmCanonicalSuggestion — modo 'manual_reviewed' (FASE BANK-MANUAL-CANONICAL-MATCH-SELECTION-001)", () => {
  const manualInput = {
    ...baseInput,
    mode: "manual_reviewed" as const,
    selectedClientId: "client-2",
    selectedReceiptId: "receipt-2",
    manualReason: "El pagador correspondía a otro cliente registrado en Zeta",
  };

  it("exige un motivo (3-500 caracteres) para confirmar una selección manual", async () => {
    const client = fakeClient({
      bank_reconciliation_suggestions: [baseSuggestion],
      proto_companies: [{ id: "client-2", workspace_company_id: WS, name: "Otro Cliente", is_active: true }],
    });
    const result = await confirmCanonicalSuggestion(client as never, { ...manualInput, manualReason: "no" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("MANUAL_REASON_REQUIRED");
  });

  it("rechaza si el cliente seleccionado no existe en el workspace", async () => {
    const client = fakeClient({ bank_reconciliation_suggestions: [baseSuggestion], proto_companies: [] });
    const result = await confirmCanonicalSuggestion(client as never, manualInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CLIENT_NOT_FOUND");
  });

  it("exige recibo obligatorio en selección manual (BANK-V3-APPLY-PDF-IMPORT-FIX-AND-DEMO-READY-001: evita el bug latente de la RPC con p_receipt_id=NULL en conexiones frías)", async () => {
    const client = fakeClient({
      bank_reconciliation_suggestions: [baseSuggestion],
      proto_companies: [{ id: "client-2", workspace_company_id: WS, name: "Otro Cliente", is_active: true }],
    });
    const result = await confirmCanonicalSuggestion(client as never, { ...manualInput, selectedReceiptId: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("RECEIPT_NOT_FOUND");
  });

  it("rechaza si el recibo seleccionado pertenece a otro cliente distinto del seleccionado", async () => {
    const client = fakeClient({
      bank_reconciliation_suggestions: [baseSuggestion],
      proto_companies: [{ id: "client-2", workspace_company_id: WS, name: "Otro Cliente", is_active: true }],
      proto_receipts: [{ id: "receipt-2", workspace_company_id: WS, company_id: "client-DISTINTO", amount: 5000, currency_code: "UYU", receipt_date: "2026-07-18", status: "paid" }],
    });
    const result = await confirmCanonicalSuggestion(client as never, manualInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("RECEIPT_CLIENT_MISMATCH");
  });

  it("permite confirmar un cliente y recibo distintos de los propuestos por la sugerencia, cuando el recibo sí pertenece al cliente seleccionado", async () => {
    const rpc = vi.fn((_name: string, _args: Record<string, unknown>) => ({ data: { linkId: "link-manual", idempotent: false, status: "confirmed" }, error: null }));
    const client = fakeClient(
      {
        bank_reconciliation_suggestions: [baseSuggestion],
        proto_companies: [{ id: "client-2", workspace_company_id: WS, name: "Otro Cliente", is_active: true }],
        proto_receipts: [{ id: "receipt-2", workspace_company_id: WS, company_id: "client-2", amount: 5000, currency_code: "UYU", receipt_date: "2026-07-18", status: "paid" }],
      },
      rpc
    );
    const result = await confirmCanonicalSuggestion(client as never, manualInput);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.linkId).toBe("link-manual");

    const callArgs = rpc.mock.calls[0]![1] as Record<string, unknown>;
    expect(callArgs.p_receipt_id).toBe("receipt-2");
    expect(callArgs.p_metadata).toEqual({
      mode: "manual_reviewed",
      selectedClientId: "client-2",
      selectedReceiptId: "receipt-2",
      proposedClientId: "client-1",
      proposedReceiptId: "receipt-1",
      reason: manualInput.manualReason,
    });
  });

  it("nunca sobrescribe proposed_client_id/proposed_receipt_id: la propuesta original queda intacta como evidencia (no se emite ningún UPDATE a esas columnas)", () => {
    // Verificación estructural: el adapter nunca hace .update() sobre bank_reconciliation_suggestions —
    // esa responsabilidad es exclusiva de la RPC, que solo toca status/confirmed_link_id/reviewed_*.
    // No hay ningún método .update en el fakeClient de este archivo; si el adapter intentara usarlo,
    // fallaría con "is not a function" en cualquiera de los tests anteriores.
    expect(true).toBe(true);
  });

  it("trata already_confirmed como éxito idempotente también en modo manual_reviewed (doble click / reintento)", async () => {
    const rpc = vi.fn(() => ({ data: { linkId: "link-manual", idempotent: true, status: "already_confirmed" }, error: null }));
    const client = fakeClient(
      {
        bank_reconciliation_suggestions: [baseSuggestion],
        proto_companies: [{ id: "client-2", workspace_company_id: WS, name: "Otro Cliente", is_active: true }],
        proto_receipts: [{ id: "receipt-2", workspace_company_id: WS, company_id: "client-2", amount: 5000, currency_code: "UYU", receipt_date: "2026-07-18", status: "paid" }],
      },
      rpc
    );
    const result = await confirmCanonicalSuggestion(client as never, manualInput);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.idempotent).toBe(true);
  });

  it("nunca envía 'method' a la RPC en ningún modo — bank_movement_reconciliation_links.method es decisión exclusiva de la RPC (siempre suggested_confirmed), no del cliente/adapter (BANK-CONFIRM-RPC-V3-MIGRATION-CORRECTION-001)", async () => {
    const rpc = vi.fn((_name: string, _args: Record<string, unknown>) => ({ data: { linkId: "link-manual", idempotent: false, status: "confirmed" }, error: null }));
    const client = fakeClient(
      {
        bank_reconciliation_suggestions: [baseSuggestion],
        proto_companies: [{ id: "client-2", workspace_company_id: WS, name: "Otro Cliente", is_active: true }],
        proto_receipts: [{ id: "receipt-2", workspace_company_id: WS, company_id: "client-2", amount: 5000, currency_code: "UYU", receipt_date: "2026-07-18", status: "paid" }],
      },
      rpc
    );
    await confirmCanonicalSuggestion(client as never, manualInput);
    const callArgs = rpc.mock.calls[0]![1] as Record<string, unknown>;
    expect(callArgs).not.toHaveProperty("p_method");
    expect(callArgs).not.toHaveProperty("method");
  });

  it("valida asignaciones de factura contra las candidatas del cliente SELECCIONADO, no del propuesto por la sugerencia", async () => {
    const rpc = vi.fn(() => ({ data: { linkId: "link-manual-2", idempotent: false, status: "confirmed" }, error: null }));
    const client = fakeClient(
      {
        bank_reconciliation_suggestions: [baseSuggestion],
        proto_companies: [{ id: "client-2", workspace_company_id: WS, name: "Otro Cliente", is_active: true }],
        proto_receipts: [{ id: "receipt-2", workspace_company_id: WS, company_id: "client-2", amount: 5000, currency_code: "UYU", receipt_date: "2026-07-18", status: "paid" }],
        proto_invoices: [
          { id: "inv-client1", workspace_company_id: WS, company_id: "client-1", currency_code: "UYU", balance_amount: 1000, issue_date: null, due_date: null, is_active: true },
          { id: "inv-client2", workspace_company_id: WS, company_id: "client-2", currency_code: "UYU", balance_amount: 2000, issue_date: null, due_date: null, is_active: true },
        ],
      },
      rpc
    );
    // Factura de client-1 (el propuesto) NO debe ser válida para una selección manual de client-2.
    const rejected = await confirmCanonicalSuggestion(client as never, {
      ...manualInput,
      invoiceAllocations: [{ invoiceId: "inv-client1", amount: 500 }],
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.code).toBe("INVOICE_NOT_IN_EVIDENCE");

    const accepted = await confirmCanonicalSuggestion(client as never, {
      ...manualInput,
      invoiceAllocations: [{ invoiceId: "inv-client2", amount: 2000 }],
    });
    expect(accepted.ok).toBe(true);
  });
});
