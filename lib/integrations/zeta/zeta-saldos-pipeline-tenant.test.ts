import { beforeEach, describe, expect, it, vi } from "vitest";

import { runZetaSaldosPendientesPipeline } from "@/lib/integrations/zeta/zeta-saldos-pipeline";

const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const protoCompanyId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

vi.mock("@/lib/data/zeta-sync-repository", () => ({
  insertZetaSyncRun: vi.fn().mockResolvedValue({ id: "run-test-1" }),
  updateZetaSyncRunById: vi.fn().mockResolvedValue(undefined),
  upsertZetaSyncState: vi.fn().mockResolvedValue({}),
  selectZetaSyncStateByResource: vi.fn().mockResolvedValue(null),
  insertZetaSyncRawPayload: vi.fn().mockResolvedValue(undefined),
}));

const queryZeta = vi.fn();

vi.mock("@/lib/integrations/zeta/zeta-factura-cliente", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/integrations/zeta/zeta-factura-cliente")>();
  return {
    ...mod,
    queryFacturaClienteSaldosPendientes: (...args: unknown[]) => queryZeta(...args),
  };
});

const protoCreateInvoice = vi.fn();
const protoUpdateInvoice = vi.fn();

vi.mock("@/lib/copilot-proto-crud-service", () => ({
  protoCreateInvoice: (...a: unknown[]) => protoCreateInvoice(...a),
  protoUpdateInvoice: (...a: unknown[]) => protoUpdateInvoice(...a),
}));

function createSupabaseStub(opts: {
  protoInvoicesEqPairs: Array<[string, string]>;
  protoInvoicesMaybeSingle: () => Promise<{ data: unknown; error: null }>;
}) {
  const protoCompaniesEq: Array<[string, string]> = [];
  return {
    from: vi.fn((table: string) => {
      if (table === "proto_companies") {
        return {
          select() {
            return this;
          },
          eq(c: string, v: string) {
            protoCompaniesEq.push([c, v]);
            return this;
          },
          async maybeSingle() {
            return { data: { id: protoCompanyId }, error: null };
          },
        };
      }
      if (table === "proto_invoices") {
        return {
          select() {
            return this;
          },
          eq(c: string, v: string) {
            opts.protoInvoicesEqPairs.push([c, v]);
            return this;
          },
          like(c: string, v: string) {
            opts.protoInvoicesEqPairs.push([c, v]);
            return this;
          },
          filter(c: string, v: string) {
            opts.protoInvoicesEqPairs.push(["filter", `${c}=${String(v)}`]);
            return this;
          },
          limit() {
            return this;
          },
          async maybeSingle() {
            return opts.protoInvoicesMaybeSingle();
          },
          then(onFulfilled: (v: unknown) => unknown) {
            return Promise.resolve({ data: [], error: null }).then(onFulfilled);
          },
        };
      }
      throw new Error(`unexpected supabase.from in test: ${table}`);
    }),
    __protoCompaniesEq: protoCompaniesEq,
  };
}

describe("Zeta saldos pipeline — filtro workspace_company_id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    protoCreateInvoice.mockResolvedValue({ ok: true, data: { id: "inv-1" } });
    protoUpdateInvoice.mockResolvedValue({ ok: true, data: {} });
    queryZeta.mockResolvedValue({
      succeed: true,
      rows: [],
      isLastPage: true,
      raw: {},
      responseExplicitArray: false,
    });
  });

  it("lookup inicial de proto_companies incluye workspace_company_id", async () => {
    const stub = createSupabaseStub({
      protoInvoicesEqPairs: [],
      protoInvoicesMaybeSingle: async () => ({ data: null, error: null }),
    });

    await runZetaSaldosPendientesPipeline(stub as never, tenantId, "req-1", {
      mode: "incremental",
      clienteCodigo: "CLI1",
      protoCompanyId,
      idempotencyKey: null,
    });

    const ws = stub.__protoCompaniesEq.filter(([c]) => c === "workspace_company_id");
    expect(ws.length).toBe(1);
    expect(ws[0]?.[1]).toBe(tenantId);
    expect(stub.__protoCompaniesEq.some(([c, v]) => c === "id" && v === protoCompanyId)).toBe(
      true
    );
  });

  it("rechaza tenantCompanyId vacío", async () => {
    const stub = createSupabaseStub({
      protoInvoicesEqPairs: [],
      protoInvoicesMaybeSingle: async () => ({ data: null, error: null }),
    });
    await expect(
      runZetaSaldosPendientesPipeline(stub as never, "  ", "req-2", {
        mode: "incremental",
        clienteCodigo: "CLI1",
        protoCompanyId,
        idempotencyKey: null,
      })
    ).rejects.toThrow(/tenantCompanyId/);
  });

  it("findActiveInvoiceIdByZetaNumber encadena workspace y protoCreateInvoice recibe tenant", async () => {
    const invoiceEq: Array<[string, string]> = [];
    queryZeta.mockResolvedValue({
      succeed: true,
      rows: [
        {
          RegistroId: "ZETA-ROW-1",
          Saldo: 150,
          Total: 200,
          Fecha: "2025-03-01",
        },
      ],
      isLastPage: true,
      raw: {},
      responseExplicitArray: true,
    });

    const stub = createSupabaseStub({
      protoInvoicesEqPairs: invoiceEq,
      protoInvoicesMaybeSingle: async () => ({ data: null, error: null }),
    });

    await runZetaSaldosPendientesPipeline(stub as never, tenantId, "req-3", {
      mode: "incremental",
      clienteCodigo: "CLI1",
      protoCompanyId,
      idempotencyKey: null,
    });

    const invoiceCols = invoiceEq.map(([c]) => c);
    expect(invoiceCols).toEqual(
      expect.arrayContaining(["company_id", "invoice_number", "workspace_company_id", "is_active"])
    );
    expect(invoiceCols.some((c) => c === "like" || c === "filter")).toBe(true);
    const wsInv = invoiceEq.find(([c]) => c === "workspace_company_id");
    expect(wsInv?.[1]).toBe(tenantId);

    expect(protoCreateInvoice).toHaveBeenCalledTimes(1);
    const [, , third] = protoCreateInvoice.mock.calls[0] ?? [];
    expect(third).toBe(tenantId);
  });
});

