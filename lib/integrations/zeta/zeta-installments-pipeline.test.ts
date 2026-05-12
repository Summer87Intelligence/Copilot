/**
 * Tests del pipeline `runZetaInstallmentsPipeline`.
 *
 * Cubre:
 *  - Linkage invoice ↔ installment cuando RegistroId matchea.
 *  - Cuotas huérfanas (sin invoice match) → invoice_id null + counter.
 *  - Idempotencia (mismo input dos veces → mismo conteo upsertado por corrida,
 *    `onConflict` se respeta).
 *  - Múltiples cuotas por factura → min(cuota_vencimiento) escrita en due_date.
 *  - Multi-currency (USD + UYU).
 *  - Cuotas vencidas (saldo > 0, fecha pasada).
 *  - Pipeline no toca `due_date` cuando invoice ya tiene `due_date_source = 'zeta_cuotas_v1'`
 *    y el nuevo valor es el mismo (idempotente).
 *  - NUNCA escribe NULL en due_date (regla del usuario).
 *
 * No es e2e contra Zeta: mocks de `fetchZetaInstallments` y supabase con un
 * stub que registra upserts/updates para asserts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { runZetaInstallmentsPipeline } from "@/lib/integrations/zeta/zeta-installments-pipeline";

const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const invoiceA = "11111111-1111-4111-8111-111111111111";
const invoiceB = "22222222-2222-4222-8222-222222222222";

// Mock de fetch — controlado por test
const fetchMock = vi.fn();

vi.mock("@/lib/integrations/zeta/zeta-installments-fetch", () => ({
  fetchZetaInstallments: (...args: unknown[]) => fetchMock(...args),
  ZETA_INSTALLMENTS_METHOD: "RESTCuotasV1QueryCliente",
  ZETA_INSTALLMENTS_ROOT_IN_KEY: "QueryClienteIn",
}));

// ── Supabase stub ────────────────────────────────────────────────────────────

type UpsertCall = {
  table: string;
  rows: Array<Record<string, unknown>>;
  onConflict: string | undefined;
};

type UpdateCall = {
  table: string;
  patch: Record<string, unknown>;
  filters: Array<[string, unknown]>;
};

function createSupabaseStub(opts: {
  /** Resultado de `proto_invoices.in()` query para link batch. registroId → { id }. */
  linkResolver: Map<string, string>;
  /** Estado due_date_source por invoice id, leído antes de update. */
  invoiceDueDateSource?: Map<string, { due_date: string | null; due_date_source: string | null }>;
  /** Errores opcionales para forzar branches. */
  upsertError?: { message: string } | null;
}) {
  const upserts: UpsertCall[] = [];
  const updates: UpdateCall[] = [];
  const reads: Array<{ table: string; columns: string[]; filters: Array<[string, unknown]> }> = [];

  function makeProtoInvoicesQuery() {
    const filters: Array<[string, unknown]> = [];
    const state: { columns: string[]; usedIn?: boolean; usedFilter?: boolean; rangeIds?: string[] } = {
      columns: [],
    };

    const obj: Record<string, unknown> = {
      select(cols: string) {
        state.columns = cols.split(/\s*,\s*/);
        return obj;
      },
      eq(c: string, v: unknown) {
        filters.push([c, v]);
        return obj;
      },
      like(c: string, v: string) {
        filters.push([c, v]);
        return obj;
      },
      filter(_c: string, op: string, v: string) {
        // PostgREST `.filter(path, 'in', '("1","2")')`
        state.usedFilter = true;
        const ridList = /^\(/.test(v)
          ? v.slice(1, -1).split(",").map((s) => s.replace(/(^"|"$)/g, "").trim())
          : [];
        state.rangeIds = ridList;
        return obj;
      },
      in(c: string, v: unknown[]) {
        state.usedIn = true;
        filters.push([c, v]);
        return obj;
      },
      limit() {
        return obj;
      },
      maybeSingle() {
        // Used by updateInvoiceDueDate logic: read due_date_source by id
        reads.push({
          table: "proto_invoices",
          columns: state.columns,
          filters,
        });
        const idFilter = filters.find(([c]) => c === "id");
        const id = idFilter?.[1] as string | undefined;
        if (!id) return Promise.resolve({ data: null, error: null });
        const row = opts.invoiceDueDateSource?.get(id) ?? null;
        return Promise.resolve({
          data: row ? { id, ...row } : null,
          error: null,
        });
      },
      then(onFulfilled: (v: unknown) => unknown) {
        // Used by `.in()` (link batch read) and `.update().eq().eq()`
        reads.push({
          table: "proto_invoices",
          columns: state.columns,
          filters,
        });

        // Differentiate: when `state.rangeIds` set → link batch via `.filter('path', 'in', ...)`
        if (state.usedFilter && state.rangeIds && state.rangeIds.length > 0) {
          const rows = state.rangeIds
            .map((rid) => {
              const invId = opts.linkResolver.get(rid);
              if (!invId) return null;
              return {
                id: invId,
                "zeta_metadata->zeta_comprobante_identity_v1->>registro_id": rid,
                zeta_metadata: {
                  zeta_comprobante_identity_v1: { registro_id: rid },
                },
              };
            })
            .filter(Boolean);
          return Promise.resolve({ data: rows, error: null }).then(onFulfilled);
        }

        // `.in()` con id (used for read-current-due_date in batch update flow)
        if (state.usedIn) {
          const idFilter = filters.find(([c]) => c === "id");
          const ids = (idFilter?.[1] as string[]) ?? [];
          const rows = ids.map((id) => {
            const cur = opts.invoiceDueDateSource?.get(id) ?? { due_date: null, due_date_source: null };
            return { id, due_date: cur.due_date, due_date_source: cur.due_date_source };
          });
          return Promise.resolve({ data: rows, error: null }).then(onFulfilled);
        }

        return Promise.resolve({ data: [], error: null }).then(onFulfilled);
      },
      update(patch: Record<string, unknown>) {
        const updFilters: Array<[string, unknown]> = [];
        const updObj: Record<string, unknown> = {
          eq(c: string, v: unknown) {
            updFilters.push([c, v]);
            return updObj;
          },
          then(onFulfilled: (v: unknown) => unknown) {
            updates.push({ table: "proto_invoices", patch, filters: updFilters });
            // Si el patch incluye due_date, simula actualización del estado interno
            const idFilter = updFilters.find(([c]) => c === "id");
            const id = idFilter?.[1] as string | undefined;
            if (id && opts.invoiceDueDateSource) {
              const prev = opts.invoiceDueDateSource.get(id) ?? {
                due_date: null,
                due_date_source: null,
              };
              opts.invoiceDueDateSource.set(id, {
                due_date: (patch.due_date as string) ?? prev.due_date,
                due_date_source: (patch.due_date_source as string) ?? prev.due_date_source,
              });
            }
            return Promise.resolve({ data: null, error: null }).then(onFulfilled);
          },
        };
        return updObj;
      },
    };

    return obj;
  }

  function makeInstallmentsTable() {
    return {
      upsert: (rows: Array<Record<string, unknown>>, options?: { onConflict?: string }) => {
        if (opts.upsertError) {
          return Promise.resolve({ data: null, error: opts.upsertError });
        }
        upserts.push({
          table: "proto_invoice_installments",
          rows,
          onConflict: options?.onConflict,
        });
        return Promise.resolve({ data: null, error: null });
      },
    };
  }

  const supabase = {
    from(table: string) {
      if (table === "proto_invoices") return makeProtoInvoicesQuery();
      if (table === "proto_invoice_installments") return makeInstallmentsTable();
      throw new Error(`Unexpected from(${table})`);
    },
  };

  return { supabase, upserts, updates, reads };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runZetaInstallmentsPipeline — linkage + huérfanos", () => {
  it("matchea zeta_registro_id ↔ invoice_id y persiste invoice_id en la fila", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      rows: [
        {
          RegistroId: 1001,
          ClienteCodigo: "C0001",
          CuotaNumero: 1,
          CuotaVencimiento: "2026-06-15",
          MonedaCodigo: 1,
          CuotaTotal: 1000,
          CuotaSaldo: 1000,
        },
      ],
      hasMore: false,
      warnings: [],
      requestUrl: "x",
      httpStatus: 200,
      raw: {},
      zeta_method: "RESTCuotasV1QueryCliente",
    });

    const { supabase, upserts, updates } = createSupabaseStub({
      linkResolver: new Map([["1001", invoiceA]]),
      invoiceDueDateSource: new Map([
        [invoiceA, { due_date: "2026-05-01", due_date_source: "synthetic_30d" }],
      ]),
    });

    const result = await runZetaInstallmentsPipeline(
      supabase as never,
      tenantId,
      "sync-1",
      { clienteCodigo: "C0001", maxPagesPerRun: 1, pageDelayMs: 0 }
    );

    expect(result.rows_upserted).toBe(1);
    expect(result.rows_linked).toBe(1);
    expect(result.rows_orphan).toBe(0);
    expect(result.invoices_due_date_updated).toBe(1);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]!.onConflict).toBe(
      "workspace_company_id,zeta_registro_id,cuota_numero"
    );
    const row = upserts[0]!.rows[0]!;
    expect(row.invoice_id).toBe(invoiceA);
    expect(row.zeta_registro_id).toBe("1001");
    expect(row.cuota_vencimiento).toBe("2026-06-15");
    expect(row.cuota_total).toBe(1000);
    expect(row.cuota_saldo).toBe(1000);
    expect(row.currency_code).toBe("UYU");

    // Due date update fired
    expect(updates).toHaveLength(1);
    expect(updates[0]!.patch.due_date).toBe("2026-06-15");
    expect(updates[0]!.patch.due_date_source).toBe("zeta_cuotas_v1");
  });

  it("cuota sin invoice match queda como huérfana con invoice_id null y se loggea", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      rows: [
        {
          RegistroId: 9999,
          ClienteCodigo: "C0001",
          CuotaNumero: 1,
          CuotaVencimiento: "2026-06-15",
          MonedaCodigo: 1,
          CuotaTotal: 500,
          CuotaSaldo: 500,
        },
      ],
      hasMore: false,
      warnings: [],
      requestUrl: "x",
      httpStatus: 200,
      raw: {},
      zeta_method: "RESTCuotasV1QueryCliente",
    });

    const { supabase, upserts } = createSupabaseStub({
      linkResolver: new Map(),
    });

    const result = await runZetaInstallmentsPipeline(
      supabase as never,
      tenantId,
      "sync-1",
      { clienteCodigo: "C0001", maxPagesPerRun: 1, pageDelayMs: 0 }
    );

    expect(result.rows_linked).toBe(0);
    expect(result.rows_orphan).toBe(1);
    expect(result.invoices_due_date_updated).toBe(0);
    expect(upserts[0]!.rows[0]!.invoice_id).toBeNull();
  });
});

