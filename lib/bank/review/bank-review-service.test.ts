import { describe, expect, it } from "vitest";

import {
  fetchBankReviewRows,
  fetchBankReviewSummary,
} from "@/lib/bank/review/bank-review-service.server";

const WS = "ws-1";

type Row = Record<string, unknown>;

/** Mock de Supabase con soporte de eq/in/count/head para probar el servicio. */
function makeClient(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      let head = false;
      let wantCount = false;
      const eqs: Record<string, unknown> = {};
      const ins: Record<string, unknown[]> = {};
      const isNulls: string[] = [];
      const builder: Record<string, unknown> = {
        select(_cols: string, opts?: { head?: boolean; count?: string }) {
          if (opts?.head) head = true;
          if (opts?.count) wantCount = true;
          return builder;
        },
        eq(c: string, v: unknown) {
          eqs[c] = v;
          return builder;
        },
        in(c: string, v: unknown[]) {
          ins[c] = v;
          return builder;
        },
        is(c: string, v: unknown) {
          if (v === null) isNulls.push(c);
          return builder;
        },
        then(resolve: (v: { data: Row[] | null; error: null; count?: number }) => void) {
          let out = rows;
          for (const [k, v] of Object.entries(eqs)) out = out.filter((r) => r[k] === v);
          for (const [k, v] of Object.entries(ins)) out = out.filter((r) => v.includes(r[k]));
          for (const k of isNulls) out = out.filter((r) => r[k] == null);
          const res: { data: Row[] | null; error: null; count?: number } = {
            data: head ? null : out,
            error: null,
          };
          if (wantCount) res.count = out.length;
          return resolve(res);
        },
      };
      return builder;
    },
  };
}

function sugg(over: Row): Row {
  return {
    workspace_id: WS,
    status: "generated",
    recommended_action: "REVIEW",
    confidence: 50,
    proposed_receipt_id: null,
    proposed_client_id: null,
    reasons: ["MATCHING_RECEIPT", "EXACT_AMOUNT", "DATE_PROXIMITY"],
    warnings: [],
    engine_version: 1,
    ...over,
  };
}

function mv(id: string, over: Row = {}): Row {
  return {
    id,
    workspace_id: WS,
    bank_name: "BANCO",
    account_label: "EASY",
    movement_date: "2026-01-12",
    description: "CREDITO OPERACION",
    raw_description: null,
    amount: 36.6,
    currency: "USD",
    direction: "inflow",
    bank_reference: "OP-123456",
    status: "pending",
    metadata: null,
    ...over,
  };
}

const tables: Record<string, Row[]> = {
  bank_reconciliation_suggestions: [
    sugg({ id: "op1", bank_movement_id: "m1", suggestion_scope: "operational", proposed_receipt_id: "r1", proposed_client_id: "c1" }),
    sugg({ id: "op2", bank_movement_id: "m2", suggestion_scope: "operational" }),
    sugg({ id: "h1", bank_movement_id: "m3", suggestion_scope: "historical_review", proposed_receipt_id: "r3", proposed_client_id: "c3", warnings: ["HISTORICAL_SHADOW_AUDIT"] }),
    sugg({ id: "h2", bank_movement_id: "m4", suggestion_scope: "historical_review", confidence: 25, reasons: ["MULTIPLE_CANDIDATES", "EXACT_AMOUNT"], warnings: ["MULTIPLE_STRONG_CANDIDATES", "HISTORICAL_SHADOW_AUDIT"] }),
  ],
  bank_movements: [mv("m1"), mv("m2", { currency: "UYU", amount: 1830 }), mv("m3"), mv("m4", { currency: "UYU", amount: 17080 })],
  proto_receipts: [
    { id: "r1", workspace_company_id: WS, receipt_date: "2026-01-14", amount: 36.6, currency_code: "USD" },
    { id: "r3", workspace_company_id: WS, receipt_date: "2026-01-13", amount: 36.6, currency_code: "USD" },
  ],
  proto_companies: [
    { id: "c1", workspace_company_id: WS, name: "Alpha SA" },
    { id: "c3", workspace_company_id: WS, name: "Gamma SRL" },
  ],
};

describe("fetchBankReviewSummary — contadores por ámbito", () => {
  it("cuenta operational/historical/matched/pending correctamente", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const summary = await fetchBankReviewSummary(makeClient(tables) as any, WS);
    expect(summary).toEqual({ operational: 2, historical_review: 2, matched_audit: 0, pending: 4 });
  });

  it("pending excluye revisadas (reviewed_at set) y rechazadas (status)", async () => {
    const withReviewed: Record<string, Row[]> = {
      ...tables,
      bank_reconciliation_suggestions: [
        sugg({ id: "op1", bank_movement_id: "m1", suggestion_scope: "operational" }),
        sugg({ id: "h1", bank_movement_id: "m3", suggestion_scope: "historical_review", reviewed_at: "2026-07-20T00:00:00Z" }),
        sugg({ id: "h2", bank_movement_id: "m4", suggestion_scope: "historical_review", status: "rejected" }),
      ],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const summary = await fetchBankReviewSummary(makeClient(withReviewed) as any, WS);
    // op1 activo+sin revisar = 1 pendiente; h1 revisada y h2 rejected no cuentan.
    expect(summary.pending).toBe(1);
  });
});

describe("fetchBankReviewRows — aislamiento estricto por scope", () => {
  it("operational nunca devuelve historical", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await fetchBankReviewRows(makeClient(tables) as any, WS, "operational");
    expect(res.scope).toBe("operational");
    expect(res.total).toBe(2);
    expect(res.rows.map((r) => r.id).sort()).toEqual(["op1", "op2"]);
    expect(res.rows.every((r) => r.suggestionScope === "operational")).toBe(true);
    const op1 = res.rows.find((r) => r.id === "op1")!;
    expect(op1.clientName).toBe("Alpha SA");
    expect(op1.receipt?.date).toBe("2026-01-14");
    expect(op1.evidence.auditOnly).toBe(false);
  });

  it("historical nunca devuelve operational; enriquecido y audit-only", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await fetchBankReviewRows(makeClient(tables) as any, WS, "historical_review");
    expect(res.total).toBe(2);
    expect(res.rows.map((r) => r.id).sort()).toEqual(["h1", "h2"]);
    expect(res.rows.every((r) => r.suggestionScope === "historical_review")).toBe(true);
    expect(res.rows.every((r) => r.evidence.auditOnly === true)).toBe(true);
    const h1 = res.rows.find((r) => r.id === "h1")!;
    expect(h1.clientName).toBe("Gamma SRL");
    expect(h1.evidence.historicalAudit).toBe(true);
    const h2 = res.rows.find((r) => r.id === "h2")!;
    expect(h2.flags.isTie).toBe(true);
    expect(h2.flags.hasReceipt).toBe(false);
  });

  it("matched_audit está vacío", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await fetchBankReviewRows(makeClient(tables) as any, WS, "matched_audit");
    expect(res.total).toBe(0);
    expect(res.rows).toEqual([]);
  });
});
