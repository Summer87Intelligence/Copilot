/**
 * Tests para findActiveProtoInvoiceIdsByRegistroIds y findActiveProtoInvoiceIdByRegistroId.
 *
 * Cubre:
 *  - Batch linkage via zeta_comprobante_identity_v1.registro_id (path 1).
 *  - Batch linkage via zeta_customer_voucher_v1.zeta_registro_id (path 2).
 *  - Batch linkage via raw_payload.RegistroId (path 3).
 *  - PostgREST devuelve `zeta_metadata` como objeto completo (comportamiento real).
 *  - Todos los orphans si no hay match en ningún path.
 *  - Idempotencia: dos calls con el mismo input → mismo resultado.
 *  - Multi-rid batch: sólo linkea los que tienen match, el resto queda null.
 *  - Single lookup: resuelve correctamente por cada path.
 *  - Guard rid="0" y rid vacío → null sin query.
 *  - Multi-tenant: workspace_company_id siempre enviado.
 *  - onFilterError callback cuando el path falla.
 */
import { describe, expect, it, vi } from "vitest";

import {
  findActiveProtoInvoiceIdsByRegistroIds,
  findActiveProtoInvoiceIdByRegistroId,
} from "@/lib/integrations/zeta/zeta-installments-link";

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INV_A = "11111111-1111-4111-8111-111111111111";
const INV_B = "22222222-2222-4222-8222-222222222222";

// ── Supabase stub factory ──────────────────────────────────────────────────────

type StubRow = { id: string; zeta_metadata: Record<string, unknown> };

/**
 * Simula el comportamiento real de PostgREST:
 *  select("id, zeta_metadata") + filter(path, "in", rids)
 *  → devuelve las filas que pasan el filtro con `zeta_metadata` completo.
 *
 * El stub lee `filteredRows` (pre-configurados por test) para cada path dado.
 */
function createLinkStub(opts: {
  rowsByPath?: Partial<Record<string, StubRow[]>>;
  errorByPath?: Partial<Record<string, { message: string }>>;
  singleRow?: StubRow | null;
}) {
  const eqFilters: Array<[string, unknown]> = [];

  function buildFrom(_table: string) {
    const state: {
      cols: string;
      path: string | null;
      rids: string[];
      singleFilter: string | null;
    } = { cols: "", path: null, rids: [], singleFilter: null };

    const chainable: Record<string, unknown> = {
      select(c: string) {
        state.cols = c;
        return chainable;
      },
      eq(col: string, val: unknown) {
        eqFilters.push([col, val]);
        return chainable;
      },
      like() {
        return chainable;
      },
      filter(col: string, _op: string, val: string) {
        state.path = col;
        // Parse PostgREST in-list: ("rid1","rid2")
        if (val.startsWith("(") && val.endsWith(")")) {
          state.rids = val
            .slice(1, -1)
            .split(",")
            .map((s) => s.replace(/(^"|"$)/g, "").trim())
            .filter(Boolean);
        }
        return chainable;
      },
      limit() {
        return chainable;
      },
      // Single lookup uses .eq("id",...) pattern then direct await
      then(resolve: (v: { data: unknown; error: unknown }) => void) {
        const path = state.path ?? "";
        const err = opts.errorByPath?.[path];
        if (err) return resolve({ data: null, error: err });

        const rows = opts.rowsByPath?.[path] ?? [];
        const matched = rows.filter((r) => {
          // simulate filter: check if row's metadata has any of the rids
          const ridsInMeta = extractAllRids(r.zeta_metadata);
          return ridsInMeta.some((rid) => state.rids.includes(rid));
        });
        return resolve({ data: matched, error: null });
      },
    };

    // single lookup pattern
    Object.assign(chainable, {
      maybeSingle() {
        return Promise.resolve({ data: opts.singleRow ?? null, error: null });
      },
    });

    return chainable;
  }

  return {
    from: (_table: string) => buildFrom(_table),
    _eqFilters: eqFilters,
  };
}

