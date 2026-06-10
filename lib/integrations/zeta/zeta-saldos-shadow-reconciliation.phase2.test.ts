import { describe, expect, it, vi } from "vitest";

import {
  classifyPhase2OpenCcv1DuplicateShadows,
  evaluatePhase2OpenCcv1DuplicateShadow,
  operationalDedupeExcludesShadow,
} from "@/lib/integrations/zeta/zeta-saldos-shadow-reconciliation";
import { ZETA_SALDOS_PENDIENTES_CATEGORY } from "@/lib/zeta/zeta-operational-debt-dedup";
import * as dedupeModule from "@/lib/zeta/zeta-operational-debt-dedup";

const COMPANY = "co-phase2";

function shadow(
  id: string,
  num: string,
  balance: number,
  issue = "2026-06-04",
  currency = "UYU"
) {
  return {
    id,
    company_id: COMPANY,
    invoice_number: num,
    balance_amount: balance,
    total_amount: balance,
    currency_code: currency,
    status: "issued",
    issue_date: issue,
    category: ZETA_SALDOS_PENDIENTES_CATEGORY,
    zeta_metadata: null,
  };
}

function ccv1(
  id: string,
  num: string,
  balance: number,
  issue = "2026-06-04",
  currency = "UYU"
) {
  return {
    id,
    company_id: COMPANY,
    invoice_number: num,
    balance_amount: balance,
    total_amount: balance,
    currency_code: currency,
    status: "issued",
    issue_date: issue,
    category: "Zeta / comprobantes por cliente",
    zeta_metadata: null,
  };
}

describe("FASE 2 — open CCV1 duplicate shadows", () => {
  it("cierra candidato cuando shadow duplica CCV1 abierto exacto", () => {
    const invoices = [
      shadow("s1", "ZETA:2754", 17080),
      ccv1("r1", "ZETA:CCV1:0:185:A:2950", 17080),
    ];
    const { candidates, skipped } = classifyPhase2OpenCcv1DuplicateShadows(invoices);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.shadow_id).toBe("s1");
    expect(candidates[0]!.ccv1_id).toBe("r1");
    expect(candidates[0]!.balance_delta).toBe(0);
    expect(candidates[0]!.dedupe_excludes_shadow).toBe(true);
    expect(skipped).toHaveLength(0);
  });

  it("skip si monto distinto", () => {
    const s = shadow("s1", "ZETA:2754", 17080);
    const r = {
      ...ccv1("r1", "ZETA:CCV1:0:185:A:2950", 17000),
      zeta_metadata: {
        zeta_comprobante_identity_v1: { schema_version: 1, registro_id: "2754" },
      },
    };
    const { candidate, skip_reason } = evaluatePhase2OpenCcv1DuplicateShadow(s, [r], [s, r]);
    expect(candidate).toBeNull();
    expect(skip_reason).toBe("balance_mismatch");
  });

  it("skip si moneda distinta", () => {
    const s = shadow("s1", "ZETA:2748", 530.7, "2026-06-04", "USD");
    const r = ccv1("r1", "ZETA:CCV1:0:33:A:2944", 530.7, "2026-06-04", "UYU");
    const { candidate, skip_reason } = evaluatePhase2OpenCcv1DuplicateShadow(s, [r], [s, r]);
    expect(candidate).toBeNull();
    expect(skip_reason).toBe("no_ccv1_pair");
  });

  it("skip si múltiples candidatos CCV1", () => {
    const s = shadow("s1", "ZETA:2760", 21472);
    const { candidate, skip_reason } = evaluatePhase2OpenCcv1DuplicateShadow(
      s,
      [
        ccv1("r1", "ZETA:CCV1:0:42:A:2953", 21472),
        ccv1("r2", "ZETA:CCV1:0:73:A:2960", 21472),
      ],
      [s, ccv1("r1", "ZETA:CCV1:0:42:A:2953", 21472), ccv1("r2", "ZETA:CCV1:0:73:A:2960", 21472)]
    );
    expect(candidate).toBeNull();
    expect(skip_reason).toBe("ambiguous_fallback");
  });

  it("skip si dedupe no excluye shadow", () => {
    const invoices = [
      shadow("s1", "ZETA:2754", 17080),
      ccv1("r1", "ZETA:CCV1:0:185:A:2950", 17080),
    ];
    vi.spyOn(dedupeModule, "selectOperationalDebtInvoicesForSummation").mockReturnValue([
      {
        invoice: shadow("s1", "ZETA:2754", 17080),
        isShadow: true,
        equivalenceKey: "reg:2754",
        skippedShadowIds: [],
      },
    ]);

    expect(operationalDedupeExcludesShadow(invoices, "r1", "s1")).toBe(false);

    const { candidate, skip_reason } = evaluatePhase2OpenCcv1DuplicateShadow(
      invoices[0]!,
      [invoices[1]!],
      invoices
    );
    expect(candidate).toBeNull();
    expect(skip_reason).toBe("dedupe_includes_shadow");

    vi.restoreAllMocks();
  });
});
