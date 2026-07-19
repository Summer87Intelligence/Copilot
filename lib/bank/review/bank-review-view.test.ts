import { describe, expect, it } from "vitest";

import {
  applyBankReviewFilters,
  buildBankReviewRow,
  daysBetween,
  findBankReviewRow,
  maskDescription,
  maskReference,
  scopeForTab,
  shortId,
  type BankReviewRow,
} from "@/lib/bank/review/bank-review-view";

function suggestion(over: Partial<Parameters<typeof buildBankReviewRow>[0]["suggestion"]> = {}) {
  return {
    id: "sug-1",
    bankMovementId: "3e194c1d-f0bd-4230-82e7-6be3d1bf39fc",
    suggestionScope: "historical_review" as const,
    status: "generated",
    recommendedAction: "REVIEW",
    confidence: 50,
    proposedReceiptId: "4eca15e7-c767-447a-bc25-1b7c1d13993d",
    proposedClientId: "32c1b2b6-16df-4b73-be8d-4a142f445ab9",
    reasons: ["MATCHING_RECEIPT", "EXACT_AMOUNT", "DATE_PROXIMITY"],
    warnings: ["HISTORICAL_SHADOW_AUDIT"],
    engineVersion: 1,
    reviewedAt: null,
    rejectedReason: null,
    ...over,
  };
}

function movement(over: Partial<Parameters<typeof buildBankReviewRow>[0]["movement"]> = {}) {
  return {
    movementDate: "2026-01-12",
    amount: 36.6,
    currency: "USD",
    description: "CREDITO OPERACION EN BANCO XYZ",
    direction: "inflow",
    status: "pending",
    bankReference: "OP-99887766",
    movementFingerprint: "abcdef0123456789",
    payerFingerprint: "fedcba9876543210",
    ...over,
  };
}

function build(over: {
  suggestion?: Partial<ReturnType<typeof suggestion>>;
  movement?: Partial<ReturnType<typeof movement>>;
  receipt?: Parameters<typeof buildBankReviewRow>[0]["receipt"];
  client?: Parameters<typeof buildBankReviewRow>[0]["client"];
} = {}): BankReviewRow {
  return buildBankReviewRow({
    suggestion: suggestion(over.suggestion),
    movement: movement(over.movement),
    receipt: over.receipt === undefined ? { receiptDate: "2026-01-14", amount: 36.6, currencyCode: "USD" } : over.receipt,
    client: over.client === undefined ? { name: "Cliente Uno" } : over.client,
  });
}

describe("helpers puros", () => {
  it("shortId corta a 8 y tolera null", () => {
    expect(shortId("3e194c1d-f0bd-4230")).toBe("3e194c1d");
    expect(shortId(null)).toBeNull();
  });

  it("maskDescription colapsa y enmascara largos; conserva cortos", () => {
    expect(maskDescription("  CREDITO   OPERACION EN BANCO ")).toBe("CREDIT… BANCO");
    expect(maskDescription("PAGO")).toBe("PAGO");
    expect(maskDescription("")).toBe("—");
  });

  it("maskReference deja últimos 4", () => {
    expect(maskReference("OP-99887766")).toBe("••••7766");
    expect(maskReference(null)).toBeNull();
  });

  it("daysBetween absoluto y tolerante", () => {
    expect(daysBetween("2026-01-14", "2026-01-12")).toBe(2);
    expect(daysBetween("2026-01-12", "2026-01-14")).toBe(2);
    expect(daysBetween("bad", "2026-01-12")).toBeNull();
  });

  it("scopeForTab mapea correctamente", () => {
    expect(scopeForTab("operational")).toBe("operational");
    expect(scopeForTab("historical")).toBe("historical_review");
    expect(scopeForTab("matched")).toBe("matched_audit");
  });
});

describe("buildBankReviewRow — evidencia y clasificación", () => {
  it("candidato único histórico: evidencia + audit-only + fecha proximidad", () => {
    const row = build();
    expect(row.suggestionScope).toBe("historical_review");
    expect(row.evidence.exactAmount).toBe(true);
    expect(row.evidence.dateProximityDays).toBe(2);
    expect(row.evidence.historicalAudit).toBe(true);
    expect(row.evidence.auditOnly).toBe(true);
    expect(row.evidence.suggestedAction).toBe("Review");
    expect(row.flags).toEqual({ hasReceipt: true, isTie: false, isSinEvidencia: false });
    expect(row.movementIdShort).toBe("3e194c1d");
    expect(row.receiptIdShort).toBe("4eca15e7");
  });

  it("empate: REVIEW sin recibo → isTie, multipleCandidates", () => {
    const row = build({
      suggestion: {
        proposedReceiptId: null,
        proposedClientId: null,
        confidence: 25,
        reasons: ["MULTIPLE_CANDIDATES", "EXACT_AMOUNT"],
        warnings: ["MULTIPLE_STRONG_CANDIDATES", "HISTORICAL_SHADOW_AUDIT"],
      },
      receipt: null,
      client: null,
    });
    expect(row.flags.isTie).toBe(true);
    expect(row.flags.hasReceipt).toBe(false);
    expect(row.evidence.multipleCandidates).toBe(true);
    expect(row.evidence.dateProximityDays).toBeNull();
  });

  it("SIN_EVIDENCIA: UNIDENTIFIED → isSinEvidencia", () => {
    const row = build({
      suggestion: { recommendedAction: "UNIDENTIFIED", confidence: 0, proposedReceiptId: null, proposedClientId: null, reasons: [], warnings: ["HISTORICAL_SHADOW_AUDIT"] },
      receipt: null,
      client: null,
    });
    expect(row.flags.isSinEvidencia).toBe(true);
    expect(row.flags.isTie).toBe(false);
  });

  it("operational: auditOnly=false", () => {
    const row = build({ suggestion: { suggestionScope: "operational", warnings: [] } });
    expect(row.evidence.auditOnly).toBe(false);
    expect(row.evidence.historicalAudit).toBe(false);
  });
});

