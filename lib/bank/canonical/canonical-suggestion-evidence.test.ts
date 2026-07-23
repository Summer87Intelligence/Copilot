import { describe, it, expect } from "vitest";

import { listCanonicalOperationalEvidence } from "@/lib/bank/canonical/canonical-suggestion-evidence";

const WS = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

/**
 * Fake Supabase multi-tabla: filtra realmente por eq()/in()/gte()/lte()/gt(),
 * soporta maybeSingle() (single-row) y el resto como lista vía then(). Igual
 * patrón que `repositories-scope.test.ts`, extendido a varias tablas.
 */
function fakeClient(tables: Tables) {
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
        not() {
          // Los tests no ejercitan el filtro de exclusión de status; se ignora.
          return builder;
        },
        gt(col: string, val: number) {
          gtCol = col;
          gtVal = val;
          return builder;
        },
        gte() {
          return builder;
        },
        lte() {
          return builder;
        },
        order() {
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
  };
}

describe("listCanonicalOperationalEvidence — evidencia completa desde el motor D, 100% lectura", () => {
  it("arma movimiento + cliente + recibo + facturas candidatas + confianza humana + razones en español", async () => {
    const client = fakeClient({
      bank_reconciliation_suggestions: [
        {
          id: "sugg-1",
          workspace_id: WS,
          bank_movement_id: "mov-1",
          payer_identity_id: "payer-1",
          proposed_client_id: "client-1",
          proposed_receipt_id: "receipt-1",
          confidence: 92,
          reasons: ["EXACT_AMOUNT", "DATE_PROXIMITY"],
          warnings: [],
          recommended_action: "AUTO_RECONCILE_CANDIDATE",
          engine_version: 1,
          status: "generated",
          suggestion_scope: "operational",
          created_at: "2026-07-18T00:00:00Z",
          updated_at: "2026-07-18T00:00:00Z",
        },
      ],
      bank_movements: [
        {
          id: "mov-1",
          workspace_id: WS,
          bank_name: "Santander",
          account_label: "Cta UYU",
          movement_date: "2026-07-18",
          description: "TRANSFERENCIA PEPITO SA",
          raw_description: "TRANSFERENCIA PEPITO SA",
          amount: 20000,
          currency: "UYU",
          direction: "inflow",
          bank_reference: null,
          status: "pending",
          metadata: {},
        },
      ],
      proto_companies: [{ id: "client-1", workspace_company_id: WS, name: "Pepito S.A.", is_active: true }],
      proto_receipts: [
        {
          id: "receipt-1",
          workspace_company_id: WS,
          company_id: "client-1",
          amount: 20000,
          currency_code: "UYU",
          receipt_date: "2026-07-18",
          status: "issued",
        },
      ],
      proto_invoices: [
        {
          id: "inv-1",
          workspace_company_id: WS,
          company_id: "client-1",
          currency_code: "UYU",
          balance_amount: 20000,
          issue_date: "2026-07-01",
          due_date: "2026-07-31",
          is_active: true,
        },
      ],
      bank_payer_identities: [
        {
          id: "payer-1",
          workspace_id: WS,
          account_hash: "hash-abc",
          masked_account: "•••• 4821",
          normalized_name: "pepito sa",
          fingerprint_strength: "account",
          status: "active",
        },
      ],
      client_payer_links: [
        {
          id: "link-1",
          workspace_id: WS,
          payer_identity_id: "payer-1",
          client_company_id: "client-1",
          confidence: 90,
          status: "confirmed",
          reconciled_count: 4,
        },
      ],
    });

    const result = await listCanonicalOperationalEvidence(client as never, WS);

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    const ev = result.items[0]!;

    expect(ev.confidenceLevel).toBe("alta");
    expect(ev.confidenceLabel).toBe("Alta");
    expect(ev.movement.amount).toBe(20000);
    expect(ev.movement.currency).toBe("UYU");
    expect(ev.movement.descriptionMasked).toContain("TRANSFERENCIA");
    expect(ev.movement.descriptionMasked).toContain("PEPITO");
    // No usa el truncado agresivo tipo "TRAN••••SA"
    expect(ev.movement.descriptionMasked).not.toMatch(/^TRAN•+SA$/);
    expect(ev.client?.name).toBe("Pepito S.A.");
    expect(ev.receipt?.amount).toBe(20000);
    expect(ev.candidateInvoices).toHaveLength(1);
    expect(ev.candidateInvoices[0]!.balanceAmount).toBe(20000);
    expect(ev.reasons).toEqual(["mismo importe", "fecha cercana"]);
    expect(ev.payer?.knownClientLinks).toEqual([{ clientId: "client-1", confirmations: 4, status: "confirmed" }]);
    expect(ev.payer?.hasConflict).toBe(false);
  });

  it("BANK-RECEIPT-SEARCH-PAGE-CRASH-001: borrador manual (movimiento identificado sin sugerencia canónica) arma evidencia con reasons en español, nunca objetos", async () => {
    const client = fakeClient({
      bank_reconciliation_suggestions: [
        {
          id: "sugg-manual-1",
          workspace_id: WS,
          bank_movement_id: "mov-nirmex",
          payer_identity_id: null,
          proposed_client_id: null,
          proposed_receipt_id: null,
          confidence: 0,
          reasons: ["MANUAL_DRAFT"],
          warnings: [],
          recommended_action: "REVIEW",
          engine_version: 9001,
          status: "generated",
          suggestion_scope: "operational",
          created_at: "2026-07-22T12:19:33Z",
          updated_at: "2026-07-22T12:19:33Z",
        },
      ],
      bank_movements: [
        {
          id: "mov-nirmex",
          workspace_id: WS,
          bank_name: "Santander",
          account_label: "Cta UYU",
          movement_date: "2026-07-10",
          description: "TRANSFERENCIA RECIBIDA NIRMEX S A",
          raw_description: "TRANSFERENCIA RECIBIDA NIRMEX S A",
          amount: 7358,
          currency: "UYU",
          direction: "inflow",
          bank_reference: null,
          status: "pending",
          metadata: {},
        },
      ],
    });

    const result = await listCanonicalOperationalEvidence(client as never, WS);
    expect(result.items).toHaveLength(1);
    const ev = result.items[0]!;
    expect(ev.reasons).toEqual(["búsqueda manual de cliente y recibo"]);
    expect(ev.reasons.every((r) => typeof r === "string")).toBe(true);
    expect(ev.client).toBeNull();
    expect(ev.receipt).toBeNull();
    expect(ev.confidenceLevel).toBe("baja"); // REVIEW + confidence 0 < 55
  });

  it("BANK-RECEIPT-SEARCH-PAGE-CRASH-001: fila legacy con reasons en shape de objeto ({code,detail}) nunca llega como objeto a evidence.reasons", async () => {
    const client = fakeClient({
      bank_reconciliation_suggestions: [
        {
          id: "sugg-legacy-manual",
          workspace_id: WS,
          bank_movement_id: "mov-legacy",
          payer_identity_id: null,
          proposed_client_id: null,
          proposed_receipt_id: null,
          confidence: 0,
          // Shape real encontrado en producción antes del fix: array de objetos,
          // no de códigos string — nunca debe sobrevivir a la capa de lectura.
          reasons: [{ code: "MANUAL_DRAFT", detail: "Búsqueda manual de cliente y recibo" }],
          warnings: [],
          recommended_action: "REVIEW",
          engine_version: 9001,
          status: "generated",
          suggestion_scope: "operational",
          created_at: "2026-07-22T12:19:33Z",
          updated_at: "2026-07-22T12:19:33Z",
        },
      ],
      bank_movements: [
        {
          id: "mov-legacy",
          workspace_id: WS,
          bank_name: "Santander",
          account_label: null,
          movement_date: "2026-07-10",
          description: "TRANSFERENCIA LEGACY",
          raw_description: null,
          amount: 7358,
          currency: "UYU",
          direction: "inflow",
          bank_reference: null,
          status: "pending",
          metadata: {},
        },
      ],
    });

    const result = await listCanonicalOperationalEvidence(client as never, WS);
    expect(result.items).toHaveLength(1);
    const ev = result.items[0]!;
    // El objeto malformado se filtra en la capa de lectura: reasons queda vacío
    // (nunca un objeto), y nada aguas abajo intenta renderizarlo como children.
    expect(ev.reasons).toEqual([]);
    expect(ev.reasons.every((r) => typeof r === "string")).toBe(true);
  });

  it("marca conflicto cuando la misma identidad de pagador está vinculada a más de un cliente", async () => {
    const client = fakeClient({
      bank_reconciliation_suggestions: [
        {
          id: "sugg-2",
          workspace_id: WS,
          bank_movement_id: "mov-2",
          payer_identity_id: "payer-2",
          proposed_client_id: null,
          proposed_receipt_id: null,
          confidence: 60,
          reasons: [],
          warnings: ["SHARED_PAYER"],
          recommended_action: "REVIEW",
          engine_version: 1,
          status: "generated",
          suggestion_scope: "operational",
          created_at: "2026-07-18T00:00:00Z",
          updated_at: "2026-07-18T00:00:00Z",
        },
      ],
      bank_movements: [
        {
          id: "mov-2",
          workspace_id: WS,
          bank_name: "Santander",
          account_label: null,
          movement_date: "2026-07-19",
          description: "TRANSF",
          raw_description: null,
          amount: 5000,
          currency: "UYU",
          direction: "inflow",
          bank_reference: null,
          status: "pending",
          metadata: {},
        },
      ],
      bank_payer_identities: [
        { id: "payer-2", workspace_id: WS, account_hash: "hash-x", masked_account: "•••• 1111", normalized_name: null, fingerprint_strength: "account", status: "conflicted" },
      ],
      client_payer_links: [
        { id: "l1", workspace_id: WS, payer_identity_id: "payer-2", client_company_id: "client-A", confidence: 50, status: "confirmed", reconciled_count: 2 },
        { id: "l2", workspace_id: WS, payer_identity_id: "payer-2", client_company_id: "client-B", confidence: 50, status: "confirmed", reconciled_count: 1 },
      ],
    });

    const result = await listCanonicalOperationalEvidence(client as never, WS);
    expect(result.items[0]!.payer?.hasConflict).toBe(true);
    expect(result.items[0]!.confidenceLevel).toBe("media"); // REVIEW + score 60 >= 55
    expect(result.items[0]!.warnings).toEqual(["esta cuenta pagó antes por más de un cliente"]);
  });

  it("nunca escribe: no llama insert/update/delete en ninguna tabla financiera", async () => {
    let wroteAnything = false;
    const client = fakeClient({});
    const originalFrom = client.from.bind(client);
    (client as { from: typeof client.from }).from = (table: string) => {
      const builder = originalFrom(table) as Record<string, unknown>;
      builder.insert = () => {
        wroteAnything = true;
        return { select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) };
      };
      builder.update = () => {
        wroteAnything = true;
        return builder;
      };
      builder.delete = () => {
        wroteAnything = true;
        return builder;
      };
      return builder;
    };
    await listCanonicalOperationalEvidence(client as never, WS);
    expect(wroteAnything).toBe(false);
  });
});

