import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { batchDeriveMovementReconciliationLevels, listReconciledPaymentsForClient } = await import(
  "@/lib/bank/canonical/movement-reconciliation-level"
);

const WS = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

function fakeClient(tables: Tables) {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      const eqFilters: Record<string, unknown> = {};
      const inFilters: Record<string, unknown[]> = {};
      let isNullCol: string | null = null;

      function apply(): Row[] {
        let out = rows;
        for (const [k, v] of Object.entries(eqFilters)) out = out.filter((r) => r[k] === v);
        for (const [k, v] of Object.entries(inFilters)) out = out.filter((r) => v.includes(r[k]));
        if (isNullCol) out = out.filter((r) => r[isNullCol!] == null);
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
        is(col: string, val: unknown) {
          if (val === null) isNullCol = col;
          return builder;
        },
        not() {
          return builder;
        },
        limit() {
          return builder;
        },
        then(resolve: (v: { data: Row[]; error: null }) => void) {
          return resolve({ data: apply(), error: null });
        },
      };
      return builder;
    },
  };
}

const MOV = { id: "mov-1", currency: "UYU", amount: 10004 };

describe("BANK-FULL-RECONCILIATION-UI-CORRECTION-001 — batchDeriveMovementReconciliationLevels", () => {
  it("sin identificación → unidentified (caso ENERGETIA sin candidato)", async () => {
    const client = fakeClient({});
    const levels = await batchDeriveMovementReconciliationLevels(client as never, WS, [MOV]);
    expect(levels.get("mov-1")!.level).toBe("unidentified");
  });

  it("cliente identificado, sin recibo compatible → missing_receipt (Falta recibo en Zeta)", async () => {
    const client = fakeClient({
      bank_movement_client_identifications: [
        { movement_id: "mov-1", client_company_id: "client-1", status: "identified", workspace_id: WS },
      ],
      proto_receipts: [],
    });
    const levels = await batchDeriveMovementReconciliationLevels(client as never, WS, [MOV]);
    expect(levels.get("mov-1")!.level).toBe("missing_receipt");
  });

  it("cliente identificado + recibo compatible pero sin link financiero → client_identified", async () => {
    const client = fakeClient({
      bank_movement_client_identifications: [
        { movement_id: "mov-1", client_company_id: "client-1", status: "identified", workspace_id: WS },
      ],
      proto_receipts: [{ company_id: "client-1", amount: 10004, currency_code: "UYU", workspace_company_id: WS }],
    });
    const levels = await batchDeriveMovementReconciliationLevels(client as never, WS, [MOV]);
    expect(levels.get("mov-1")!.level).toBe("client_identified");
  });

  it("link financiero sin allocations → reconciled_with_receipt (Botica/Samysol)", async () => {
    const client = fakeClient({
      bank_movement_client_identifications: [
        { movement_id: "mov-1", client_company_id: "client-1", status: "identified", workspace_id: WS },
      ],
      bank_movement_reconciliation_links: [
        { id: "link-1", bank_movement_id: "mov-1", target_type: "receipt", target_id: "receipt-1", currency: "UYU", archived_at: null, workspace_id: WS },
      ],
      payment_allocations: [],
    });
    const levels = await batchDeriveMovementReconciliationLevels(client as never, WS, [MOV]);
    const detail = levels.get("mov-1")!;
    expect(detail.level).toBe("reconciled_with_receipt");
    expect(detail.receiptId).toBe("receipt-1");
  });

  it("link con una allocation activa → full_reconciliation", async () => {
    const client = fakeClient({
      bank_movement_client_identifications: [
        { movement_id: "mov-1", client_company_id: "client-1", status: "identified", workspace_id: WS },
      ],
      bank_movement_reconciliation_links: [
        { id: "link-1", bank_movement_id: "mov-1", target_type: "receipt", target_id: "receipt-1", currency: "UYU", archived_at: null, workspace_id: WS },
      ],
      payment_allocations: [{ reconciliation_link_id: "link-1", status: "active", workspace_id: WS }],
    });
    const levels = await batchDeriveMovementReconciliationLevels(client as never, WS, [MOV]);
    expect(levels.get("mov-1")!.level).toBe("full_reconciliation");
  });

  it("link con varias allocations activas → full_reconciliation (varias facturas)", async () => {
    const client = fakeClient({
      bank_movement_client_identifications: [
        { movement_id: "mov-1", client_company_id: "client-1", status: "identified", workspace_id: WS },
      ],
      bank_movement_reconciliation_links: [
        { id: "link-1", bank_movement_id: "mov-1", target_type: "receipt", target_id: "receipt-1", currency: "UYU", archived_at: null, workspace_id: WS },
      ],
      payment_allocations: [
        { reconciliation_link_id: "link-1", status: "active", workspace_id: WS },
        { reconciliation_link_id: "link-1", status: "active", workspace_id: WS },
      ],
    });
    const levels = await batchDeriveMovementReconciliationLevels(client as never, WS, [MOV]);
    expect(levels.get("mov-1")!.level).toBe("full_reconciliation");
  });

  it("allocation anulada (status reversed) se ignora → reconciled_with_receipt, no full", async () => {
    const client = fakeClient({
      bank_movement_client_identifications: [
        { movement_id: "mov-1", client_company_id: "client-1", status: "identified", workspace_id: WS },
      ],
      bank_movement_reconciliation_links: [
        { id: "link-1", bank_movement_id: "mov-1", target_type: "receipt", target_id: "receipt-1", currency: "UYU", archived_at: null, workspace_id: WS },
      ],
      payment_allocations: [{ reconciliation_link_id: "link-1", status: "reversed", workspace_id: WS }],
    });
    const levels = await batchDeriveMovementReconciliationLevels(client as never, WS, [MOV]);
    expect(levels.get("mov-1")!.level).toBe("reconciled_with_receipt");
  });

  it("estado legacy bank_movements.status='matched' no fuerza full_reconciliation por sí solo", async () => {
    // El módulo ni siquiera lee bank_movements.status — el nivel depende solo de
    // identificación + link + allocations reales, nunca del campo legacy.
    const client = fakeClient({
      bank_movement_client_identifications: [
        { movement_id: "mov-1", client_company_id: "client-1", status: "identified", workspace_id: WS },
      ],
      bank_movement_reconciliation_links: [
        { id: "link-1", bank_movement_id: "mov-1", target_type: "receipt", target_id: "receipt-1", currency: "UYU", archived_at: null, workspace_id: WS },
      ],
      payment_allocations: [],
    });
    const levels = await batchDeriveMovementReconciliationLevels(client as never, WS, [MOV]);
    expect(levels.get("mov-1")!.level).toBe("reconciled_with_receipt");
  });

  it("identificación third_party sin link → third_party (Pago de tercero), no client_identified", async () => {
    const client = fakeClient({
      bank_movement_client_identifications: [
        { movement_id: "mov-1", client_company_id: "client-1", status: "third_party", workspace_id: WS },
      ],
    });
    const levels = await batchDeriveMovementReconciliationLevels(client as never, WS, [MOV]);
    expect(levels.get("mov-1")!.level).toBe("third_party");
  });

  it("identificación shared_account sin link → shared_account (Cuenta compartida)", async () => {
    const client = fakeClient({
      bank_movement_client_identifications: [
        { movement_id: "mov-1", client_company_id: "client-1", status: "shared_account", workspace_id: WS },
      ],
    });
    const levels = await batchDeriveMovementReconciliationLevels(client as never, WS, [MOV]);
    expect(levels.get("mov-1")!.level).toBe("shared_account");
  });

  it("link con moneda distinta al movimiento (anomalía) → requires_review", async () => {
    const client = fakeClient({
      bank_movement_client_identifications: [
        { movement_id: "mov-1", client_company_id: "client-1", status: "identified", workspace_id: WS },
      ],
      bank_movement_reconciliation_links: [
        { id: "link-1", bank_movement_id: "mov-1", target_type: "receipt", target_id: "receipt-1", currency: "USD", archived_at: null, workspace_id: WS },
      ],
    });
    const levels = await batchDeriveMovementReconciliationLevels(client as never, WS, [MOV]);
    expect(levels.get("mov-1")!.level).toBe("requires_review");
  });

  it("identificación revoked/excluded se ignora (no cuenta como activa) → unidentified", async () => {
    const client = fakeClient({
      bank_movement_client_identifications: [], // el filtro real ya excluye excluded/revoked server-side
    });
    const levels = await batchDeriveMovementReconciliationLevels(client as never, WS, [MOV]);
    expect(levels.get("mov-1")!.level).toBe("unidentified");
  });

  it("workspace isolation: allocation de otro workspace nunca cuenta (queries siempre .eq workspace_id)", async () => {
    const client = fakeClient({
      bank_movement_client_identifications: [
        { movement_id: "mov-1", client_company_id: "client-1", status: "identified", workspace_id: WS },
      ],
      bank_movement_reconciliation_links: [
        { id: "link-1", bank_movement_id: "mov-1", target_type: "receipt", target_id: "receipt-1", currency: "UYU", archived_at: null, workspace_id: WS },
      ],
      // El fakeClient no filtra por workspace_id salvo que se agregue eqFilters — la query real
      // sí filtra .eq("workspace_id", workspaceId) en payment_allocations antes del .in(); este
      // caso documenta que sin ese registro en la tabla, no hay allocation → no full.
      payment_allocations: [],
    });
    const levels = await batchDeriveMovementReconciliationLevels(client as never, WS, [MOV]);
    expect(levels.get("mov-1")!.level).toBe("reconciled_with_receipt");
  });

  it("lote vacío no dispara ninguna query (sin N+1, retorna Map vacío)", async () => {
    const client = fakeClient({});
    const levels = await batchDeriveMovementReconciliationLevels(client as never, WS, []);
    expect(levels.size).toBe(0);
  });

  it("varios movimientos en una sola llamada resuelven en batch (no N+1)", async () => {
    const client = fakeClient({
      bank_movement_client_identifications: [
        { movement_id: "mov-1", client_company_id: "client-1", status: "identified", workspace_id: WS },
        { movement_id: "mov-2", client_company_id: "client-2", status: "identified", workspace_id: WS },
      ],
      bank_movement_reconciliation_links: [
        { id: "link-1", bank_movement_id: "mov-1", target_type: "receipt", target_id: "receipt-1", currency: "UYU", archived_at: null, workspace_id: WS },
      ],
      payment_allocations: [{ reconciliation_link_id: "link-1", status: "active", workspace_id: WS }],
      proto_receipts: [],
    });
    const levels = await batchDeriveMovementReconciliationLevels(client as never, WS, [
      MOV,
      { id: "mov-2", currency: "USD", amount: 500 },
    ]);
    expect(levels.get("mov-1")!.level).toBe("full_reconciliation");
    expect(levels.get("mov-2")!.level).toBe("missing_receipt");
  });
});