describe("applyBankReviewFilters", () => {
  const rows: BankReviewRow[] = [
    build({ suggestion: { id: "a", suggestionScope: "historical_review" }, movement: { currency: "USD", amount: 36.6 }, client: { name: "Alpha SA" } }),
    build({ suggestion: { id: "b", proposedReceiptId: null, proposedClientId: null, confidence: 25, recommendedAction: "REVIEW" }, movement: { currency: "UYU", amount: 17080 }, receipt: null, client: null }),
    build({ suggestion: { id: "c", recommendedAction: "UNIDENTIFIED", confidence: 0, proposedReceiptId: null, proposedClientId: null, reasons: [] }, movement: { currency: "UYU", amount: 108.45 }, receipt: null, client: null }),
  ];

  it("moneda", () => {
    expect(applyBankReviewFilters(rows, { currency: "USD" }).map((r) => r.id)).toEqual(["a"]);
  });
  it("confidence bucket", () => {
    expect(applyBankReviewFilters(rows, { confidence: "high" }).map((r) => r.id)).toEqual(["a"]);
    expect(applyBankReviewFilters(rows, { confidence: "low" }).map((r) => r.id)).toEqual(["c"]);
  });
  it("evidencia has/no receipt + tie + sin_evidencia", () => {
    expect(applyBankReviewFilters(rows, { evidence: "has_receipt" }).map((r) => r.id)).toEqual(["a"]);
    expect(applyBankReviewFilters(rows, { evidence: "no_receipt" }).map((r) => r.id).sort()).toEqual(["b", "c"]);
    expect(applyBankReviewFilters(rows, { evidence: "tie" }).map((r) => r.id)).toEqual(["b"]);
    expect(applyBankReviewFilters(rows, { evidence: "sin_evidencia" }).map((r) => r.id)).toEqual(["c"]);
  });
  it("cliente substring", () => {
    expect(applyBankReviewFilters(rows, { client: "alpha" }).map((r) => r.id)).toEqual(["a"]);
  });
  it("búsqueda por importe / id / fingerprint", () => {
    expect(applyBankReviewFilters(rows, { q: "17080" }).map((r) => r.id)).toEqual(["b"]);
    expect(applyBankReviewFilters(rows, { q: "3e194c1d" }).length).toBe(3); // mismo movement id de fixture
    expect(applyBankReviewFilters(rows, { q: "fedcba98" }).length).toBe(3); // payer fingerprint
  });
});

describe("estado de revisión (Modelo A) + filtro review", () => {
  it("deriva pending/reviewed/rejected desde status + reviewed_at", () => {
    expect(build({ suggestion: { status: "generated", reviewedAt: null } }).reviewState).toBe("pending");
    expect(build({ suggestion: { status: "generated", reviewedAt: "2026-07-20T00:00:00Z" } }).reviewState).toBe("reviewed");
    expect(build({ suggestion: { status: "rejected", reviewedAt: "2026-07-20T00:00:00Z", rejectedReason: "dup" } }).reviewState).toBe("rejected");
  });

  it("filtra por estado de revisión", () => {
    const rows: BankReviewRow[] = [
      build({ suggestion: { id: "p", status: "generated", reviewedAt: null } }),
      build({ suggestion: { id: "r", status: "generated", reviewedAt: "2026-07-20T00:00:00Z" } }),
      build({ suggestion: { id: "x", status: "rejected", reviewedAt: "2026-07-20T00:00:00Z", rejectedReason: "no" } }),
    ];
    expect(applyBankReviewFilters(rows, { review: "pending" }).map((r) => r.id)).toEqual(["p"]);
    expect(applyBankReviewFilters(rows, { review: "reviewed" }).map((r) => r.id)).toEqual(["r"]);
    expect(applyBankReviewFilters(rows, { review: "rejected" }).map((r) => r.id)).toEqual(["x"]);
  });
});

describe("findBankReviewRow (apertura de drawer)", () => {
  it("encuentra por id o null", () => {
    const rows = [build({ suggestion: { id: "x" } }), build({ suggestion: { id: "y" } })];
    expect(findBankReviewRow(rows, "y")?.id).toBe("y");
    expect(findBankReviewRow(rows, "zzz")).toBeNull();
    expect(findBankReviewRow(rows, null)).toBeNull();
  });
});