describe("runZetaInstallmentsPipeline — multi-cuotas / multi-currency / overdue", () => {
  it("varias cuotas de la misma factura: due_date = MIN(cuota_vencimiento de saldo>0)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      rows: [
        {
          RegistroId: 2001,
          CuotaNumero: 1,
          CuotaVencimiento: "2026-08-15",
          MonedaCodigo: 1,
          CuotaTotal: 500,
          CuotaSaldo: 500,
        },
        {
          RegistroId: 2001,
          CuotaNumero: 2,
          CuotaVencimiento: "2026-06-15", // ← mínima
          MonedaCodigo: 1,
          CuotaTotal: 500,
          CuotaSaldo: 500,
        },
        {
          RegistroId: 2001,
          CuotaNumero: 3,
          CuotaVencimiento: "2026-07-15",
          MonedaCodigo: 1,
          CuotaTotal: 500,
          CuotaSaldo: 500,
        },
      ],
      hasMore: false,
      warnings: [],
      requestUrl: "x",
      httpStatus: 200,
      raw: {},
      zeta_method: "RESTCuotasV1QueryCliente",
    });

    const { supabase, updates } = createSupabaseStub({
      linkResolver: new Map([["2001", invoiceA]]),
      invoiceDueDateSource: new Map([
        [invoiceA, { due_date: "2026-04-30", due_date_source: "synthetic_30d" }],
      ]),
    });

    const result = await runZetaInstallmentsPipeline(
      supabase as never,
      tenantId,
      "sync-1",
      { clienteCodigo: "C0001", maxPagesPerRun: 1, pageDelayMs: 0 }
    );
    expect(result.rows_upserted).toBe(3);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.patch.due_date).toBe("2026-06-15");
  });

  it("USD y UYU se mantienen separados en currency_code", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      rows: [
        {
          RegistroId: 3001,
          CuotaNumero: 1,
          CuotaVencimiento: "2026-06-15",
          MonedaCodigo: 2,
          CuotaTotal: 100,
          CuotaSaldo: 100,
        },
        {
          RegistroId: 3002,
          CuotaNumero: 1,
          CuotaVencimiento: "2026-06-15",
          MonedaCodigo: 1,
          CuotaTotal: 1000,
          CuotaSaldo: 1000,
        },
      ],
      hasMore: false,
      warnings: [],
      requestUrl: "x",
      httpStatus: 200,
      raw: {},
      zeta_method: "RESTCuotasV1QueryCliente",
    });

    const { supabase, upserts } = createSupabaseStub({
      linkResolver: new Map([
        ["3001", invoiceA],
        ["3002", invoiceB],
      ]),
      invoiceDueDateSource: new Map(),
    });

    await runZetaInstallmentsPipeline(supabase as never, tenantId, "sync-1", {
      clienteCodigo: "C0001",
      maxPagesPerRun: 1,
      pageDelayMs: 0,
      updateInvoiceDueDate: false,
    });

    const usd = upserts[0]!.rows.find((r) => r.zeta_registro_id === "3001");
    const uyu = upserts[0]!.rows.find((r) => r.zeta_registro_id === "3002");
    expect(usd?.currency_code).toBe("USD");
    expect(uyu?.currency_code).toBe("UYU");
  });

  it("cuotas vencidas se upsertean sin filtrar (saldo > 0 es lo único requerido por la API)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      rows: [
        {
          RegistroId: 4001,
          CuotaNumero: 1,
          CuotaVencimiento: "2025-12-01", // vencida
          MonedaCodigo: 1,
          CuotaTotal: 1000,
          CuotaSaldo: 700,
        },
      ],
      hasMore: false,
      warnings: [],
      requestUrl: "x",
      httpStatus: 200,
      raw: {},
      zeta_method: "RESTCuotasV1QueryCliente",
    });

    const { supabase, upserts } = createSupabaseStub({
      linkResolver: new Map([["4001", invoiceA]]),
      invoiceDueDateSource: new Map([
        [invoiceA, { due_date: "2026-01-01", due_date_source: "synthetic_30d" }],
      ]),
    });
    const result = await runZetaInstallmentsPipeline(
      supabase as never,
      tenantId,
      "sync-1",
      { clienteCodigo: "C0001", maxPagesPerRun: 1, pageDelayMs: 0 }
    );
    expect(result.rows_upserted).toBe(1);
    expect(upserts[0]!.rows[0]!.cuota_saldo).toBe(700);
    expect(upserts[0]!.rows[0]!.cuota_vencimiento).toBe("2025-12-01");
  });
});