function extractAllRids(meta: Record<string, unknown>): string[] {
  const out: string[] = [];
  const identity = meta?.zeta_comprobante_identity_v1 as Record<string, unknown> | null;
  if (identity?.registro_id) out.push(String(identity.registro_id));
  const v1 = meta?.zeta_customer_voucher_v1 as Record<string, unknown> | null;
  if (v1?.zeta_registro_id) out.push(String(v1.zeta_registro_id));
  const raw = v1?.raw_payload as Record<string, unknown> | null;
  if (raw?.RegistroId) out.push(String(raw.RegistroId));
  if (raw?.registroId) out.push(String(raw.registroId));
  return [...new Set(out)];
}

// ── Batch tests ───────────────────────────────────────────────────────────────

describe("findActiveProtoInvoiceIdsByRegistroIds", () => {
  it("links via zeta_comprobante_identity_v1.registro_id (path 1)", async () => {
    const rid = "2527";
    const stub = createLinkStub({
      rowsByPath: {
        "zeta_metadata->zeta_comprobante_identity_v1->>registro_id": [
          { id: INV_A, zeta_metadata: { zeta_comprobante_identity_v1: { registro_id: rid } } },
        ],
      },
    });
    const result = await findActiveProtoInvoiceIdsByRegistroIds(
      stub as never,
      TENANT,
      [rid]
    );
    expect(result.get(rid)).toBe(INV_A);
  });

  it("links via zeta_customer_voucher_v1.zeta_registro_id (path 2)", async () => {
    const rid = "9999";
    const stub = createLinkStub({
      rowsByPath: {
        "zeta_metadata->zeta_customer_voucher_v1->>zeta_registro_id": [
          { id: INV_B, zeta_metadata: { zeta_customer_voucher_v1: { zeta_registro_id: rid } } },
        ],
      },
    });
    const result = await findActiveProtoInvoiceIdsByRegistroIds(
      stub as never,
      TENANT,
      [rid]
    );
    expect(result.get(rid)).toBe(INV_B);
  });

  it("links via raw_payload.RegistroId (path 3)", async () => {
    const rid = "4444";
    const stub = createLinkStub({
      rowsByPath: {
        "zeta_metadata->zeta_customer_voucher_v1->raw_payload->>RegistroId": [
          {
            id: INV_A,
            zeta_metadata: {
              zeta_customer_voucher_v1: { raw_payload: { RegistroId: rid } },
            },
          },
        ],
      },
    });
    const result = await findActiveProtoInvoiceIdsByRegistroIds(
      stub as never,
      TENANT,
      [rid]
    );
    expect(result.get(rid)).toBe(INV_A);
  });

  it("returns null for rids with no matching invoice", async () => {
    const stub = createLinkStub({ rowsByPath: {} });
    const result = await findActiveProtoInvoiceIdsByRegistroIds(
      stub as never,
      TENANT,
      ["1111", "2222"]
    );
    expect(result.get("1111")).toBeNull();
    expect(result.get("2222")).toBeNull();
  });

  it("partially links a mixed batch (some match, some orphan)", async () => {
    const ridLinked = "7777";
    const ridOrphan = "8888";
    const stub = createLinkStub({
      rowsByPath: {
        "zeta_metadata->zeta_comprobante_identity_v1->>registro_id": [
          {
            id: INV_A,
            zeta_metadata: { zeta_comprobante_identity_v1: { registro_id: ridLinked } },
          },
        ],
      },
    });
    const result = await findActiveProtoInvoiceIdsByRegistroIds(
      stub as never,
      TENANT,
      [ridLinked, ridOrphan]
    );
    expect(result.get(ridLinked)).toBe(INV_A);
    expect(result.get(ridOrphan)).toBeNull();
  });

  it("links both rids when two invoices match in the same path", async () => {
    const ridA = "1001";
    const ridB = "1002";
    const stub = createLinkStub({
      rowsByPath: {
        "zeta_metadata->zeta_comprobante_identity_v1->>registro_id": [
          { id: INV_A, zeta_metadata: { zeta_comprobante_identity_v1: { registro_id: ridA } } },
          { id: INV_B, zeta_metadata: { zeta_comprobante_identity_v1: { registro_id: ridB } } },
        ],
      },
    });
    const result = await findActiveProtoInvoiceIdsByRegistroIds(
      stub as never,
      TENANT,
      [ridA, ridB]
    );
    expect(result.get(ridA)).toBe(INV_A);
    expect(result.get(ridB)).toBe(INV_B);
  });

  it("falls back to path 2 when path 1 errors", async () => {
    const rid = "5555";
    const stub = createLinkStub({
      errorByPath: {
        "zeta_metadata->zeta_comprobante_identity_v1->>registro_id": {
          message: "column not found",
        },
      },
      rowsByPath: {
        "zeta_metadata->zeta_customer_voucher_v1->>zeta_registro_id": [
          {
            id: INV_B,
            zeta_metadata: { zeta_customer_voucher_v1: { zeta_registro_id: rid } },
          },
        ],
      },
    });
    const errors: string[] = [];
    const result = await findActiveProtoInvoiceIdsByRegistroIds(
      stub as never,
      TENANT,
      [rid],
      { onFilterError: (_path, msg) => errors.push(msg) }
    );
    expect(errors).toHaveLength(1);
    expect(result.get(rid)).toBe(INV_B);
  });

  it("skips rid='0' and empty strings without querying", async () => {
    const selectSpy = vi.fn().mockReturnValue({ eq: () => ({ then: () => Promise.resolve({ data: [], error: null }) }) });
    const stub = { from: () => ({ select: selectSpy }) };
    await findActiveProtoInvoiceIdsByRegistroIds(stub as never, TENANT, ["0", "", "  "]);
    expect(selectSpy).not.toHaveBeenCalled();
  });

  it("returns empty map when workspaceCompanyId is empty", async () => {
    const stub = createLinkStub({});
    const result = await findActiveProtoInvoiceIdsByRegistroIds(stub as never, "", ["2527"]);
    expect(result.size).toBe(0);
  });

  it("is idempotent: two calls with same input produce same output", async () => {
    const rid = "3333";
    const stub = createLinkStub({
      rowsByPath: {
        "zeta_metadata->zeta_comprobante_identity_v1->>registro_id": [
          { id: INV_A, zeta_metadata: { zeta_comprobante_identity_v1: { registro_id: rid } } },
        ],
      },
    });
    const r1 = await findActiveProtoInvoiceIdsByRegistroIds(stub as never, TENANT, [rid]);
    const r2 = await findActiveProtoInvoiceIdsByRegistroIds(stub as never, TENANT, [rid]);
    expect(r1.get(rid)).toBe(INV_A);
    expect(r2.get(rid)).toBe(INV_A);
  });

  it("handles invoice with multiple registro_ids in metadata", async () => {
    const ridPrimary = "6000";
    const ridAlias = "6001";
    const stub = createLinkStub({
      rowsByPath: {
        "zeta_metadata->zeta_comprobante_identity_v1->>registro_id": [
          {
            id: INV_A,
            zeta_metadata: {
              zeta_comprobante_identity_v1: { registro_id: ridPrimary },
              zeta_customer_voucher_v1: { zeta_registro_id: ridAlias },
            },
          },
        ],
      },
    });
    const result = await findActiveProtoInvoiceIdsByRegistroIds(
      stub as never,
      TENANT,
      [ridPrimary]
    );
    expect(result.get(ridPrimary)).toBe(INV_A);
  });
});

