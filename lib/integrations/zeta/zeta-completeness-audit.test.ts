/**
 * ZETA-13: Tests del completeness audit de invoices con classifier alineado.
 *
 * Cubre:
 *  - Filas con CFETipo=0 (cfe_type_not_dgi) NO generan drift en zeta_count
 *  - Filas con CFETipo válido ausente en local SÍ generan drift y aparecen en missing_ids
 *  - skipped_classifier_counts reportado en metadata cuando hay descartadas
 *  - sample_skipped_classifier captura hasta 5 muestras
 *  - severity=ok cuando zeta_accepted_count === local_count
 *  - severity=critical cuando faltan accepted invoices
 *  - Zeta error parcial no rompe la función
 *  - cfe_type_not_dgi con varios tipos (no solo 0)
 *  - recibo_text también descartado
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { runInvoiceCompletenessAudit } from "@/lib/integrations/zeta/zeta-completeness-audit";

// ── Mock fetchZetaCustomerVouchers ────────────────────────────────────────────

const fetchMock = vi.fn();

vi.mock("@/lib/integrations/zeta/zeta-customer-vouchers-fetch", () => ({
  fetchZetaCustomerVouchers: (...args: unknown[]) => fetchMock(...args),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const WORKSPACE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** Builds a raw Zeta voucher row. CFETipo=101 = e-Factura DGI (accepted). */
function makeVoucherRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    RegistroId: "1001",
    ComprobanteCodigo: "C001",
    Serie: "A",
    Numero: "100",
    CFETipo: 101,
    TipoComprobanteNombre: "e-Factura",
    ...overrides,
  };
}

type FetchResult = {
  ok: boolean;
  rows: Record<string, unknown>[];
  hasMore: boolean;
  errors: string[];
  error_code?: string;
  requestUrl: string;
  httpStatus: number | null;
  raw: null;
  zeta_method: string;
  root_in_key: string;
};

function okFetchResult(rows: Record<string, unknown>[], hasMore = false): FetchResult {
  return {
    ok: true,
    rows,
    hasMore,
    errors: [],
    requestUrl: "https://api.zeta.test",
    httpStatus: 200,
    raw: null,
    zeta_method: "RESTComprobantesClienteV1Query",
    root_in_key: "MovimientoItem",
  };
}