describe("Zeta saldos pipeline — zero pass safe guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    protoCreateInvoice.mockResolvedValue({ ok: true, data: { id: "inv-1" } });
    protoUpdateInvoice.mockResolvedValue({ ok: true, data: {} });
  });

  function stubWithInvoiceTracking() {
    const invoiceEq: Array<[string, string]> = [];
    return {
      stub: createSupabaseStub({
        protoInvoicesEqPairs: invoiceEq,
        protoInvoicesMaybeSingle: async () => ({ data: null, error: null }),
      }) as never,
      invoiceEq,
      ccv1SweepLikeCount: () =>
        invoiceEq.filter((pair) => pair[0] === "invoice_number" && pair[1] === "ZETA:CCV1:%")
          .length,
    };
  }

  it("corrida completa con filas → zero pass permitido (consulta CCV1 del cliente)", async () => {
    queryZeta.mockResolvedValue({
      succeed: true,
      rows: [
        {
          RegistroId: "ZETA-ROW-1",
          Saldo: 150,
          Total: 200,
          Fecha: "2025-03-01",
        },
      ],
      isLastPage: true,
      raw: {},
      responseExplicitArray: true,
    });
    const { stub, ccv1SweepLikeCount } = stubWithInvoiceTracking();

    const result = await runZetaSaldosPendientesPipeline(stub, tenantId, "req-zp-1", {
      mode: "incremental",
      clienteCodigo: "CLI1",
      protoCompanyId,
      idempotencyKey: null,
    });

    expect(result.stopped_reason).toBe("completed");
    expect(ccv1SweepLikeCount()).toBeGreaterThanOrEqual(1);
  });

  it("corrida completa con 0 filas sin Response array explícito → zero pass bloqueado", async () => {
    queryZeta.mockResolvedValue({
      succeed: true,
      rows: [],
      isLastPage: true,
      raw: {},
      responseExplicitArray: false,
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { stub, ccv1SweepLikeCount } = stubWithInvoiceTracking();

    const result = await runZetaSaldosPendientesPipeline(stub, tenantId, "req-zp-2", {
      mode: "incremental",
      clienteCodigo: "CLI1",
      protoCompanyId,
      idempotencyKey: null,
    });

    expect(result.stopped_reason).toBe("completed");
    expect(ccv1SweepLikeCount()).toBe(0);
    const anySkipLog = warnSpy.mock.calls.some((c) =>
      String(c[0]).includes("zeta_saldos_zero_pass_skipped_safe_guard")
    );
    expect(anySkipLog).toBe(true);
    warnSpy.mockRestore();
  });

  it("corrida completa con 0 filas y Response[] explícito → zero pass permitido", async () => {
    queryZeta.mockResolvedValue({
      succeed: true,
      rows: [],
      isLastPage: true,
      raw: {
        QuerySaldosPendientesOut: {
          Succeed: true,
          IsLastPage: true,
          Response: [],
        },
      },
      responseExplicitArray: true,
    });
    const { stub, ccv1SweepLikeCount } = stubWithInvoiceTracking();

    const result = await runZetaSaldosPendientesPipeline(stub, tenantId, "req-zp-3", {
      mode: "incremental",
      clienteCodigo: "CLI1",
      protoCompanyId,
      idempotencyKey: null,
    });

    expect(result.stopped_reason).toBe("completed");
    expect(ccv1SweepLikeCount()).toBeGreaterThanOrEqual(1);
  });

  it("corrida fallida (succeed=false) → zero pass bloqueado", async () => {
    queryZeta.mockResolvedValue({
      succeed: false,
      rows: [],
      isLastPage: true,
      raw: {},
      responseExplicitArray: true,
    });
    const { stub, ccv1SweepLikeCount } = stubWithInvoiceTracking();

    const result = await runZetaSaldosPendientesPipeline(stub, tenantId, "req-zp-4", {
      mode: "incremental",
      clienteCodigo: "CLI1",
      protoCompanyId,
      idempotencyKey: null,
    });

    expect(result.stopped_reason).toBe("zeta_error");
    expect(ccv1SweepLikeCount()).toBe(0);
  });
});