// ── Shadow chain fallback tests ───────────────────────────────────────────────

type ShadowStubRow = {
  id: string;
  invoice_number?: string;
  zeta_metadata: Record<string, unknown>;
  is_active?: boolean;
};

/**
 * Stub que soporta tanto las queries de path CCV1 (via `.then`) como las
 * lookups de shadow chain (via `.maybySingle`), distinguiendo por los filtros
 * `.eq()` acumulados en cada builder.
 */
function createShadowChainStub(opts: {
  rowsByPath?: Partial<Record<string, StubRow[]>>;
  shadowByInvoiceNumber?: Record<string, ShadowStubRow | null>;
  rowById?: Record<string, ShadowStubRow | null>;
}) {
  function buildFrom(_table: string) {
    const eqs: Record<string, unknown> = {};
    let path: string | null = null;
    const rids: string[] = [];

    const chainable: Record<string, unknown> = {
      select() {
        return chainable;
      },
      eq(col: string, val: unknown) {
        eqs[col] = val;
        return chainable;
      },
      like() {
        return chainable;
      },
      filter(col: string, _op: string, val: string) {
        path = col;
        if (val.startsWith("(") && val.endsWith(")")) {
          rids.push(
            ...val
              .slice(1, -1)
              .split(",")
              .map((s) => s.replace(/(^"|"$)/g, "").trim())
              .filter(Boolean)
          );
        }
        return chainable;
      },
      limit() {
        return chainable;
      },
      // CCV1 path queries (direct await)
      then(resolve: (v: { data: unknown; error: unknown }) => void) {
        const pathKey = path ?? "";
        const rows = opts.rowsByPath?.[pathKey] ?? [];
        const matched = rows.filter((r) => {
          const ridsInMeta = extractAllRids(r.zeta_metadata);
          return ridsInMeta.some((rid) => rids.includes(rid));
        });
        resolve({ data: matched, error: null });
      },
      // Shadow and chain target lookups
      maybeSingle() {
        if (typeof eqs["invoice_number"] === "string") {
          const row = opts.shadowByInvoiceNumber?.[eqs["invoice_number"] as string] ?? null;
          return Promise.resolve({ data: row, error: null });
        }
        if (typeof eqs["id"] === "string") {
          const row = opts.rowById?.[eqs["id"] as string] ?? null;
          return Promise.resolve({ data: row, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
    };
    return chainable;
  }
  return { from: (_table: string) => buildFrom(_table) };
}

const SHADOW_ID = "shadow00-0000-4000-8000-000000000000";
const NOSER_ID = "noser000-0000-4000-8000-000000000000";
const CCV1_ID = "ccv10000-0000-4000-8000-000000000000";
const NORMAL_CCV1_ID = "normal00-0000-4000-8000-000000000000";

describe("findActiveProtoInvoiceIdsByRegistroIds — shadow chain fallback", () => {
  const RID = "2746";

  it("normal CCV1 link is unchanged; shadowChainResolved stays empty", async () => {
    const stub = createShadowChainStub({
      rowsByPath: {
        "zeta_metadata->zeta_comprobante_identity_v1->>registro_id": [
          {
            id: CCV1_ID,
            zeta_metadata: { zeta_comprobante_identity_v1: { registro_id: RID } },
          },
        ],
      },
    });
    const shadowChainResolved = new Set<string>();
    const linkMap = await findActiveProtoInvoiceIdsByRegistroIds(stub as never, TENANT, [RID], {
      shadowChainResolved,
    });
    expect(linkMap.get(RID)).toBe(CCV1_ID);
    expect(shadowChainResolved.size).toBe(0);
  });

  it("shadow inactive + cleanup_audit → resolves to canonical CCV1 (1 hop)", async () => {
    const stub = createShadowChainStub({
      shadowByInvoiceNumber: {
        [`ZETA:${RID}`]: {
          id: SHADOW_ID,
          zeta_metadata: {
            cleanup_audit: {
              deactivated_reason: "duplicate_shadow_matched_to_ccv1",
              matched_ccv1_invoice_id: CCV1_ID,
            },
          },
        },
      },
      rowById: {
        [CCV1_ID]: {
          id: CCV1_ID,
          invoice_number: "ZETA:CCV1:0:144:A:2983",
          zeta_metadata: {},
          is_active: true,
        },
      },
    });
    const shadowChainResolved = new Set<string>();
    const linkMap = await findActiveProtoInvoiceIdsByRegistroIds(stub as never, TENANT, [RID], {
      shadowChainResolved,
    });
    expect(linkMap.get(RID)).toBe(CCV1_ID);
    expect(shadowChainResolved.has(CCV1_ID)).toBe(true);
  });

  it("chain shadow → inactive NOSER → canonical CCV1 (2 hops)", async () => {
    const stub = createShadowChainStub({
      shadowByInvoiceNumber: {
        [`ZETA:${RID}`]: {
          id: SHADOW_ID,
          zeta_metadata: {
            cleanup_audit: {
              deactivated_reason: "duplicate_shadow_matched_to_ccv1",
              matched_ccv1_invoice_id: NOSER_ID,
            },
          },
        },
      },
      rowById: {
        [NOSER_ID]: {
          id: NOSER_ID,
          invoice_number: "ZETA:CCV1:NOSER:0:144:A:2983",
          zeta_metadata: {
            cleanup_audit: { matched_ccv1_invoice_id: CCV1_ID },
          },
          is_active: false,
        },
        [CCV1_ID]: {
          id: CCV1_ID,
          invoice_number: "ZETA:CCV1:0:144:A:2983",
          zeta_metadata: {},
          is_active: true,
        },
      },
    });
    const shadowChainResolved = new Set<string>();
    const linkMap = await findActiveProtoInvoiceIdsByRegistroIds(stub as never, TENANT, [RID], {
      shadowChainResolved,
    });
    expect(linkMap.get(RID)).toBe(CCV1_ID);
    expect(shadowChainResolved.has(CCV1_ID)).toBe(true);
  });

  it("broken chain (referenced id not found) → null", async () => {
    const stub = createShadowChainStub({
      shadowByInvoiceNumber: {
        [`ZETA:${RID}`]: {
          id: SHADOW_ID,
          zeta_metadata: {
            cleanup_audit: {
              deactivated_reason: "duplicate_shadow_matched_to_ccv1",
              matched_ccv1_invoice_id: "nonexistent-id",
            },
          },
        },
      },
      rowById: {},
    });
    const shadowChainResolved = new Set<string>();
    const linkMap = await findActiveProtoInvoiceIdsByRegistroIds(stub as never, TENANT, [RID], {
      shadowChainResolved,
    });
    expect(linkMap.get(RID)).toBeNull();
    expect(shadowChainResolved.size).toBe(0);
  });

  it("inactive intermediate with no further chain link → null", async () => {
    const stub = createShadowChainStub({
      shadowByInvoiceNumber: {
        [`ZETA:${RID}`]: {
          id: SHADOW_ID,
          zeta_metadata: {
            cleanup_audit: {
              deactivated_reason: "duplicate_shadow_matched_to_ccv1",
              matched_ccv1_invoice_id: NOSER_ID,
            },
          },
        },
      },
      rowById: {
        [NOSER_ID]: {
          id: NOSER_ID,
          invoice_number: "ZETA:CCV1:NOSER:0:144:A:2983",
          zeta_metadata: { cleanup_audit: {} },
          is_active: false,
        },
      },
    });
    const shadowChainResolved = new Set<string>();
    const linkMap = await findActiveProtoInvoiceIdsByRegistroIds(stub as never, TENANT, [RID], {
      shadowChainResolved,
    });
    expect(linkMap.get(RID)).toBeNull();
    expect(shadowChainResolved.size).toBe(0);
  });

  it("active non-CCV1 target → null", async () => {
    const stub = createShadowChainStub({
      shadowByInvoiceNumber: {
        [`ZETA:${RID}`]: {
          id: SHADOW_ID,
          zeta_metadata: {
            cleanup_audit: {
              deactivated_reason: "duplicate_shadow_matched_to_ccv1",
              matched_ccv1_invoice_id: "other-invoice-id",
            },
          },
        },
      },
      rowById: {
        "other-invoice-id": {
          id: "other-invoice-id",
          invoice_number: "MANUAL:123",
          zeta_metadata: {},
          is_active: true,
        },
      },
    });
    const shadowChainResolved = new Set<string>();
    const linkMap = await findActiveProtoInvoiceIdsByRegistroIds(stub as never, TENANT, [RID], {
      shadowChainResolved,
    });
    expect(linkMap.get(RID)).toBeNull();
    expect(shadowChainResolved.size).toBe(0);
  });

  it("normal-linked invoices excluded from shadowChainResolved; shadow-chain ones included", async () => {
    const RID_NORMAL = "1111";
    const RID_SHADOW = "2746";
    const stub = createShadowChainStub({
      rowsByPath: {
        "zeta_metadata->zeta_comprobante_identity_v1->>registro_id": [
          {
            id: NORMAL_CCV1_ID,
            zeta_metadata: { zeta_comprobante_identity_v1: { registro_id: RID_NORMAL } },
          },
        ],
      },
      shadowByInvoiceNumber: {
        [`ZETA:${RID_SHADOW}`]: {
          id: SHADOW_ID,
          zeta_metadata: {
            cleanup_audit: {
              deactivated_reason: "duplicate_shadow_matched_to_ccv1",
              matched_ccv1_invoice_id: CCV1_ID,
            },
          },
        },
      },
      rowById: {
        [CCV1_ID]: {
          id: CCV1_ID,
          invoice_number: "ZETA:CCV1:0:144:A:2983",
          zeta_metadata: {},
          is_active: true,
        },
      },
    });
    const shadowChainResolved = new Set<string>();
    const linkMap = await findActiveProtoInvoiceIdsByRegistroIds(
      stub as never,
      TENANT,
      [RID_NORMAL, RID_SHADOW],
      { shadowChainResolved }
    );
    expect(linkMap.get(RID_NORMAL)).toBe(NORMAL_CCV1_ID);
    expect(linkMap.get(RID_SHADOW)).toBe(CCV1_ID);
    expect(shadowChainResolved.has(NORMAL_CCV1_ID)).toBe(false);
    expect(shadowChainResolved.has(CCV1_ID)).toBe(true);
  });
});

// ── Single lookup tests ───────────────────────────────────────────────────────

describe("findActiveProtoInvoiceIdByRegistroId", () => {
  it("returns null for rid='0'", async () => {
    const stub = { from: vi.fn() };
    const result = await findActiveProtoInvoiceIdByRegistroId(stub as never, TENANT, "0");
    expect(result).toEqual({ invoice_id: null, matched_path: null });
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("returns null for empty rid", async () => {
    const stub = { from: vi.fn() };
    const result = await findActiveProtoInvoiceIdByRegistroId(stub as never, TENANT, "");
    expect(result).toEqual({ invoice_id: null, matched_path: null });
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("returns null when no invoice found", async () => {
    // applyProtoActiveListFilter adds .eq("is_active", true) AFTER .limit(1),
    // so the chain must stay chainable until the final await (via .then).
    const chain: Record<string, unknown> = {};
    const always = () => chain;
    Object.assign(chain, {
      select: always,
      eq: always,
      like: always,
      filter: always,
      limit: always,
      then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
        resolve({ data: [], error: null }),
    });
    const stub = { from: () => chain };
    const result = await findActiveProtoInvoiceIdByRegistroId(
      stub as never,
      TENANT,
      "9999"
    );
    expect(result).toEqual({ invoice_id: null, matched_path: null });
  });
});