/** Supabase stub for invoice completeness audit queries. */
function createSupabaseStub(opts: {
  localCount?: number;
  localCountError?: string;
  localMetaRows?: Array<{ invoice_number?: string; zeta_metadata: unknown }>;
}) {
  return {
    from(table: string) {
      const q = {
        _table: table,
        _isCount: false,
        _isSelect: false,
        select(cols: string, selectOpts?: { count?: string; head?: boolean }) {
          q._isCount = !!selectOpts?.count;
          q._isSelect = true;
          return q;
        },
        eq() { return q; },
        like() { return q; },
        gte() { return q; },
        lte() { return q; },
        limit() { return q; },
        then(resolve: (v: { data: unknown; error: unknown; count?: number | null }) => unknown) {
          if (table === "proto_invoices" && q._isCount) {
            if (opts.localCountError) {
              return resolve({ data: null, error: { message: opts.localCountError }, count: null });
            }
            return resolve({ data: null, error: null, count: opts.localCount ?? 0 });
          }
          if (table === "proto_invoices" && q._isSelect) {
            return resolve({ data: opts.localMetaRows ?? [], error: null });
          }
          return resolve({ data: null, error: null });
        },
      };
      return q;
    },
  } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runInvoiceCompletenessAudit — classifier alignment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("CFETipo=0 rows are excluded from zeta_count → no false drift", async () => {
    // 93 total rows: 62 accepted (CFETipo DGI), 31 skipped (CFETipo=0)
    const accepted = Array.from({ length: 62 }, (_, i) =>
      makeVoucherRow({ RegistroId: String(1000 + i), CFETipo: 101 })
    );
    const skipped = Array.from({ length: 31 }, (_, i) =>
      makeVoucherRow({ RegistroId: String(2000 + i), CFETipo: 0 })
    );
    fetchMock.mockResolvedValue(okFetchResult([...accepted, ...skipped]));

    const supabase = createSupabaseStub({ localCount: 62 });
    const result = await runInvoiceCompletenessAudit(supabase, WORKSPACE, 5, 2026);

    // zeta_count reflects accepted only, not raw 93
    expect(result.zeta_count).toBe(62);
    expect(result.local_count).toBe(62);
    expect(result.drift).toBe(0);
    expect(result.severity).toBe("ok");
    expect(result.metadata?.zeta_raw_count).toBe(93);
    expect(result.metadata?.zeta_accepted_count).toBe(62);
    expect(result.metadata?.zeta_skipped_count).toBe(31);
    expect(result.metadata?.skipped_classifier_counts?.cfe_type_not_dgi).toBe(31);
  });

  it("accepted invoice missing in local → drift detected, in missing_registro_ids", async () => {
    // 3 accepted rows, local only has 2
    const rows = [
      makeVoucherRow({ RegistroId: "R1", CFETipo: 101 }),
      makeVoucherRow({ RegistroId: "R2", CFETipo: 101 }),
      makeVoucherRow({ RegistroId: "R3", CFETipo: 101 }), // missing locally
    ];
    fetchMock.mockResolvedValue(okFetchResult(rows));

    // Local has R1 and R2 in zeta_metadata
    const supabase = createSupabaseStub({
      localCount: 2,
      localMetaRows: [
        { zeta_metadata: { zeta_comprobante_identity_v1: { registro_id: "R1" } } },
        { zeta_metadata: { zeta_comprobante_identity_v1: { registro_id: "R2" } } },
      ],
    });

    const result = await runInvoiceCompletenessAudit(supabase, WORKSPACE, 5, 2026);

    expect(result.zeta_count).toBe(3);
    expect(result.local_count).toBe(2);
    expect(result.drift).toBe(-1);
    expect(result.missing_registro_ids).toContain("R3");
    expect(result.severity).not.toBe("ok");
  });

  it("mix: CFETipo=0 skipped + one accepted missing → only the accepted counts as drift", async () => {
    // 5 rows: 2 CFETipo=0 (skipped), 2 accepted (local), 1 accepted (missing)
    const rows = [
      makeVoucherRow({ RegistroId: "S1", CFETipo: 0 }),
      makeVoucherRow({ RegistroId: "S2", CFETipo: 0 }),
      makeVoucherRow({ RegistroId: "A1", CFETipo: 101 }),
      makeVoucherRow({ RegistroId: "A2", CFETipo: 101 }),
      makeVoucherRow({ RegistroId: "A3", CFETipo: 101 }), // missing
    ];
    fetchMock.mockResolvedValue(okFetchResult(rows));

    const supabase = createSupabaseStub({
      localCount: 2,
      localMetaRows: [
        { zeta_metadata: { zeta_comprobante_identity_v1: { registro_id: "A1" } } },
        { zeta_metadata: { zeta_comprobante_identity_v1: { registro_id: "A2" } } },
      ],
    });

    const result = await runInvoiceCompletenessAudit(supabase, WORKSPACE, 5, 2026);

    expect(result.metadata?.zeta_raw_count).toBe(5);
    expect(result.metadata?.zeta_accepted_count).toBe(3);
    expect(result.metadata?.zeta_skipped_count).toBe(2);
    expect(result.zeta_count).toBe(3);    // 3 accepted
    expect(result.local_count).toBe(2);
    expect(result.drift).toBe(-1);        // only A3 missing
    expect(result.missing_registro_ids).toEqual(["A3"]);
    expect(result.missing_registro_ids).not.toContain("S1"); // skipped not in missing
    expect(result.missing_registro_ids).not.toContain("S2");
  });

  it("no skipped rows → metadata has zeta_skipped_count=0, no skipped_classifier_counts", async () => {
    const rows = [
      makeVoucherRow({ RegistroId: "A1", CFETipo: 101 }),
      makeVoucherRow({ RegistroId: "A2", CFETipo: 102 }),
    ];
    fetchMock.mockResolvedValue(okFetchResult(rows));
    const supabase = createSupabaseStub({ localCount: 2 });

    const result = await runInvoiceCompletenessAudit(supabase, WORKSPACE, 5, 2026);

    expect(result.metadata?.zeta_raw_count).toBe(2);
    expect(result.metadata?.zeta_accepted_count).toBe(2);
    expect(result.metadata?.zeta_skipped_count).toBe(0);
    expect(result.metadata?.skipped_classifier_counts).toBeUndefined();
    expect(result.metadata?.sample_skipped_classifier).toBeUndefined();
    expect(result.severity).toBe("ok");
  });

  it("sample_skipped_classifier captures up to 5 samples", async () => {
    // 10 skipped rows
    const rows = Array.from({ length: 10 }, (_, i) =>
      makeVoucherRow({ RegistroId: String(9000 + i), CFETipo: 0 })
    );
    fetchMock.mockResolvedValue(okFetchResult(rows));
    const supabase = createSupabaseStub({ localCount: 0 });

    const result = await runInvoiceCompletenessAudit(supabase, WORKSPACE, 5, 2026);

    expect(result.metadata?.sample_skipped_classifier).toHaveLength(5);
    expect(result.metadata?.sample_skipped_classifier![0]!.reject_code).toBe("cfe_type_not_dgi");
    expect(result.metadata?.sample_skipped_classifier![0]!.cfe_tipo).toBe(0);
  });

  it("recibo_text rows are also excluded from zeta_count", async () => {
    const rows = [
      makeVoucherRow({ RegistroId: "R1", CFETipo: 101 }), // accepted
      makeVoucherRow({ RegistroId: "R2", CFETipo: 0, TipoComprobanteNombre: "Recibo de Cobranza" }), // recibo_text
      makeVoucherRow({ RegistroId: "R3", CFETipo: 0 }), // cfe_type_not_dgi
    ];
    fetchMock.mockResolvedValue(okFetchResult(rows));
    const supabase = createSupabaseStub({ localCount: 1 });

    const result = await runInvoiceCompletenessAudit(supabase, WORKSPACE, 5, 2026);

    // zeta_count = 1 accepted only
    expect(result.zeta_count).toBe(1);
    expect(result.metadata?.zeta_raw_count).toBe(3);
    expect(result.metadata?.zeta_skipped_count).toBe(2);
    expect(result.metadata?.skipped_classifier_counts?.recibo_text).toBe(1);
    expect(result.metadata?.skipped_classifier_counts?.cfe_type_not_dgi).toBe(1);
    expect(result.severity).toBe("ok");
  });

  it("severity=critical when many accepted invoices are missing", async () => {
    // 100 accepted rows, local only has 40 → 60% drift → critical
    const rows = Array.from({ length: 100 }, (_, i) =>
      makeVoucherRow({ RegistroId: String(i), CFETipo: 101 })
    );
    fetchMock.mockResolvedValue(okFetchResult(rows));
    const supabase = createSupabaseStub({ localCount: 40 });

    const result = await runInvoiceCompletenessAudit(supabase, WORKSPACE, 4, 2026);

    expect(result.zeta_count).toBe(100);
    expect(result.drift).toBe(-60);
    expect(result.severity).toBe("critical");
  });

  it("DB error on local count → severity=critical with metadata preserved", async () => {
    const rows = [makeVoucherRow({ RegistroId: "A1", CFETipo: 101 })];
    fetchMock.mockResolvedValue(okFetchResult(rows));
    const supabase = createSupabaseStub({ localCountError: "connection refused" });

    const result = await runInvoiceCompletenessAudit(supabase, WORKSPACE, 5, 2026);

    expect(result.severity).toBe("critical");
    expect(result.zeta_error).toContain("DB error");
    // Metadata still captured from Zeta fetch
    expect(result.metadata?.zeta_raw_count).toBe(1);
    expect(result.metadata?.zeta_accepted_count).toBe(1);
  });

  it("Zeta fetch error → partial audit, metadata still reports zeros", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      rows: [],
      hasMore: false,
      errors: ["Zeta timeout"],
      error_code: "zeta_timeout",
      requestUrl: "",
      httpStatus: 504,
      raw: null,
      zeta_method: "RESTComprobantesClienteV1Query",
      root_in_key: "MovimientoItem",
    });
    const supabase = createSupabaseStub({ localCount: 10 });

    const result = await runInvoiceCompletenessAudit(supabase, WORKSPACE, 5, 2026);

    expect(result.zeta_error).toContain("Zeta error");
    expect(result.metadata?.zeta_raw_count).toBe(0);
    expect(result.metadata?.zeta_accepted_count).toBe(0);
  });

  it("CFETipo=null (missing field) → row accepted (compat with incomplete payloads)", async () => {
    // Per classifier: if CFETipo is null/missing, row is accepted
    const rows = [
      { RegistroId: "N1", ComprobanteCodigo: "X1", Serie: "A", Numero: "1" }, // no CFETipo
    ];
    fetchMock.mockResolvedValue(okFetchResult(rows));
    const supabase = createSupabaseStub({ localCount: 1 });

    const result = await runInvoiceCompletenessAudit(supabase, WORKSPACE, 5, 2026);

    // No CFETipo → classifier accepts (backwards compat)
    expect(result.zeta_count).toBe(1);
    expect(result.metadata?.zeta_skipped_count).toBe(0);
    expect(result.severity).toBe("ok");
  });

  it("legacy_untraceable: local=71 zeta=62 legacy=62 → severity=ok (all drift is legacy)", async () => {
    // 62 Zeta accepted rows
    const zetaRows = Array.from({ length: 62 }, (_, i) =>
      makeVoucherRow({ RegistroId: String(9000 + i), CFETipo: 101 })
    );
    fetchMock.mockResolvedValue(okFetchResult(zetaRows));

    // 62 ZETA:CCV1: legacy (no metadata → no RegistroId → legacyUntraceableCount++)
    // 9 modern rows with RegistroId in metadata (will populate localRegistroIdSet)
    const legacyRows = Array.from({ length: 62 }, (_, i) => ({
      invoice_number: `ZETA:CCV1:001:001:A:${String(i).padStart(5, "0")}`,
      zeta_metadata: null,
    }));
    const modernRows = Array.from({ length: 9 }, (_, i) => ({
      invoice_number: `ZETA:INV:001:001:A:${String(i).padStart(5, "0")}`,
      zeta_metadata: { zeta_comprobante_identity_v1: { registro_id: String(9000 + i) } },
    }));

    const supabase = createSupabaseStub({
      localCount: 71,
      localMetaRows: [...legacyRows, ...modernRows],
    });

    const result = await runInvoiceCompletenessAudit(supabase, WORKSPACE, 4, 2026);

    expect(result.local_count).toBe(71);
    expect(result.zeta_count).toBe(62);
    expect(result.metadata?.legacy_untraceable_count).toBe(62);
    expect(result.severity).toBe("ok");
    // Raw drift preserved for auditability
    expect(result.drift).toBe(9); // 71 local - 62 zeta
  });

  it("legacy_untraceable: local=71 zeta=62 legacy=10 → severity=critical (real drift remains)", async () => {
    // Same Zeta side: 62 accepted rows
    const zetaRows = Array.from({ length: 62 }, (_, i) =>
      makeVoucherRow({ RegistroId: String(8000 + i), CFETipo: 101 })
    );
    fetchMock.mockResolvedValue(okFetchResult(zetaRows));

    // 10 ZETA:CCV1: legacy + 61 modern rows (no RegistroId match for most → orphan drift)
    const legacyRows = Array.from({ length: 10 }, (_, i) => ({
      invoice_number: `ZETA:CCV1:001:002:A:${String(i).padStart(5, "0")}`,
      zeta_metadata: null,
    }));
    const modernRows = Array.from({ length: 61 }, (_, i) => ({
      invoice_number: `ZETA:INV:001:002:A:${String(i).padStart(5, "0")}`,
      zeta_metadata: { zeta_comprobante_identity_v1: { registro_id: String(8000 + i) } },
    }));

    const supabase = createSupabaseStub({
      localCount: 71,
      localMetaRows: [...legacyRows, ...modernRows],
    });

    const result = await runInvoiceCompletenessAudit(supabase, WORKSPACE, 4, 2026);

    expect(result.local_count).toBe(71);
    expect(result.zeta_count).toBe(62);
    expect(result.metadata?.legacy_untraceable_count).toBe(10);
    // adjustedZeta=52, operationalLocal=61 → pct=17.3% → critical
    expect(result.severity).toBe("critical");
  });

  it("receipts-equivalent: no legacy rows → severity computed from raw counts unchanged", async () => {
    // Verify that when legacyUntraceableCount=0, formula is identical to before
    const zetaRows = Array.from({ length: 50 }, (_, i) =>
      makeVoucherRow({ RegistroId: String(7000 + i), CFETipo: 101 })
    );
    fetchMock.mockResolvedValue(okFetchResult(zetaRows));

    // 30 local modern rows — no legacy
    const modernRows = Array.from({ length: 30 }, (_, i) => ({
      invoice_number: `ZETA:INV:001:003:A:${String(i).padStart(5, "0")}`,
      zeta_metadata: { zeta_comprobante_identity_v1: { registro_id: String(7000 + i) } },
    }));

    const supabase = createSupabaseStub({
      localCount: 30,
      localMetaRows: modernRows,
    });

    const result = await runInvoiceCompletenessAudit(supabase, WORKSPACE, 4, 2026);

    expect(result.metadata?.legacy_untraceable_count).toBeUndefined();
    // zeta=50 local=30 → 40% drift → critical (no legacy to absorb)
    expect(result.severity).toBe("critical");
  });

  it("april 2026: 129 raw, 31 CFETipo=0 skipped → zeta_accepted=98, matches local=98 → ok", async () => {
    const accepted = Array.from({ length: 98 }, (_, i) =>
      makeVoucherRow({ RegistroId: String(1000 + i), CFETipo: 101 })
    );
    const skipped = Array.from({ length: 31 }, (_, i) =>
      makeVoucherRow({ RegistroId: String(5000 + i), CFETipo: 0 })
    );
    fetchMock.mockResolvedValue(okFetchResult([...accepted, ...skipped]));
    const supabase = createSupabaseStub({ localCount: 98 });

    const result = await runInvoiceCompletenessAudit(supabase, WORKSPACE, 4, 2026);

    expect(result.metadata?.zeta_raw_count).toBe(129);
    expect(result.metadata?.zeta_accepted_count).toBe(98);
    expect(result.metadata?.zeta_skipped_count).toBe(31);
    expect(result.zeta_count).toBe(98);
    expect(result.severity).toBe("ok");
  });
});
