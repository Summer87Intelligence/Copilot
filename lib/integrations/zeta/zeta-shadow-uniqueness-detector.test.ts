/**
 * Tests del detector central de unicidad de sombras Zeta vs CCV1.
 */

import { describe, expect, it } from "vitest";
import {
  detectActiveCcv1TwinForShadow,
  findActiveShadowDuplicatesInPeriod,
  SHADOW_UNIQUENESS_TOTAL_TOLERANCE,
  ZETA_SHADOW_CATEGORY,
} from "@/lib/integrations/zeta/zeta-shadow-uniqueness-detector";

type Row = {
  id: string;
  invoice_number: string;
  total_amount: number;
  currency_code: string | null;
  issue_date: string;
  due_date?: string | null;
  created_at?: string | null;
  workspace_company_id?: string;
  company_id?: string;
  is_active?: boolean;
  category?: string | null;
  zeta_metadata?: unknown;
};

/**
 * Mock Supabase client mínimo: cadena `.from().select().eq*().like().gte().lte().order().range()`.
 * Filtra in-memory según los predicados aplicados.
 */
function buildMockSupabase(rows: Row[]) {
  const make = () => {
    const filters: Array<(r: Row) => boolean> = [];
    let rangeEnd = Infinity;
    let rangeStart = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {};
    builder.select = () => builder;
    builder.eq = (col: string, value: unknown) => {
      filters.push((r) => {
        if (col === "is_active") {
          return (r.is_active ?? true) === value;
        }
        return (r as unknown as Record<string, unknown>)[col] === value;
      });
      return builder;
    };
    builder.like = (col: string, value: string) => {
      const re = new RegExp("^" + value.replace(/%/g, ".*").replace(/_/g, ".") + "$");
      filters.push((r) => re.test(String((r as unknown as Record<string, unknown>)[col] ?? "")));
      return builder;
    };
    builder.gte = (col: string, value: string) => {
      filters.push((r) => String((r as unknown as Record<string, unknown>)[col] ?? "") >= value);
      return builder;
    };
    builder.lte = (col: string, value: string) => {
      filters.push((r) => String((r as unknown as Record<string, unknown>)[col] ?? "") <= value);
      return builder;
    };
    builder.order = () => builder;
    builder.range = (start: number, end: number) => {
      rangeStart = start;
      rangeEnd = end;
      return builder;
    };
    builder.then = (resolve: (v: { data: Row[]; error: null }) => void) => {
      const filtered = rows.filter((r) => filters.every((f) => f(r)));
      resolve({ data: filtered.slice(rangeStart, rangeEnd + 1), error: null });
    };
    return builder;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: (_t: string) => make() } as any;
}

const WID = "ws-1";
const COMPANY = "company-elpais";
const DATE = "2026-05-08";