describe("runZetaInstallmentsPipeline — idempotencia + due_date safety", () => {
  it("corrida 2 veces con mismo input → upsert idempotente (onConflict resuelve)", async () => {
    const rows = [
      {
        RegistroId: 5001,
        CuotaNumero: 1,
        CuotaVencimiento: "2026-06-15",
        MonedaCodigo: 1,
        CuotaTotal: 1000,
        CuotaSaldo: 1000,
      },
    ];
    fetchMock.mockResolvedValue({
      ok: true,
      rows,
      hasMore: false,
      warnings: [],
      requestUrl: "x",
      httpStatus: 200,
      raw: {},
      zeta_method: "RESTCuotasV1QueryCliente",
    });

    const linkResolver = new Map([["5001", invoiceA]]);
    const invoiceState = new Map([
      [invoiceA, { due_date: "2026-04-30", due_date_source: "synthetic_30d" as string | null }],
    ]);

    const stub1 = createSupabaseStub({ linkResolver, invoiceDueDateSource: invoiceState });
    const r1 = await runZetaInstallmentsPipeline(
      stub1.supabase as never,
      tenantId,
      "sync-1",
      { clienteCodigo: "C0001", maxPagesPerRun: 1, pageDelayMs: 0 }
    );

    const stub2 = createSupabaseStub({ linkResolver, invoiceDueDateSource: invoiceState });
    const r2 = await runZetaInstallmentsPipeline(
      stub2.supabase as never,
      tenantId,
      "sync-2",
      { clienteCodigo: "C0001", maxPagesPerRun: 1, pageDelayMs: 0 }
    );

    expect(r1.rows_upserted).toBe(1);
    expect(r2.rows_upserted).toBe(1);
    expect(stub1.upserts[0]!.onConflict).toBe(
      "workspace_company_id,zeta_registro_id,cuota_numero"
    );

    // r1 actualiza due_date a 2026-06-15. r2 detecta que ya está actualizado y NO vuelve a updatear.
    expect(r1.invoices_due_date_updated).toBe(1);
    expect(r2.invoices_due_date_updated).toBe(0);
  });

  it("NUNCA escribe NULL en due_date (regla del usuario): cuota sin saldo pendiente NO actualiza due_date", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      rows: [
        {
          RegistroId: 6001,
          CuotaNumero: 1,
          CuotaVencimiento: "2026-06-15",
          MonedaCodigo: 1,
          CuotaTotal: 1000,
          CuotaSaldo: 0, // ya cobrada
        },
      ],
      hasMore: false,
      warnings: [],
      requestUrl: "x",
      httpStatus: 200,
      raw: {},
      zeta_method: "RESTCuotasV1QueryCliente",
    });

    const { supabase, updates } = createSupabaseStub({
      linkResolver: new Map([["6001", invoiceA]]),
      invoiceDueDateSource: new Map([
        [invoiceA, { due_date: "2026-04-30", due_date_source: "synthetic_30d" }],
      ]),
    });
    const result = await runZetaInstallmentsPipeline(
      supabase as never,
      tenantId,
      "sync-1",
      { clienteCodigo: "C0001", maxPagesPerRun: 1, pageDelayMs: 0 }
    );
    // Upsert sí (auditoría histórica), pero NO update a invoice (no hay cuota con saldo).
    expect(result.rows_upserted).toBe(1);
    expect(result.invoices_due_date_updated).toBe(0);
    expect(updates).toHaveLength(0);
  });
});
