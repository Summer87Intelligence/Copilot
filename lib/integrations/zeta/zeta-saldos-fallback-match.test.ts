/**
 * Tests del fallback final del saldos pipeline:
 * match por (company_id + currency + issue_date + total ± 0.20) cuando
 * fallaron RegistroId / CCV1 number / heurístico Serie/Numero.
 */

import { describe, expect, it } from "vitest";
import {
  findFallbackProtoInvoiceForSaldoRow,
  FALLBACK_TOTAL_TOLERANCE,
} from "@/lib/integrations/zeta/zeta-saldos-fallback-match";

type Row = {
  id: string;
  invoice_number: string;
  total_amount: number;
  currency_code: string;
  issue_date: string;
  zeta_metadata?: unknown;
};

/**
 * Mock Supabase client mínimo: emula `.from().select().eq().eq().eq().eq().like()`
 * + cadena `applyProtoActiveListFilter('active')` (extra `.eq('is_active', true)`),
 * y devuelve filas que pasen todos los predicados.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildMockSupabase(rows: Row[]): any {
  const filters: Array<(r: Row) => boolean> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {};
  builder.select = () => builder;
  builder.eq = (col: string, value: unknown) => {
    filters.push((r) => {
      if (col === "is_active") return true; // Las rows mock son todas activas.
      if (col in r) {
        return (r as unknown as Record<string, unknown>)[col] === value;
      }
      return true;
    });
    return builder;
  };
  builder.like = (col: string, value: string) => {
    const re = new RegExp("^" + value.replace(/%/g, ".*").replace(/_/g, ".") + "$");
    filters.push((r) => re.test(String((r as unknown as Record<string, unknown>)[col] ?? "")));
    return builder;
  };
  builder.then = (resolve: (v: { data: Row[]; error: null }) => void) => {
    const out = rows.filter((r) => filters.every((f) => f(r)));
    resolve({ data: out, error: null });
  };
  return {
    from: () => builder,
  };
}

const WID = "ws-1";
const COMPANY = "company-aldiesan";
const DATE = "2026-06-04";
const REG_ID = "2746";

describe("findFallbackProtoInvoiceForSaldoRow — match único", () => {
  it("matchea cuando hay una sola CCV1 activa con mismo company+moneda+fecha+total", async () => {
    const supabase = buildMockSupabase([
      {
        id: "ccv1-1",
        invoice_number: "ZETA:CCV1:0:144:A:2983",
        total_amount: 68320,
        currency_code: "UYU",
        issue_date: DATE,
      },
    ]);
    const out = await findFallbackProtoInvoiceForSaldoRow(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      WID,
      {
        companyId: COMPANY,
        currencyCode: "UYU",
        issueYmd: DATE,
        totalAmount: 68320,
        zetaRegistroId: REG_ID,
      }
    );
    expect(out.kind).toBe("applied");
    if (out.kind === "applied") {
      expect(out.invoice_id).toBe("ccv1-1");
      expect(out.strategy).toBe("company_total_issuedate");
    }
  });

  it("acepta diferencia de centavos dentro de tolerancia 0.20", async () => {
    const supabase = buildMockSupabase([
      {
        id: "ccv1-2",
        invoice_number: "ZETA:CCV1:0:107:A:2970",
        // CCV1 trae 96623.88; saldo trae 96624.00 → diff 0.12 < 0.20
        total_amount: 96623.88,
        currency_code: "UYU",
        issue_date: DATE,
      },
    ]);
    const out = await findFallbackProtoInvoiceForSaldoRow(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      WID,
      {
        companyId: COMPANY,
        currencyCode: "UYU",
        issueYmd: DATE,
        totalAmount: 96624.00,
        zetaRegistroId: REG_ID,
      }
    );
    expect(out.kind).toBe("applied");
  });

  it("rechaza diferencia por encima de la tolerancia", async () => {
    const supabase = buildMockSupabase([
      {
        id: "ccv1-far",
        invoice_number: "ZETA:CCV1:0:144:A:2983",
        total_amount: 68000, // diff 320 → excede tol
        currency_code: "UYU",
        issue_date: DATE,
      },
    ]);
    const out = await findFallbackProtoInvoiceForSaldoRow(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      WID,
      {
        companyId: COMPANY,
        currencyCode: "UYU",
        issueYmd: DATE,
        totalAmount: 68320,
        zetaRegistroId: REG_ID,
      }
    );
    expect(out.kind).toBe("none");
  });
});

describe("findFallbackProtoInvoiceForSaldoRow — ambigüedad y guardas", () => {
  it("retorna ambiguous cuando hay >=2 candidatos compatibles", async () => {
    const supabase = buildMockSupabase([
      {
        id: "ccv1-a",
        invoice_number: "ZETA:CCV1:0:1:A:1241",
        total_amount: 183,
        currency_code: "USD",
        issue_date: DATE,
      },
      {
        id: "ccv1-b",
        invoice_number: "ZETA:CCV1:0:1:A:1243",
        total_amount: 183,
        currency_code: "USD",
        issue_date: DATE,
      },
    ]);
    const out = await findFallbackProtoInvoiceForSaldoRow(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      WID,
      {
        companyId: "company-consumidor-final",
        currencyCode: "USD",
        issueYmd: DATE,
        totalAmount: 183,
        zetaRegistroId: REG_ID,
      }
    );
    expect(out.kind).toBe("ambiguous");
    if (out.kind === "ambiguous") {
      expect(out.candidates).toHaveLength(2);
    }
  });

  it("rechaza candidato cuya metadata tenga otro RegistroId (contradicción)", async () => {
    const supabase = buildMockSupabase([
      {
        id: "ccv1-other",
        invoice_number: "ZETA:CCV1:0:144:A:2983",
        total_amount: 68320,
        currency_code: "UYU",
        issue_date: DATE,
        zeta_metadata: {
          zeta_comprobante_identity_v1: { registro_id: "9999", schema_version: 1 },
        },
      },
    ]);
    const out = await findFallbackProtoInvoiceForSaldoRow(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      WID,
      {
        companyId: COMPANY,
        currencyCode: "UYU",
        issueYmd: DATE,
        totalAmount: 68320,
        zetaRegistroId: "2746",
      }
    );
    expect(out.kind).toBe("none");
  });

  it("validaciones de entrada: rechaza fechas mal formadas / totales 0", async () => {
    const supabase = buildMockSupabase([
      {
        id: "x",
        invoice_number: "ZETA:CCV1:0:1:A:1",
        total_amount: 100,
        currency_code: "UYU",
        issue_date: DATE,
      },
    ]);
    const badDate = await findFallbackProtoInvoiceForSaldoRow(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      WID,
      {
        companyId: COMPANY,
        currencyCode: "UYU",
        issueYmd: "no-date",
        totalAmount: 100,
        zetaRegistroId: "X",
      }
    );
    expect(badDate.kind).toBe("none");

    const zero = await findFallbackProtoInvoiceForSaldoRow(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      WID,
      {
        companyId: COMPANY,
        currencyCode: "UYU",
        issueYmd: DATE,
        totalAmount: 0,
        zetaRegistroId: "X",
      }
    );
    expect(zero.kind).toBe("none");
  });
});

describe("constante de tolerancia", () => {
  it("exporta tolerancia consistente con migración + guardrail motor", () => {
    expect(FALLBACK_TOTAL_TOLERANCE).toBe(0.20);
  });
});