describe("detectActiveCcv1TwinForShadow", () => {
  it("devuelve twin_present cuando hay una CCV1 activa con misma huella", async () => {
    const supabase = buildMockSupabase([
      {
        id: "ccv1-1",
        invoice_number: "ZETA:CCV1:0:36:A:391",
        total_amount: 8662,
        currency_code: "UYU",
        issue_date: DATE,
        workspace_company_id: WID,
        company_id: COMPANY,
        is_active: true,
      },
    ]);
    const out = await detectActiveCcv1TwinForShadow(supabase, {
      workspaceCompanyId: WID,
      companyId: COMPANY,
      currencyCode: "UYU",
      issueYmd: DATE,
      totalAmount: 8662,
    });
    expect(out.kind).toBe("twin_present");
    if (out.kind === "twin_present") {
      expect(out.candidates).toHaveLength(1);
      expect(out.candidates[0]!.invoice_id).toBe("ccv1-1");
    }
  });

  it("acepta diff ±0.20 de centavos como gemela", async () => {
    const supabase = buildMockSupabase([
      {
        id: "ccv1-2",
        invoice_number: "ZETA:CCV1:0:36:A:391",
        total_amount: 8662.15,
        currency_code: "UYU",
        issue_date: DATE,
        workspace_company_id: WID,
        company_id: COMPANY,
        is_active: true,
      },
    ]);
    const out = await detectActiveCcv1TwinForShadow(supabase, {
      workspaceCompanyId: WID,
      companyId: COMPANY,
      currencyCode: "UYU",
      issueYmd: DATE,
      totalAmount: 8662.0,
    });
    expect(out.kind).toBe("twin_present");
  });

  it("rechaza si la diferencia excede tolerancia ±0.20", async () => {
    const supabase = buildMockSupabase([
      {
        id: "ccv1-3",
        invoice_number: "ZETA:CCV1:0:36:A:392",
        total_amount: 8663,
        currency_code: "UYU",
        issue_date: DATE,
        workspace_company_id: WID,
        company_id: COMPANY,
        is_active: true,
      },
    ]);
    const out = await detectActiveCcv1TwinForShadow(supabase, {
      workspaceCompanyId: WID,
      companyId: COMPANY,
      currencyCode: "UYU",
      issueYmd: DATE,
      totalAmount: 8662.0,
    });
    expect(out.kind).toBe("no_twin");
  });

  it("devuelve no_twin cuando no hay CCV1 activa del cliente esa fecha", async () => {
    const supabase = buildMockSupabase([]);
    const out = await detectActiveCcv1TwinForShadow(supabase, {
      workspaceCompanyId: WID,
      companyId: COMPANY,
      currencyCode: "UYU",
      issueYmd: DATE,
      totalAmount: 41480,
    });
    expect(out.kind).toBe("no_twin");
  });

  it("rechaza con invalid_input cuando faltan campos clave", async () => {
    const supabase = buildMockSupabase([]);
    const r1 = await detectActiveCcv1TwinForShadow(supabase, {
      workspaceCompanyId: "",
      companyId: COMPANY,
      currencyCode: "UYU",
      issueYmd: DATE,
      totalAmount: 100,
    });
    expect(r1.kind).toBe("invalid_input");

    const r2 = await detectActiveCcv1TwinForShadow(supabase, {
      workspaceCompanyId: WID,
      companyId: COMPANY,
      currencyCode: "EUR",
      issueYmd: DATE,
      totalAmount: 100,
    });
    expect(r2.kind).toBe("invalid_input");

    const r3 = await detectActiveCcv1TwinForShadow(supabase, {
      workspaceCompanyId: WID,
      companyId: COMPANY,
      currencyCode: "UYU",
      issueYmd: "no-es-fecha",
      totalAmount: 100,
    });
    expect(r3.kind).toBe("invalid_input");

    const r4 = await detectActiveCcv1TwinForShadow(supabase, {
      workspaceCompanyId: WID,
      companyId: COMPANY,
      currencyCode: "UYU",
      issueYmd: DATE,
      totalAmount: 0,
    });
    expect(r4.kind).toBe("invalid_input");
  });

  it("devuelve los 2 candidatos cuando hay ambigüedad genuina (mismo monto)", async () => {
    // Caso real: ZETA:2674 → ZETA:CCV1:0:36:A:391 + ZETA:CCV1:0:36:A:2934
    // misma huella El Pais 2026-05-08 UYU 8662.
    const supabase = buildMockSupabase([
      {
        id: "ccv1-a",
        invoice_number: "ZETA:CCV1:0:36:A:391",
        total_amount: 8662,
        currency_code: "UYU",
        issue_date: DATE,
        workspace_company_id: WID,
        company_id: COMPANY,
        is_active: true,
      },
      {
        id: "ccv1-b",
        invoice_number: "ZETA:CCV1:0:36:A:2934",
        total_amount: 8662,
        currency_code: "UYU",
        issue_date: DATE,
        workspace_company_id: WID,
        company_id: COMPANY,
        is_active: true,
      },
    ]);
    const out = await detectActiveCcv1TwinForShadow(supabase, {
      workspaceCompanyId: WID,
      companyId: COMPANY,
      currencyCode: "UYU",
      issueYmd: DATE,
      totalAmount: 8662,
    });
    expect(out.kind).toBe("twin_present");
    if (out.kind === "twin_present") {
      expect(out.candidates).toHaveLength(2);
    }
  });
});

