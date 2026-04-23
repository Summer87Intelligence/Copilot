import { describe, expect, it, vi } from "vitest";

import { receiptExceedsInvoiceCap } from "@/lib/copilot-data-integrity";
import { protoCreateReceipt, protoUpdateInvoice } from "@/lib/copilot-proto-crud-service";
import { PROTO_CRUD_TABLES } from "@/lib/copilot-proto-crud-types";

describe("PR3: escritura sin recalcular balance desde recibos", () => {
  it("protoCreateReceipt con invoice_id no invoca update sobre proto_invoices", async () => {
    let invoiceUpdateCalls = 0;

    const invoiceBuilder = {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      update() {
        invoiceUpdateCalls += 1;
        return this;
      },
      async maybeSingle() {
        return { data: { total_amount: 10_000, company_id: "co-1" }, error: null };
      },
    };

    let receiptsFromCount = 0;
    const sumReceiptsBuilder = {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      then(resolve: (v: { data: unknown[]; error: null }) => unknown) {
        return Promise.resolve({ data: [], error: null }).then(resolve);
      },
    };
    const insertReceiptBuilder = {
      insert() {
        return this;
      },
      select() {
        return this;
      },
      async single() {
        return {
          data: {
            id: "rec-1",
            company_id: "co-1",
            invoice_id: "inv-1",
            receipt_number: "R1",
            receipt_date: "2025-01-15",
            amount: 500,
            payment_method: null,
            status: "paid",
            reference: null,
            notes: null,
            is_active: true,
            archived_at: null,
          },
          error: null,
        };
      },
    };

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === PROTO_CRUD_TABLES.invoices) return invoiceBuilder;
        if (table === PROTO_CRUD_TABLES.receipts) {
          receiptsFromCount += 1;
          return receiptsFromCount === 1 ? sumReceiptsBuilder : insertReceiptBuilder;
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    };

    const result = await protoCreateReceipt(supabase as never, {
      company_id: "co-1",
      invoice_id: "inv-1",
      receipt_number: "R1",
      receipt_date: "2025-01-15",
      amount: 500,
      payment_method: null,
      status: "paid",
      reference: null,
      notes: null,
    });

    expect(result.ok).toBe(true);
    expect(invoiceUpdateCalls).toBe(0);
  });

  it("protoUpdateInvoice devuelve el balance_amount del patch sin segunda lectura que lo pise", async () => {
    const existing = {
      id: "inv-1",
      company_id: "co-1",
      invoice_number: "F-1",
      issue_date: "2025-01-01",
      due_date: "2025-02-01",
      total_amount: 10_000,
      balance_amount: 7000,
      collection_probability: 0.6,
      status: "issued",
      category: null,
      notes: null,
    };

    let invoicesFromCall = 0;
    let lastInvoiceUpdateRow: Record<string, unknown> | null = null;

    const invoiceSelectBuilder = {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      async maybeSingle() {
        return { data: existing, error: null };
      },
    };

    const invoiceUpdateBuilder = {
      update(row: Record<string, unknown>) {
        lastInvoiceUpdateRow = row;
        return this;
      },
      eq() {
        return this;
      },
      select() {
        return this;
      },
      async single() {
        return {
          data: {
            ...existing,
            ...lastInvoiceUpdateRow,
          },
          error: null,
        };
      },
    };

    const receiptsSumBuilder = {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      then(resolve: (v: { data: unknown[]; error: null }) => unknown) {
        return Promise.resolve({ data: [], error: null }).then(resolve);
      },
    };

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === PROTO_CRUD_TABLES.invoices) {
          invoicesFromCall += 1;
          return invoicesFromCall === 1 ? invoiceSelectBuilder : invoiceUpdateBuilder;
        }
        if (table === PROTO_CRUD_TABLES.receipts) return receiptsSumBuilder;
        throw new Error(`unexpected table: ${table}`);
      }),
    };

    const result = await protoUpdateInvoice(supabase as never, "inv-1", {
      balance_amount: 1234,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data["balance_amount"]).toBe(1234);
    }
    expect(lastInvoiceUpdateRow?.["balance_amount"]).toBe(1234);
  });

  it("protoUpdateInvoice con tenant encadena filtro workspace_company_id en select y update", async () => {
    const existing = {
      id: "inv-1",
      company_id: "co-1",
      invoice_number: "F-1",
      issue_date: "2025-01-01",
      due_date: "2025-02-01",
      total_amount: 10_000,
      balance_amount: 7000,
      collection_probability: 0.6,
      status: "issued",
      category: null,
      notes: null,
    };
    const eqArgs: Array<[string, string]> = [];
    const tenantId = "00000000-0000-4000-8000-0000000000aa";

    const invoiceBuilder = {
      select() {
        return this;
      },
      update() {
        return this;
      },
      eq(col: string, val: string) {
        eqArgs.push([col, val]);
        return this;
      },
      async maybeSingle() {
        return { data: existing, error: null };
      },
      async single() {
        return { data: { ...existing, balance_amount: 99 }, error: null };
      },
    };

    const receiptsSumBuilder = {
      select() {
        return this;
      },
      eq(col: string, val: string) {
        eqArgs.push([col, val]);
        return this;
      },
      then(resolve: (v: { data: unknown[]; error: null }) => unknown) {
        return Promise.resolve({ data: [], error: null }).then(resolve);
      },
    };

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === PROTO_CRUD_TABLES.invoices) return invoiceBuilder;
        if (table === PROTO_CRUD_TABLES.receipts) return receiptsSumBuilder;
        throw new Error(`unexpected table: ${table}`);
      }),
    };

    const result = await protoUpdateInvoice(
      supabase as never,
      "inv-1",
      { balance_amount: 99 },
      tenantId
    );

    expect(result.ok).toBe(true);
    const ws = eqArgs.filter(([c]) => c === "workspace_company_id").map(([, v]) => v);
    expect(ws.length).toBeGreaterThanOrEqual(2);
    expect(ws.every((v) => v === tenantId)).toBe(true);
  });
});

describe("receiptExceedsInvoiceCap (defensa Σ recibos vs total)", () => {
  it("bloquea cuando la suma aplicada superaría el total", () => {
    const err = receiptExceedsInvoiceCap(9500, 10_000, 600);
    expect(err).not.toBeNull();
    expect(err?.code).toBe("VALIDATION");
  });

  it("permite cuando entra dentro del tope", () => {
    expect(receiptExceedsInvoiceCap(4000, 10_000, 6000)).toBeNull();
  });
});
