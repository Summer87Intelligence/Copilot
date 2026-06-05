import { describe, expect, it } from "vitest";

import type { DataRow } from "@/lib/data/proto-operational-read-repository";
import { dedupeZetaShadowInvoicesForReporting } from "@/lib/copilot-zeta-invoice-report-dedup";

function inv(overrides: Partial<DataRow> = {}): DataRow {
  return {
    id: "i1",
    issue_date: "2026-06-04",
    total_amount: 530.7,
    currency_code: "USD",
    company_id: "dobsura",
    invoice_number: "ZETA:CCV1:0:33:A:2944",
    is_active: true,
    status: "issued",
    zeta_metadata: {
      zeta_customer_voucher_v1: { serie: "A", numero: "2944" },
    },
    ...overrides,
  };
}

describe("dedupeZetaShadowInvoicesForReporting", () => {
  it("elimina legacy ZETA:{RegistroId} cuando coincide CCV1 por fecha/monto/moneda", () => {
    const ccv1 = inv({ id: "ccv1" });
    const legacy = inv({
      id: "legacy",
      invoice_number: "ZETA:2748",
      zeta_metadata: { zeta_reconciliation: { source: "saldos" } },
    });

    const out = dedupeZetaShadowInvoicesForReporting([ccv1, legacy]);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("ccv1");
  });

  it("deduplica por RegistroId en metadata aunque invoice_number difiera", () => {
    const a = inv({
      id: "a",
      invoice_number: "ZETA:2748",
      zeta_metadata: { zeta_comprobante_identity_v1: { registro_id: "2748" } },
    });
    const b = inv({
      id: "b",
      invoice_number: "ZETA:CCV1:0:33:A:2944",
      zeta_metadata: {
        zeta_comprobante_identity_v1: { registro_id: "2748" },
        zeta_customer_voucher_v1: { serie: "A", numero: "2944", zeta_registro_id: "2748" },
      },
    });

    const out = dedupeZetaShadowInvoicesForReporting([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("b");
  });

  it("no elimina facturas distintas del mismo cliente", () => {
    const a = inv({ id: "a", total_amount: 100 });
    const b = inv({ id: "b", total_amount: 200, invoice_number: "ZETA:CCV1:0:33:A:2945" });
    expect(dedupeZetaShadowInvoicesForReporting([a, b])).toHaveLength(2);
  });
});