describe("BANK-RECONCILIATION-TRIAD-ALIGNMENT-001 — nivel real vía payment_allocations", () => {
  function confirmedSuggestion(overrides: Row = {}): Row {
    return {
      id: "sugg-c",
      workspace_id: WS,
      bank_movement_id: "mov-c",
      payer_identity_id: null,
      proposed_client_id: "client-1",
      proposed_receipt_id: "receipt-1",
      confidence: 95,
      reasons: [],
      warnings: [],
      recommended_action: "AUTO_RECONCILE_CANDIDATE",
      engine_version: 1,
      status: "confirmed",
      confirmed_link_id: "link-1",
      suggestion_scope: "operational",
      created_at: "2026-07-18T00:00:00Z",
      updated_at: "2026-07-18T00:00:00Z",
      ...overrides,
    };
  }

  const baseTables: Tables = {
    bank_movements: [
      {
        id: "mov-c",
        workspace_id: WS,
        bank_name: "Santander",
        account_label: null,
        movement_date: "2026-07-09",
        description: "TRANSF",
        raw_description: null,
        amount: 10004,
        currency: "UYU",
        direction: "inflow",
        bank_reference: null,
        status: "matched",
        metadata: {},
      },
    ],
    proto_companies: [{ id: "client-1", workspace_company_id: WS, name: "Botica del Señor SRL", is_active: true }],
    proto_receipts: [
      {
        id: "receipt-1",
        workspace_company_id: WS,
        company_id: "client-1",
        amount: 10004,
        currency_code: "UYU",
        receipt_date: "2026-07-09",
        status: "issued",
      },
    ],
  };

  it("recibo sin aplicaciones reales → reconciled_with_receipt, sin inventar facturas aplicadas", async () => {
    const client = fakeClient({
      ...baseTables,
      bank_reconciliation_suggestions: [confirmedSuggestion()],
      payment_allocations: [],
    });
    const result = await listCanonicalOperationalEvidence(client as never, WS, { statuses: ["confirmed"] });
    const ev = result.items[0]!;
    expect(ev.reconciliationLevel).toBe("reconciled_with_receipt");
    expect(ev.appliedAllocations).toHaveLength(0);
  });

  it("recibo con una aplicación real (una factura) → full_reconciliation", async () => {
    const client = fakeClient({
      ...baseTables,
      bank_reconciliation_suggestions: [confirmedSuggestion()],
      payment_allocations: [
        {
          workspace_id: WS,
          reconciliation_link_id: "link-1",
          invoice_id: "inv-1",
          applied_amount: 10004,
          currency: "UYU",
          status: "active",
          proto_invoices: { invoice_number: "A-842" },
        },
      ],
    });
    const result = await listCanonicalOperationalEvidence(client as never, WS, { statuses: ["confirmed"] });
    const ev = result.items[0]!;
    expect(ev.reconciliationLevel).toBe("full_reconciliation");
    expect(ev.appliedAllocations).toEqual([
      { invoiceId: "inv-1", invoiceNumber: "A-842", appliedAmount: 10004, currencyCode: "UYU" },
    ]);
  });

  it("recibo con varias aplicaciones (varias facturas) → todas listadas", async () => {
    const client = fakeClient({
      ...baseTables,
      bank_reconciliation_suggestions: [confirmedSuggestion()],
      payment_allocations: [
        {
          workspace_id: WS,
          reconciliation_link_id: "link-1",
          invoice_id: "inv-1",
          applied_amount: 6000,
          currency: "UYU",
          status: "active",
          proto_invoices: { invoice_number: "A-842" },
        },
        {
          workspace_id: WS,
          reconciliation_link_id: "link-1",
          invoice_id: "inv-2",
          applied_amount: 4004,
          currency: "UYU",
          status: "active",
          proto_invoices: { invoice_number: "A-850" },
        },
      ],
    });
    const result = await listCanonicalOperationalEvidence(client as never, WS, { statuses: ["confirmed"] });
    const ev = result.items[0]!;
    expect(ev.reconciliationLevel).toBe("full_reconciliation");
    expect(ev.appliedAllocations).toHaveLength(2);
  });

  it("aplicación anulada (status<>active) no cuenta como full_reconciliation", async () => {
    const client = fakeClient({
      ...baseTables,
      bank_reconciliation_suggestions: [confirmedSuggestion()],
      payment_allocations: [
        {
          workspace_id: WS,
          reconciliation_link_id: "link-1",
          invoice_id: "inv-1",
          applied_amount: 10004,
          currency: "UYU",
          status: "reversed",
          proto_invoices: { invoice_number: "A-842" },
        },
      ],
    });
    const result = await listCanonicalOperationalEvidence(client as never, WS, { statuses: ["confirmed"] });
    const ev = result.items[0]!;
    expect(ev.reconciliationLevel).toBe("reconciled_with_receipt");
    expect(ev.appliedAllocations).toHaveLength(0);
  });

  it("sugerencia pendiente (no confirmada) nunca tiene reconciliationLevel ni appliedAllocations", async () => {
    const client = fakeClient({
      ...baseTables,
      bank_reconciliation_suggestions: [confirmedSuggestion({ status: "generated", confirmed_link_id: null })],
      payment_allocations: [
        {
          workspace_id: WS,
          reconciliation_link_id: "link-1",
          invoice_id: "inv-1",
          applied_amount: 10004,
          currency: "UYU",
          status: "active",
          proto_invoices: { invoice_number: "A-842" },
        },
      ],
    });
    const result = await listCanonicalOperationalEvidence(client as never, WS);
    const ev = result.items[0]!;
    expect(ev.reconciliationLevel).toBeNull();
    expect(ev.appliedAllocations).toHaveLength(0);
  });
});
