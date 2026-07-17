import { describe, expect, it } from "vitest";

import {
  matchBankMovement,
  MAX_TIED_RECEIPT_CONFIDENCE,
  selectExactReceiptConservatively,
  type NormalizedBankMovement,
  type ReceiptCandidate,
  type ReconciliationMatchInput,
} from "@/lib/bank/intelligence/reconciliation-matching";

const WS = "ws-A";
const PAYER = "fp-pepito";

function mov(o: Partial<NormalizedBankMovement> = {}): NormalizedBankMovement {
  return {
    id: "m1",
    workspaceId: WS,
    amountMinor: 1_708_000, // 17080.00
    currency: "UYU",
    direction: "inflow",
    date: "2026-06-10",
    payerFingerprintHash: PAYER,
    normalizedPayerName: "desconocido",
    ...o,
  };
}

function receipt(
  id: string,
  clientId: string,
  date: string,
  o: Partial<ReceiptCandidate> = {}
): ReceiptCandidate {
  return {
    receiptId: id,
    clientId,
    workspaceId: WS,
    amountMinor: 1_708_000,
    currency: "UYU",
    date,
    ...o,
  };
}

function base(o: Partial<ReconciliationMatchInput> = {}): ReconciliationMatchInput {
  return {
    movement: mov(),
    clients: [],
    receipts: [],
    invoices: [],
    historicalLinks: [],
    ...o,
  };
}

/** Fixtures que reproducen el dry-run: 4 recibos exactos UYU 17080 en ventana. */
const FOUR_EXACT = [
  receipt("e800db93-c045-414a-be05-575ab5d40fc1", "client-el", "2026-06-08"),
  receipt("704b36dc-19f1-42dd-a70a-a1a8befdc693", "client-a", "2026-06-09"),
  receipt("9276617a-bd92-4e34-819c-18fa68c7219a", "client-b", "2026-06-10"),
  receipt("fc58327c-34ea-4a36-89f8-1c3300d25b27", "client-c", "2026-06-10"),
];