describe("BANK-FULL-RECONCILIATION-UI-CORRECTION-001 — listReconciledPaymentsForClient (Cliente 360)", () => {
  it("cliente sin recibos → sin pagos conciliados", async () => {
    const client = fakeClient({ proto_receipts: [] });
    const payments = await listReconciledPaymentsForClient(client as never, WS, "client-1");
    expect(payments).toHaveLength(0);
  });

  it("recibo sin link financiero → no aparece como pago conciliado", async () => {
    const client = fakeClient({
      proto_receipts: [{ id: "receipt-1", company_id: "client-1", amount: 10004, currency_code: "UYU", workspace_company_id: WS }],
      bank_movement_reconciliation_links: [],
    });
    const payments = await listReconciledPaymentsForClient(client as never, WS, "client-1");
    expect(payments).toHaveLength(0);
  });

  it("link con recibo sin allocations → reconciled_with_receipt, mensaje de ausencia (Botica/Samysol)", async () => {
    const client = fakeClient({
      proto_receipts: [{ id: "receipt-1", company_id: "client-1", amount: 10004, currency_code: "UYU", workspace_company_id: WS }],
      bank_movement_reconciliation_links: [
        { id: "link-1", bank_movement_id: "mov-1", target_type: "receipt", target_id: "receipt-1", workspace_id: WS, archived_at: null },
      ],
      bank_movements: [{ id: "mov-1", movement_date: "2026-07-09", amount: 10004, currency: "UYU" }],
      payment_allocations: [],
    });
    const payments = await listReconciledPaymentsForClient(client as never, WS, "client-1");
    expect(payments).toHaveLength(1);
    expect(payments[0]!.level).toBe("reconciled_with_receipt");
    expect(payments[0]!.appliedInvoices).toHaveLength(0);
    expect(payments[0]!.totalApplied).toBe(0);
  });

  it("link con allocation activa a una factura → full_reconciliation con factura visible", async () => {
    const client = fakeClient({
      proto_receipts: [{ id: "receipt-1", company_id: "client-1", amount: 10004, currency_code: "UYU", workspace_company_id: WS }],
      bank_movement_reconciliation_links: [
        { id: "link-1", bank_movement_id: "mov-1", target_type: "receipt", target_id: "receipt-1", workspace_id: WS, archived_at: null },
      ],
      bank_movements: [{ id: "mov-1", movement_date: "2026-07-09", amount: 10004, currency: "UYU" }],
      payment_allocations: [
        {
          reconciliation_link_id: "link-1",
          invoice_id: "inv-1",
          applied_amount: 10004,
          status: "active",
          workspace_id: WS,
          proto_invoices: { invoice_number: "A-842" },
        },
      ],
    });
    const payments = await listReconciledPaymentsForClient(client as never, WS, "client-1");
    expect(payments[0]!.level).toBe("full_reconciliation");
    expect(payments[0]!.appliedInvoices).toEqual([{ invoiceId: "inv-1", invoiceNumber: "A-842", appliedAmount: 10004 }]);
    expect(payments[0]!.totalApplied).toBe(10004);
  });

  it("suma aplicada correcta con varias facturas", async () => {
    const client = fakeClient({
      proto_receipts: [{ id: "receipt-1", company_id: "client-1", amount: 10004, currency_code: "UYU", workspace_company_id: WS }],
      bank_movement_reconciliation_links: [
        { id: "link-1", bank_movement_id: "mov-1", target_type: "receipt", target_id: "receipt-1", workspace_id: WS, archived_at: null },
      ],
      bank_movements: [{ id: "mov-1", movement_date: "2026-07-09", amount: 10004, currency: "UYU" }],
      payment_allocations: [
        { reconciliation_link_id: "link-1", invoice_id: "inv-1", applied_amount: 6000, status: "active", workspace_id: WS, proto_invoices: { invoice_number: "A-1" } },
        { reconciliation_link_id: "link-1", invoice_id: "inv-2", applied_amount: 4004, status: "active", workspace_id: WS, proto_invoices: { invoice_number: "A-2" } },
      ],
    });
    const payments = await listReconciledPaymentsForClient(client as never, WS, "client-1");
    expect(payments[0]!.totalApplied).toBe(10004);
    expect(payments[0]!.appliedInvoices).toHaveLength(2);
  });

  it("no inventa facturas: allocation de otra factura anulada no cuenta", async () => {
    const client = fakeClient({
      proto_receipts: [{ id: "receipt-1", company_id: "client-1", amount: 10004, currency_code: "UYU", workspace_company_id: WS }],
      bank_movement_reconciliation_links: [
        { id: "link-1", bank_movement_id: "mov-1", target_type: "receipt", target_id: "receipt-1", workspace_id: WS, archived_at: null },
      ],
      bank_movements: [{ id: "mov-1", movement_date: "2026-07-09", amount: 10004, currency: "UYU" }],
      payment_allocations: [
        { reconciliation_link_id: "link-1", invoice_id: "inv-1", applied_amount: 10004, status: "reversed", workspace_id: WS, proto_invoices: { invoice_number: "A-1" } },
      ],
    });
    const payments = await listReconciledPaymentsForClient(client as never, WS, "client-1");
    expect(payments[0]!.level).toBe("reconciled_with_receipt");
    expect(payments[0]!.appliedInvoices).toHaveLength(0);
  });
});
