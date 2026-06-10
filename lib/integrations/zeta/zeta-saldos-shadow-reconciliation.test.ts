import { describe, expect, it } from "vitest";

import {
  classifyShadowCandidatesForCompany,
  pairShadowToRealStrict,
  roundShadowAmount,
} from "@/lib/integrations/zeta/zeta-saldos-shadow-reconciliation";
import { ZETA_SALDOS_PENDIENTES_CATEGORY } from "@/lib/zeta/zeta-operational-debt-dedup";

const COMPANY = "co-1";

function shadow(
  id: string,
  num: string,
  balance: number,
  issue = "2026-05-01",
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
  issue = "2026-05-01",
  currency = "UYU",
  registroId?: string,
  totalAmount = balance
) {
  const meta =
    registroId != null
      ? {
          zeta_comprobante_identity_v1: { schema_version: 1, registro_id: registroId },
        }
      : null;
  return {
    id,
    company_id: COMPANY,
    invoice_number: num,
    balance_amount: balance,
    total_amount: totalAmount,
    currency_code: currency,
    status: balance > 0 ? "issued" : "paid",
    issue_date: issue,
    category: "Zeta / comprobantes por cliente",
    zeta_metadata: meta,
  };
}

describe("pairShadowToRealStrict", () => {
  it("cierra candidato cuando CCV1 emparejado tiene saldo 0", () => {
    const s = shadow("s1", "ZETA:2751", 1830);
    const r = ccv1("r1", "ZETA:CCV1:0:62:A:2947", 0, "2026-06-04", "UYU", "2751");
    const pair = pairShadowToRealStrict(s, [r]);
    expect(pair.skip_reason).toBeNull();
    expect(pair.real?.id).toBe("r1");
    expect(pair.pair_reason).toBe("registro_metadata");
  });

  it("rechaza cuando CCV1 aún tiene saldo", () => {
    const s = shadow("s1", "ZETA:2754", 96624);
    const r = ccv1("r1", "ZETA:CCV1:0:1:A:2970", 96624);
    const pair = pairShadowToRealStrict(s, [r]);
    expect(pair.skip_reason).toBe("ccv1_still_open");
  });

  it("rechaza emparejamiento ambiguo", () => {
    const s = shadow("s1", "ZETA:2760", 21472, "2026-05-01");
    const pair = pairShadowToRealStrict(s, [
      ccv1("r1", "ZETA:CCV1:0:1:A:2953", 0, "2026-05-01", "UYU", "9999", 21472),
      ccv1("r2", "ZETA:CCV1:0:1:A:2960", 0, "2026-05-01", "UYU", "8888", 21472),
    ]);
    expect(pair.skip_reason).toBe("ambiguous_fallback");
  });
});

describe("classifyShadowCandidatesForCompany", () => {
  it("separa candidatos de ccv1_still_open", () => {
    const { candidates, skipped } = classifyShadowCandidatesForCompany([
      shadow("s1", "ZETA:2751", 1830),
      ccv1("r1", "ZETA:CCV1:0:62:A:2947", 0, "2026-06-04", "UYU", "2751"),
      shadow("s2", "ZETA:2754", 100),
      ccv1("r2", "ZETA:CCV1:0:1:A:2970", 100, "2026-05-01", "UYU", "2754"),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.shadow_id).toBe("s1");
    expect(skipped.some((s) => s.skip_reason === "ccv1_still_open")).toBe(true);
  });

  it("redondea montos a 2 decimales", () => {
    expect(roundShadowAmount(318.184)).toBe(318.18);
  });
});
