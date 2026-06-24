import { describe, expect, it } from "vitest";
import type { DataRow } from "@/lib/data/proto-operational-read-repository";
import {
  dedupeZetaShadowInvoicesCanonical,
  SHADOW_DEDUP_TOLERANCE,
} from "@/lib/copilot-zeta-invoice-canonical-dedup";
import { dedupeZetaShadowInvoicesForReporting } from "@/lib/copilot-zeta-invoice-report-dedup";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COMPANY = "co-canonical-test";
const DATE = "2026-06-13";
const DATE2 = "2026-06-14"; // offset for date-shifted tests

function ccv1(overrides: Partial<DataRow> = {}): DataRow {
  return {
    id: "ccv1-1",
    invoice_number: "ZETA:CCV1:0:196:A:2988",
    company_id: COMPANY,
    issue_date: DATE,
    currency_code: "USD",
    total_amount: 488.0,
    balance_amount: 488.0,
    status: "issued",
    category: "Zeta / factura cliente",
    is_active: true,
    zeta_metadata: {},
    ...overrides,
  };
}

function shadow(overrides: Partial<DataRow> = {}): DataRow {
  return {
    id: "shadow-1",
    invoice_number: "ZETA:2825",
    company_id: COMPANY,
    issue_date: DATE,
    currency_code: "USD",
    total_amount: 488.0,
    balance_amount: 488.0,
    status: "issued",
    category: "Zeta / saldos pendientes",
    is_active: true,
    zeta_metadata: { zeta_reconciliation: { source: "saldos" } },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pass 3 — exact fingerprint
// ---------------------------------------------------------------------------

describe("dedupeZetaShadowInvoicesCanonical — Pass 3: exact fingerprint", () => {
  it("exact shadow + CCV1 same date/currency/amount → drop shadow, keep CCV1", () => {
    const out = dedupeZetaShadowInvoicesCanonical([ccv1(), shadow()]);
    expect(out).toHaveLength(1);
    expect(out[0]?.invoice_number).toBe("ZETA:CCV1:0:196:A:2988");
  });

  it("no shadow present → input unchanged", () => {
    const inv = ccv1({ id: "ccv1-a" });
    const out = dedupeZetaShadowInvoicesCanonical([inv]);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("ccv1-a");
  });

  it("empty array → empty array", () => {
    expect(dedupeZetaShadowInvoicesCanonical([])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Pass 2 — amount ±0.20 tolerance
// ---------------------------------------------------------------------------

describe("dedupeZetaShadowInvoicesCanonical — Pass 2: amount tolerance", () => {
  it("shadow amount 0.15 below CCV1 (rounding) → drop shadow (within ±0.20)", () => {
    const c = ccv1({ id: "ccv1-r", total_amount: 488.0 });
    const s = shadow({ id: "shadow-r", total_amount: 487.85 }); // diff = 0.15 ≤ 0.20
    const out = dedupeZetaShadowInvoicesCanonical([c, s]);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("ccv1-r");
  });

  it("shadow amount 0.20 above CCV1 → drop shadow (at boundary)", () => {
    const c = ccv1({ id: "ccv1-b", total_amount: 488.0 });
    const s = shadow({ id: "shadow-b", total_amount: 488.2 }); // diff = 0.20 ≤ 0.20
    const out = dedupeZetaShadowInvoicesCanonical([c, s]);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("ccv1-b");
  });

  it(`shadow amount ${SHADOW_DEDUP_TOLERANCE + 0.01} above CCV1 → keep shadow (outside tolerance)`, () => {
    const c = ccv1({ id: "ccv1-out", total_amount: 488.0 });
    const s = shadow({ id: "shadow-out", total_amount: 488.0 + SHADOW_DEDUP_TOLERANCE + 0.01 });
    const out = dedupeZetaShadowInvoicesCanonical([c, s]);
    expect(out).toHaveLength(2); // orphan — no match
  });

  it("different issue_date → Pass 2 bucket misses → shadow kept (no RegistroId match either)", () => {
    const c = ccv1({ id: "ccv1-d", issue_date: DATE2 });
    const s = shadow({ id: "shadow-d", issue_date: DATE }); // different date from CCV1
    // No RegistroId in CCV1 metadata, different dates, same fingerprint impossible
    const out = dedupeZetaShadowInvoicesCanonical([c, s]);
    expect(out).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Pass 1 — RegistroId matching
// ---------------------------------------------------------------------------

describe("dedupeZetaShadowInvoicesCanonical — Pass 1: RegistroId", () => {
  it("date-shifted pair: CCV1 has matching RegistroId in metadata, different issue_date → drop shadow", () => {
    const c = ccv1({
      id: "ccv1-shifted",
      issue_date: DATE2, // different date from shadow
      zeta_metadata: {
        zeta_comprobante_identity_v1: { schema_version: 1, registro_id: "2825" },
      },
    });
    const s = shadow({ id: "shadow-shifted", issue_date: DATE }); // ZETA:2825 → RegistroId = "2825"
    const out = dedupeZetaShadowInvoicesCanonical([c, s]);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("ccv1-shifted");
  });

  it("shadow invoice_number RegistroId matches CCV1 metadata registro_id → drop shadow", () => {
    const c = ccv1({
      id: "ccv1-meta",
      zeta_metadata: {
        zeta_comprobante_identity_v1: { schema_version: 1, registro_id: "2825" },
        zeta_customer_voucher_v1: { zeta_registro_id: "2825" },
      },
    });
    const s = shadow({ id: "shadow-meta" }); // ZETA:2825 → RegistroId "2825"
    const out = dedupeZetaShadowInvoicesCanonical([c, s]);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("ccv1-meta");
  });

  it("two shadows with same RegistroId → deduplicate shadow pair, keep one", () => {
    const s1 = shadow({ id: "s1" });
    const s2 = shadow({ id: "s2", invoice_number: "ZETA:2825" }); // same RegistroId
    const out = dedupeZetaShadowInvoicesCanonical([s1, s2]);
    expect(out).toHaveLength(1); // one survives (no CCV1 peer → orphan kept)
  });
});

// ---------------------------------------------------------------------------
// Orphan protection
// ---------------------------------------------------------------------------

describe("dedupeZetaShadowInvoicesCanonical — orphan shadows", () => {
  it("orphan shadow (no CCV1 peer at all) → kept", () => {
    const s = shadow({ id: "orphan", company_id: "no-ccv1-company" });
    const out = dedupeZetaShadowInvoicesCanonical([s]);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("orphan");
  });

  it("shadow with CCV1 from different company → kept (cross-company safety)", () => {
    const c = ccv1({ id: "ccv1-other", company_id: "other-co" });
    const s = shadow({ id: "shadow-own", company_id: COMPANY });
    const out = dedupeZetaShadowInvoicesCanonical([c, s]);
    expect(out).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// CCV1 and regular invoice protection
// ---------------------------------------------------------------------------

describe("dedupeZetaShadowInvoicesCanonical — never drops non-shadows", () => {
  it("CCV1 invoice is never dropped even if matched as RegistroId winner", () => {
    const c1 = ccv1({ id: "ccv1-keep-1" });
    const c2 = ccv1({ id: "ccv1-keep-2", invoice_number: "ZETA:CCV1:0:196:A:2989" });
    const out = dedupeZetaShadowInvoicesCanonical([c1, c2]);
    expect(out).toHaveLength(2);
  });

  it("paid CCV1 invoice → never dropped", () => {
    const paid = ccv1({ id: "ccv1-paid", status: "paid", balance_amount: 0 });
    const out = dedupeZetaShadowInvoicesCanonical([paid]);
    expect(out).toHaveLength(1);
  });

  it("regular invoice (non-ZETA number) → never treated as shadow", () => {
    const reg = {
      id: "reg-1",
      invoice_number: "FAC-2026-001",
      company_id: COMPANY,
      issue_date: DATE,
      currency_code: "USD",
      total_amount: 488.0,
      is_active: true,
      status: "issued",
    } satisfies DataRow;
    const out = dedupeZetaShadowInvoicesCanonical([reg, shadow()]);
    // shadow dropped because ccv1-style fingerprint check... wait: no CCV1 present.
    // shadow is orphan → kept. reg is regular → kept.
    expect(out).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Production scenario: two shadows + two CCV1s at same fingerprint
// ---------------------------------------------------------------------------

describe("dedupeZetaShadowInvoicesCanonical — production scenarios", () => {
  it("two shadows, two CCV1s at same date/amount/company → both shadows dropped, both CCV1s kept", () => {
    const c1 = ccv1({ id: "c1", invoice_number: "ZETA:CCV1:0:196:A:2988" });
    const c2 = ccv1({ id: "c2", invoice_number: "ZETA:CCV1:0:196:A:2989" });
    const s1 = shadow({ id: "s1", invoice_number: "ZETA:2825" });
    const s2 = shadow({ id: "s2", invoice_number: "ZETA:2826" });
    const out = dedupeZetaShadowInvoicesCanonical([c1, c2, s1, s2]);
    const ids = out.map((r) => r.id);
    expect(ids).toContain("c1");
    expect(ids).toContain("c2");
    expect(ids).not.toContain("s1");
    expect(ids).not.toContain("s2");
    expect(out).toHaveLength(2);
  });

  it("two shadows, one CCV1 → both shadows dropped (both shadow the same CCV1)", () => {
    const c = ccv1({ id: "c-single" });
    const s1 = shadow({ id: "s1" });
    const s2 = shadow({ id: "s2", invoice_number: "ZETA:9999" }); // different RegistroId, same fingerprint
    const out = dedupeZetaShadowInvoicesCanonical([c, s1, s2]);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("c-single");
  });
});

// ---------------------------------------------------------------------------
// Wrapper parity: dedupeZetaShadowInvoicesForReporting must agree with canonical
// ---------------------------------------------------------------------------

describe("wrapper parity — Recon = Trends = Reports", () => {
  const fixtures: DataRow[] = [
    ccv1({ id: "parity-ccv1" }),
    shadow({ id: "parity-shadow" }),
    shadow({ id: "parity-orphan", company_id: "orphan-co", total_amount: 999 }),
  ];

  it("dedupeZetaShadowInvoicesForReporting delegates to canonical — same result", () => {
    const canonical = dedupeZetaShadowInvoicesCanonical(fixtures);
    const reporting = dedupeZetaShadowInvoicesForReporting(fixtures);
    expect(reporting.map((r) => r.id).sort()).toEqual(canonical.map((r) => r.id).sort());
  });

  it("fixture: shadow dropped, CCV1 kept, orphan kept", () => {
    const out = dedupeZetaShadowInvoicesCanonical(fixtures);
    const ids = out.map((r) => r.id);
    expect(ids).toContain("parity-ccv1");
    expect(ids).toContain("parity-orphan");
    expect(ids).not.toContain("parity-shadow");
  });
});