describe("findActiveShadowDuplicatesInPeriod", () => {
  it("retorna sombra activa con CCV1 gemela activa en el período", async () => {
    const supabase = buildMockSupabase([
      {
        id: "ccv1-1",
        invoice_number: "ZETA:CCV1:0:36:A:391",
        total_amount: 8662,
        currency_code: "UYU",
        issue_date: DATE,
        workspace_company_id: WID,
        company_id: COMPANY,
        is_active: true,
        category: "Zeta / comprobantes por cliente",
      },
      {
        id: "shadow-1",
        invoice_number: "ZETA:2674",
        total_amount: 8662,
        currency_code: "UYU",
        issue_date: DATE,
        workspace_company_id: WID,
        company_id: COMPANY,
        is_active: true,
        category: ZETA_SHADOW_CATEGORY,
      },
    ]);
    const out = await findActiveShadowDuplicatesInPeriod(supabase, WID, {
      from: "2026-05-01",
      to: "2026-05-31",
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.shadow_invoice_number).toBe("ZETA:2674");
    expect(out[0]!.candidates).toHaveLength(1);
    expect(out[0]!.review_required).toBe(false);
  });

  it("marca review_required=true cuando metadata.cleanup_audit.review_required es true", async () => {
    const supabase = buildMockSupabase([
      {
        id: "ccv1-1",
        invoice_number: "ZETA:CCV1:0:1:A:1000",
        total_amount: 9760,
        currency_code: "UYU",
        issue_date: "2026-03-04",
        workspace_company_id: WID,
        company_id: "prestis-co",
        is_active: true,
        category: "Zeta / comprobantes por cliente",
      },
      {
        id: "shadow-prestis",
        invoice_number: "ZETA:9999",
        total_amount: 9760,
        currency_code: "UYU",
        issue_date: "2026-03-04",
        workspace_company_id: WID,
        company_id: "prestis-co",
        is_active: true,
        category: ZETA_SHADOW_CATEGORY,
        zeta_metadata: { cleanup_audit: { review_required: true } },
      },
    ]);
    const out = await findActiveShadowDuplicatesInPeriod(supabase, WID, {
      from: "2026-03-01",
      to: "2026-03-31",
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.review_required).toBe(true);
  });

  it("ignora sombras inactivas (cleanup ya aplicado)", async () => {
    const supabase = buildMockSupabase([
      {
        id: "ccv1-1",
        invoice_number: "ZETA:CCV1:0:36:A:391",
        total_amount: 8662,
        currency_code: "UYU",
        issue_date: DATE,
        workspace_company_id: WID,
        company_id: COMPANY,
        is_active: true,
        category: "Zeta / comprobantes por cliente",
      },
      {
        id: "shadow-deactivated",
        invoice_number: "ZETA:2674",
        total_amount: 8662,
        currency_code: "UYU",
        issue_date: DATE,
        workspace_company_id: WID,
        company_id: COMPANY,
        is_active: false,
        category: ZETA_SHADOW_CATEGORY,
      },
    ]);
    const out = await findActiveShadowDuplicatesInPeriod(supabase, WID, {
      from: "2026-05-01",
      to: "2026-05-31",
    });
    expect(out).toHaveLength(0);
  });

  it("no falsos positivos en CCV1 vs CCV1", async () => {
    // 2 CCV1 con misma huella NO debe reportarse como duplicado shadow.
    const supabase = buildMockSupabase([
      {
        id: "ccv1-a",
        invoice_number: "ZETA:CCV1:0:36:A:391",
        total_amount: 8662,
        currency_code: "UYU",
        issue_date: DATE,
        workspace_company_id: WID,
        company_id: COMPANY,
        is_active: true,
        category: "Zeta / comprobantes por cliente",
      },
      {
        id: "ccv1-b",
        invoice_number: "ZETA:CCV1:0:36:A:2934",
        total_amount: 8662,
        currency_code: "UYU",
        issue_date: DATE,
        workspace_company_id: WID,
        company_id: COMPANY,
        is_active: true,
        category: "Zeta / comprobantes por cliente",
      },
    ]);
    const out = await findActiveShadowDuplicatesInPeriod(supabase, WID, {
      from: "2026-05-01",
      to: "2026-05-31",
    });
    expect(out).toHaveLength(0);
  });

  it("respeta tolerancia ±0.20 (Zeta redondea saldo)", async () => {
    const supabase = buildMockSupabase([
      {
        id: "ccv1-1",
        invoice_number: "ZETA:CCV1:0:36:A:391",
        total_amount: 8661.85,
        currency_code: "UYU",
        issue_date: DATE,
        workspace_company_id: WID,
        company_id: COMPANY,
        is_active: true,
        category: "Zeta / comprobantes por cliente",
      },
      {
        id: "shadow-1",
        invoice_number: "ZETA:2674",
        total_amount: 8662,
        currency_code: "UYU",
        issue_date: DATE,
        workspace_company_id: WID,
        company_id: COMPANY,
        is_active: true,
        category: ZETA_SHADOW_CATEGORY,
      },
    ]);
    const out = await findActiveShadowDuplicatesInPeriod(supabase, WID, {
      from: "2026-05-01",
      to: "2026-05-31",
    });
    expect(out).toHaveLength(1);
  });

  it("tolera input range inválido devolviendo []", async () => {
    const supabase = buildMockSupabase([]);
    const out = await findActiveShadowDuplicatesInPeriod(supabase, WID, {
      from: "no-es-fecha",
      to: "tampoco",
    });
    expect(out).toEqual([]);
  });
});

describe("SHADOW_UNIQUENESS_TOTAL_TOLERANCE", () => {
  it("es exactamente 0.20 (alineado con migración SQL y guardrail in-memory)", () => {
    expect(SHADOW_UNIQUENESS_TOTAL_TOLERANCE).toBe(0.2);
  });
});

// ---------------------------------------------------------------------------
// INTEGRITY-CHECKER-002: tests del flag `ambiguous` y scoring multi-candidato
// ---------------------------------------------------------------------------

describe("findActiveShadowDuplicatesInPeriod — ambiguous flag (INTEGRITY-CHECKER-002)", () => {
  const RANGE_MAY = { from: "2026-05-01", to: "2026-05-31" };

  function baseShadow(overrides: Partial<Row> = {}): Row {
    return {
      id: "shadow-1",
      invoice_number: "ZETA:2825",
      workspace_company_id: WID,
      company_id: COMPANY,
      currency_code: "UYU",
      issue_date: DATE,
      due_date: null,
      created_at: null,
      total_amount: 1000,
      is_active: true,
      category: ZETA_SHADOW_CATEGORY,
      zeta_metadata: {},
      ...overrides,
    };
  }

  function baseCcv1(overrides: Partial<Row> = {}): Row {
    return {
      id: "ccv1-a",
      invoice_number: "ZETA:CCV1:0:196:A:2988",
      workspace_company_id: WID,
      company_id: COMPANY,
      currency_code: "UYU",
      issue_date: DATE,
      due_date: null,
      created_at: null,
      total_amount: 1000,
      is_active: true,
      category: null,
      zeta_metadata: {},
      ...overrides,
    };
  }

  it("1 shadow + 1 CCV1 → ambiguous: false (caso normal, sin scoring)", async () => {
    const rows = [baseShadow(), baseCcv1()];
    const out = await findActiveShadowDuplicatesInPeriod(buildMockSupabase(rows), WID, RANGE_MAY);

    expect(out).toHaveLength(1);
    expect(out[0]!.ambiguous).toBe(false);
    expect(out[0]!.candidates).toHaveLength(1);
    // Single-candidate path asigna match_score=0
    expect(out[0]!.candidates[0]!.match_score).toBe(0);
  });

  it("1 shadow + 2 CCV1s sin campos distinción → ambiguous: true", async () => {
    // Sin due_date ni created_at → ambos candidatos puntúan 0 → margen 0 < 20 → ambiguous
    const rows = [
      baseShadow({ due_date: null, created_at: null }),
      baseCcv1({ id: "ccv1-a", invoice_number: "ZETA:CCV1:0:196:A:2988", due_date: null, created_at: null }),
      baseCcv1({ id: "ccv1-b", invoice_number: "ZETA:CCV1:0:196:A:2989", due_date: null, created_at: null }),
    ];
    const out = await findActiveShadowDuplicatesInPeriod(buildMockSupabase(rows), WID, RANGE_MAY);

    expect(out).toHaveLength(1);
    expect(out[0]!.ambiguous).toBe(true);
    expect(out[0]!.candidates).toHaveLength(2);
  });

  it("due_date coincide en uno → ambiguous: false, ese candidato queda primero", async () => {
    // A:2988 coincide en due_date (+40 pts), A:2989 no (0 pts). Margen=40 ≥ 20 → no ambiguous.
    const rows = [
      baseShadow({ due_date: "2026-05-15" }),
      baseCcv1({ id: "ccv1-a", invoice_number: "ZETA:CCV1:0:196:A:2988", due_date: "2026-05-15" }),
      baseCcv1({ id: "ccv1-b", invoice_number: "ZETA:CCV1:0:196:A:2989", due_date: "2026-06-15" }),
    ];
    const out = await findActiveShadowDuplicatesInPeriod(buildMockSupabase(rows), WID, RANGE_MAY);

    expect(out).toHaveLength(1);
    const d = out[0]!;
    expect(d.ambiguous).toBe(false);
    expect(d.candidates[0]!.invoice_number).toBe("ZETA:CCV1:0:196:A:2988");
    expect(d.candidates[0]!.match_score).toBeGreaterThan(d.candidates[1]!.match_score!);
  });

  it("ambos tienen due_date coincidente → ambiguous: true si no hay otro desempate", async () => {
    // Ambos coinciden en due_date (+40 cada uno). Sin created_at → empate en 40. Margen=0 → ambiguous.
    const rows = [
      baseShadow({ due_date: "2026-05-15", created_at: null }),
      baseCcv1({ id: "ccv1-a", invoice_number: "ZETA:CCV1:0:196:A:2988", due_date: "2026-05-15", created_at: null }),
      baseCcv1({ id: "ccv1-b", invoice_number: "ZETA:CCV1:0:196:A:2989", due_date: "2026-05-15", created_at: null }),
    ];
    const out = await findActiveShadowDuplicatesInPeriod(buildMockSupabase(rows), WID, RANGE_MAY);

    expect(out).toHaveLength(1);
    expect(out[0]!.ambiguous).toBe(true);
  });

  it("temporal proximity (created_at) desambigua cuando due_date no ayuda — margen exacto 20 → NO ambiguous", async () => {
    // Shadow: 2026-06-01. A:2988: 2026-05-31 (1 day = closest → +20). A:2989: 2026-04-01 → 0.
    // Scores: 20 vs 0. Margin=20. NOT < 20 → ambiguous: false.
    const rows = [
      baseShadow({ due_date: null, created_at: "2026-06-01T00:00:00Z" }),
      baseCcv1({
        id: "ccv1-a",
        invoice_number: "ZETA:CCV1:0:196:A:2988",
        due_date: null,
        created_at: "2026-05-31T00:00:00Z",
      }),
      baseCcv1({
        id: "ccv1-b",
        invoice_number: "ZETA:CCV1:0:196:A:2989",
        due_date: null,
        created_at: "2026-04-01T00:00:00Z",
      }),
    ];
    const out = await findActiveShadowDuplicatesInPeriod(buildMockSupabase(rows), WID, RANGE_MAY);

    expect(out).toHaveLength(1);
    expect(out[0]!.ambiguous).toBe(false);
    expect(out[0]!.candidates[0]!.invoice_number).toBe("ZETA:CCV1:0:196:A:2988");
  });

  it("ShadowTwinCandidate expone due_date y cfe_tipo extraídos del CCV1", async () => {
    const rows = [
      baseShadow({ due_date: "2026-05-15" }),
      baseCcv1({
        due_date: "2026-05-15",
        zeta_metadata: { zeta_customer_voucher_v1: { cfe_tipo: "eFactura" } },
      }),
    ];
    const out = await findActiveShadowDuplicatesInPeriod(buildMockSupabase(rows), WID, RANGE_MAY);

    expect(out).toHaveLength(1);
    const c = out[0]!.candidates[0]!;
    expect(c.due_date).toBe("2026-05-15");
    expect(c.cfe_tipo).toBe("eFactura");
  });

  it("caso real ZETA:2825 / ZETA:2826 simulado: 2 sombras + 2 CCV1s — ambas sombras ambiguas cuando no hay distinción", async () => {
    // Reproduce el caso que motivó este fix: A:2988 "Mayo" y A:2989 "Junio"
    // tenían el mismo monto e issue_date. Sin due_date ni created_at → ambiguedad.
    const rows = [
      baseShadow({ id: "shadow-2825", invoice_number: "ZETA:2825", due_date: null, created_at: null }),
      baseShadow({ id: "shadow-2826", invoice_number: "ZETA:2826", due_date: null, created_at: null }),
      baseCcv1({ id: "ccv1-a", invoice_number: "ZETA:CCV1:0:196:A:2988", due_date: null, created_at: null }),
      baseCcv1({ id: "ccv1-b", invoice_number: "ZETA:CCV1:0:196:A:2989", due_date: null, created_at: null }),
    ];
    const out = await findActiveShadowDuplicatesInPeriod(buildMockSupabase(rows), WID, RANGE_MAY);

    expect(out).toHaveLength(2);
    expect(out[0]!.ambiguous).toBe(true);
    expect(out[1]!.ambiguous).toBe(true);
  });

  it("caso real con due_dates distintos: cada sombra resuelve a su CCV1 correcta → ambiguous: false ambas", async () => {
    // ZETA:2825 vence el 2026-05-15 (como A:2988). ZETA:2826 vence el 2026-06-15 (como A:2989).
    const rows = [
      baseShadow({ id: "shadow-2825", invoice_number: "ZETA:2825", due_date: "2026-05-15" }),
      baseShadow({ id: "shadow-2826", invoice_number: "ZETA:2826", due_date: "2026-06-15" }),
      baseCcv1({ id: "ccv1-a", invoice_number: "ZETA:CCV1:0:196:A:2988", due_date: "2026-05-15" }),
      baseCcv1({ id: "ccv1-b", invoice_number: "ZETA:CCV1:0:196:A:2989", due_date: "2026-06-15" }),
    ];
    const out = await findActiveShadowDuplicatesInPeriod(buildMockSupabase(rows), WID, RANGE_MAY);

    expect(out).toHaveLength(2);

    const s2825 = out.find((d) => d.shadow_invoice_number === "ZETA:2825")!;
    const s2826 = out.find((d) => d.shadow_invoice_number === "ZETA:2826")!;

    expect(s2825.ambiguous).toBe(false);
    expect(s2825.candidates[0]!.invoice_number).toBe("ZETA:CCV1:0:196:A:2988");

    expect(s2826.ambiguous).toBe(false);
    expect(s2826.candidates[0]!.invoice_number).toBe("ZETA:CCV1:0:196:A:2989");
  });
});