describe("BANK-SHADOW-CORRECTION-001 — ambigüedad de recibos", () => {
  it("1 recibo exacto único → proposedReceiptId definido", () => {
    const r = matchBankMovement(
      base({
        movement: mov({ date: "2026-06-08" }),
        receipts: [FOUR_EXACT[0]!],
      })
    );
    expect(r.receiptId).toBe("e800db93-c045-414a-be05-575ab5d40fc1");
    expect(r.tiedReceiptCandidates ?? []).toHaveLength(0);
    expect(r.warnings).not.toContain("MULTIPLE_STRONG_CANDIDATES");
    expect(r.reasons).toEqual(
      expect.arrayContaining(["MATCHING_RECEIPT", "EXACT_AMOUNT", "DATE_PROXIMITY"])
    );
  });

  it("2 recibos exactos empatados (misma fecha) → receiptId null", () => {
    const r = matchBankMovement(
      base({
        movement: mov({ date: "2026-06-10" }),
        receipts: [
          receipt("r1", "c1", "2026-06-10"),
          receipt("r2", "c2", "2026-06-10"),
        ],
      })
    );
    expect(r.receiptId).toBeUndefined();
    expect(r.recommendedAction).toBe("REVIEW");
    expect(r.warnings).toContain("MULTIPLE_STRONG_CANDIDATES");
    expect(r.confidence).toBeLessThanOrEqual(MAX_TIED_RECEIPT_CONFIDENCE);
    expect(r.tiedReceiptCandidates).toHaveLength(2);
    expect(r.tiedReceiptCandidates?.map((t) => t.receiptId).sort()).toEqual(["r1", "r2"]);
  });

  it("4 recibos exactos empatados → MULTIPLE_STRONG_CANDIDATES + evidence completa", () => {
    // m1 date 2026-06-10: r927 y rfc58 empatan a 0 días; e800 y 704 quedan fuera del top.
    // Wait - scores: day0 > day1 > day2. So two at day0 (927, fc58) tie; not all 4.
    // For all 4 to tie they need same days. Use same date for all.
    const fourSameDay = FOUR_EXACT.map((r) => ({ ...r, date: "2026-06-10" }));
    const r = matchBankMovement(base({ receipts: fourSameDay }));
    expect(r.receiptId).toBeUndefined();
    expect(r.warnings).toContain("MULTIPLE_STRONG_CANDIDATES");
    expect(r.tiedReceiptCandidates).toHaveLength(4);
    expect(r.ambiguityReason).toBe("MULTIPLE_EXACT_AMOUNT_RECEIPTS");
    expect(r.recommendedAction).toBe("REVIEW");
    expect(r.recommendedAction).not.toBe("AUTO_RECONCILE_CANDIDATE");
  });

  it("empate entre clientes distintos", () => {
    const r = matchBankMovement(
      base({
        receipts: [
          receipt("r1", "client-a", "2026-06-10"),
          receipt("r2", "client-b", "2026-06-10"),
        ],
      })
    );
    expect(r.receiptId).toBeUndefined();
    expect(r.clientId).toBeUndefined();
    expect(new Set(r.tiedReceiptCandidates?.map((t) => t.clientId)).size).toBe(2);
  });

  it("empate dentro del mismo cliente", () => {
    const r = matchBankMovement(
      base({
        receipts: [
          receipt("r1", "same-client", "2026-06-10"),
          receipt("r2", "same-client", "2026-06-10"),
        ],
      })
    );
    expect(r.receiptId).toBeUndefined();
    expect(r.warnings).toContain("MULTIPLE_STRONG_CANDIDATES");
    expect(r.tiedReceiptCandidates?.every((t) => t.clientId === "same-client")).toBe(true);
  });

  it("un candidato objetivamente superior por fecha → selecciona + RECEIPT_DATE_DOMINANCE", () => {
    const r = matchBankMovement(
      base({
        movement: mov({ date: "2026-06-10" }),
        receipts: [
          receipt("far", "c1", "2026-06-08"),
          receipt("near", "c2", "2026-06-10"),
        ],
      })
    );
    expect(r.receiptId).toBe("near");
    expect(r.reasons).toContain("RECEIPT_DATE_DOMINANCE");
    expect(r.warnings).not.toContain("MULTIPLE_STRONG_CANDIDATES");
  });

  it("orden de entrada invertido produce el mismo resultado (determinismo)", () => {
    const receiptsA = [
      receipt("r-z", "c1", "2026-06-10"),
      receipt("r-a", "c2", "2026-06-10"),
      receipt("r-m", "c3", "2026-06-09"),
    ];
    const receiptsB = [...receiptsA].reverse();
    const a = matchBankMovement(base({ receipts: receiptsA }));
    const b = matchBankMovement(base({ receipts: receiptsB }));
    expect(a).toEqual(b);
    expect(a.receiptId).toBeUndefined();
    expect(a.tiedReceiptCandidates?.map((t) => t.receiptId)).toEqual(["r-a", "r-z"]);
  });

  it("reproducción dry-run 92327f0d (2026-06-08) con 4 exactos → no elige arbitrario del 08 si hay empate en top", () => {
    // En datos reales del 08-06 el recibo e800 es el único a 0 días; los otros están a 1–2 días.
    // Con dominio por fecha, e800 GANA objetivamente — no es empate.
    const r = matchBankMovement(
      base({
        movement: mov({
          id: "92327f0d-0678-4a12-8d42-71a5cd04add8",
          date: "2026-06-08",
        }),
        receipts: FOUR_EXACT,
      })
    );
    expect(r.receiptId).toBe("e800db93-c045-414a-be05-575ab5d40fc1");
    expect(r.reasons).toContain("RECEIPT_DATE_DOMINANCE");
    expect(r.recommendedAction).not.toBe("AUTO_RECONCILE_CANDIDATE");
  });

  it("reproducción dry-run c8432f4c (2026-06-10) → empate de dos a 0 días, no elige e800 del 08", () => {
    const r = matchBankMovement(
      base({
        movement: mov({
          id: "c8432f4c-611c-4131-be8a-7df83d6bcddb",
          date: "2026-06-10",
        }),
        receipts: FOUR_EXACT,
      })
    );
    expect(r.receiptId).toBeUndefined();
    expect(r.warnings).toContain("MULTIPLE_STRONG_CANDIDATES");
    expect(r.tiedReceiptCandidates?.map((t) => t.receiptId).sort()).toEqual([
      "9276617a-bd92-4e34-819c-18fa68c7219a",
      "fc58327c-34ea-4a36-89f8-1c3300d25b27",
    ]);
    expect(r.recommendedAction).toBe("REVIEW");
  });

  it("no AUTO ante empate aunque haya señales parciales", () => {
    const r = matchBankMovement(
      base({
        historicalLinks: [
          {
            fingerprintHash: PAYER,
            clientId: "c1",
            workspaceId: WS,
            status: "confirmed",
            paymentsCount: 10,
          },
        ],
        // Scoped to c1: two exact for same confirmed client → still tie
        receipts: [
          receipt("r1", "c1", "2026-06-10"),
          receipt("r2", "c1", "2026-06-10"),
        ],
      })
    );
    expect(r.receiptId).toBeUndefined();
    expect(r.recommendedAction).toBe("REVIEW");
    expect(r.recommendedAction).not.toBe("AUTO_RECONCILE_CANDIDATE");
  });

  it("selectExactReceiptConservatively ignora orden del array", () => {
    const movement = mov({ date: "2026-06-10" });
    const a = selectExactReceiptConservatively({
      exactActive: [receipt("b", "c1", "2026-06-10"), receipt("a", "c2", "2026-06-10")],
      movement,
      confirmedClientIds: new Set(),
    });
    const b = selectExactReceiptConservatively({
      exactActive: [receipt("a", "c2", "2026-06-10"), receipt("b", "c1", "2026-06-10")],
      movement,
      confirmedClientIds: new Set(),
    });
    expect(a.winner).toBeNull();
    expect(b.winner).toBeNull();
    expect(a.tied.map((t) => t.receiptId)).toEqual(b.tied.map((t) => t.receiptId));
  });
});
