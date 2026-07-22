import { beforeEach, describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const listPayerClusterSummaries = vi.fn();
const getPayerClusterDetail = vi.fn();
const auditDuplicateBankMovements = vi.fn();

vi.mock("@/lib/bank/canonical/payer-cluster-audit.server", () => ({
  listPayerClusterSummaries: (...args: unknown[]) => listPayerClusterSummaries(...args),
  getPayerClusterDetail: (...args: unknown[]) => getPayerClusterDetail(...args),
}));
vi.mock("@/lib/bank/canonical/duplicate-import-audit.server", () => ({
  auditDuplicateBankMovements: (...args: unknown[]) => auditDuplicateBankMovements(...args),
}));

const {
  deriveRowStatus,
  deriveRowAction,
  deriveCaseStatus,
  unifiedRowStatusLabel,
  listUnifiedReconciliationCases,
  getUnifiedReconciliationCaseDetail,
  operationalReceiptCounts,
  totalsExcludingDuplicateMovements,
} = await import("@/lib/bank/canonical/unified-reconciliation-case");

const WS = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const fakeSb = {} as never;

describe("deriveRowStatus", () => {
  it("marks duplicate rows regardless of level/evidence", () => {
    expect(
      deriveRowStatus({ isDuplicate: true, level: "reconciled_with_receipt", hasCompatibleReceipt: true, evidence: "strong" })
    ).toBe("duplicado");
  });

  it("marks financially linked movements as conciliado", () => {
    expect(deriveRowStatus({ isDuplicate: false, level: "full_reconciliation", hasCompatibleReceipt: true, evidence: "strong" })).toBe(
      "conciliado"
    );
    expect(
      deriveRowStatus({ isDuplicate: false, level: "reconciled_with_receipt", hasCompatibleReceipt: true, evidence: "strong" })
    ).toBe("conciliado");
  });

  it("marks ambiguous evidence as requiere_revision even with a compatible receipt", () => {
    expect(deriveRowStatus({ isDuplicate: false, level: "unidentified", hasCompatibleReceipt: true, evidence: "ambiguous" })).toBe(
      "requiere_revision"
    );
  });

  it("marks no candidate client as sin_cliente", () => {
    expect(deriveRowStatus({ isDuplicate: false, level: "unidentified", hasCompatibleReceipt: false, evidence: "none" })).toBe(
      "sin_cliente"
    );
  });

  it("marks a clear single candidate with a compatible receipt as listo_para_confirmar (identified or not yet)", () => {
    expect(deriveRowStatus({ isDuplicate: false, level: "unidentified", hasCompatibleReceipt: true, evidence: "strong" })).toBe(
      "listo_para_confirmar"
    );
    expect(deriveRowStatus({ isDuplicate: false, level: "client_identified", hasCompatibleReceipt: true, evidence: "probable" })).toBe(
      "listo_para_confirmar"
    );
  });

  it("marks a clear single candidate without a compatible receipt as falta_recibo", () => {
    expect(deriveRowStatus({ isDuplicate: false, level: "missing_receipt", hasCompatibleReceipt: false, evidence: "strong" })).toBe(
      "falta_recibo"
    );
    expect(deriveRowStatus({ isDuplicate: false, level: "unidentified", hasCompatibleReceipt: false, evidence: "probable" })).toBe(
      "falta_recibo"
    );
  });

  it("re-evaluates after a new Zeta receipt appears without requiring re-identification (falta_recibo → listo_para_confirmar)", () => {
    // Same client already identified; only hasCompatibleReceipt flips after sync.
    expect(
      deriveRowStatus({
        isDuplicate: false,
        level: "client_identified",
        hasCompatibleReceipt: false,
        evidence: "strong",
      })
    ).toBe("falta_recibo");
    expect(
      deriveRowStatus({
        isDuplicate: false,
        level: "client_identified",
        hasCompatibleReceipt: true,
        evidence: "strong",
      })
    ).toBe("listo_para_confirmar");
  });
});

describe("deriveRowAction", () => {
  it("maps each row status to exactly one plain-language action", () => {
    expect(deriveRowAction("listo_para_confirmar")).toBe("confirmar_con_recibo");
    expect(deriveRowAction("falta_recibo")).toBe("dejar_pendiente");
    expect(deriveRowAction("sin_cliente")).toBe("buscar_cliente");
    expect(deriveRowAction("requiere_revision")).toBe("elegir_cliente");
    expect(deriveRowAction("conciliado")).toBe("ninguna");
    expect(deriveRowAction("duplicado")).toBe("ninguna");
  });
});

describe("deriveCaseStatus", () => {
  it("is conciliado only when every non-duplicate row is conciliado", () => {
    expect(deriveCaseStatus(["conciliado", "conciliado", "duplicado"], "strong")).toBe("conciliado");
    expect(deriveCaseStatus(["conciliado", "falta_recibo"], "strong")).not.toBe("conciliado");
  });

  it("prioritizes requiere_revision when the payer cluster itself is ambiguous", () => {
    expect(deriveCaseStatus(["listo_para_confirmar", "falta_recibo"], "ambiguous")).toBe("requiere_revision");
  });

  it("is sin_cliente when there is no candidate at all", () => {
    expect(deriveCaseStatus(["sin_cliente"], "none")).toBe("sin_cliente");
  });

  it("is revision_parcial (Nirmex: mix ready + missing receipt) — never listo_para_confirmar", () => {
    const rows = [...Array(5).fill("listo_para_confirmar"), ...Array(8).fill("falta_recibo")] as Parameters<
      typeof deriveCaseStatus
    >[0];
    expect(deriveCaseStatus(rows, "strong")).toBe("revision_parcial");
    expect(deriveCaseStatus([...Array(12).fill("listo_para_confirmar"), "falta_recibo"] as Parameters<typeof deriveCaseStatus>[0], "strong")).toBe(
      "revision_parcial"
    );
  });

  it("is listo_para_confirmar only when every active row is ready (no missing receipts)", () => {
    expect(deriveCaseStatus(["listo_para_confirmar", "listo_para_confirmar"], "strong")).toBe("listo_para_confirmar");
  });

  it("falls back to falta_recibo when nothing is ready and nothing is ambiguous/unclaimed", () => {
    expect(deriveCaseStatus(["falta_recibo", "falta_recibo"], "strong")).toBe("falta_recibo");
  });
});

describe("unifiedRowStatusLabel", () => {
  it("never leaks internal engine vocabulary", () => {
    const labels = Object.values({
      sin_cliente: unifiedRowStatusLabel("sin_cliente"),
      listo: unifiedRowStatusLabel("listo_para_confirmar"),
      falta: unifiedRowStatusLabel("falta_recibo"),
      revision: unifiedRowStatusLabel("requiere_revision"),
      conciliado: unifiedRowStatusLabel("conciliado"),
      duplicado: unifiedRowStatusLabel("duplicado"),
    });
    for (const label of labels) {
      expect(label).not.toMatch(/suggestion|allocation|payer identity|manual draft|pending|matched/i);
    }
  });
});

describe("operationalReceiptCounts / totalsExcludingDuplicateMovements", () => {
  it("subtracts duplicates from missing first (Nirmex 5+9+1dup → 5+8)", () => {
    expect(
      operationalReceiptCounts({
        compatibleReceiptCount: 5,
        missingReceiptCount: 9,
        duplicateExcludedCount: 1,
      })
    ).toEqual({ receiptsFoundCount: 5, missingReceiptCount: 8 });
  });

  it("excludes duplicate amounts from totals", () => {
    expect(
      totalsExcludingDuplicateMovements(
        { UYU: 160207 },
        ["m0", "m-dup", "m1"],
        [{ duplicateMovementIds: ["m-dup"], canonicalMovementId: "m0", amount: 7567, currency: "UYU" }]
      )
    ).toEqual({ UYU: 152640 });
  });
});

describe("listUnifiedReconciliationCases", () => {
  beforeEach(() => {
    listPayerClusterSummaries.mockReset();
    auditDuplicateBankMovements.mockReset();
  });

  it("excludes import duplicates from card counts and totals (Nirmex 14→13)", async () => {
    const movementIds = Array.from({ length: 14 }, (_, i) => (i === 13 ? "m-dup" : `m${i}`));
    listPayerClusterSummaries.mockResolvedValueOnce({
      clusters: [
        {
          clusterKey: "NIRMEX",
          displayName: "NIRMEX S A CIRCUNVALACION M",
          months: ["2026-01", "2026-07"],
          currencies: ["UYU"],
          totalByCurrency: { UYU: 160207 },
          movementCount: 14,
          movementIds,
          clientMatches: [{ clientCompanyId: "client-1", clientName: "Nirmex S.A.", matchType: "contains" }],
          evidence: "probable",
          compatibleReceiptCount: 5,
          missingReceiptCount: 9,
          alreadyIdentifiedCount: 5,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 5000,
    });
    auditDuplicateBankMovements.mockResolvedValueOnce([
      {
        fingerprint: "fp1",
        movementIds: ["m0", "m-dup"],
        canonicalMovementId: "m0",
        duplicateMovementIds: ["m-dup"],
        canonicalReason: "has_identification" as const,
        movementDate: "2026-04-10",
        amount: 7567,
        currency: "UYU",
        bankReference: "TR0082544541",
      },
    ]);

    const result = await listUnifiedReconciliationCases(fakeSb, {
      workspaceId: WS,
      from: "2026-01-01",
      to: "2026-07-31",
      page: 1,
      pageSize: 25,
    });

    expect(listPayerClusterSummaries).toHaveBeenCalledWith(fakeSb, expect.objectContaining({ workspaceId: WS }));
    expect(auditDuplicateBankMovements).toHaveBeenCalled();
    expect(result.cases).toHaveLength(1);
    expect(result.cases[0]).toMatchObject({
      clusterKey: "NIRMEX",
      suggestedClientName: "Nirmex S.A.",
      status: "revision_parcial",
      recommendedAction: "Revisar movimientos",
      movementCount: 13,
      duplicateExcludedCount: 1,
      receiptsFoundCount: 5,
      missingReceiptCount: 8,
      totalByCurrency: { UYU: 152640 },
    });
  });

  it("filters by status in memory after composing summaries", async () => {
    auditDuplicateBankMovements.mockResolvedValueOnce([]);
    listPayerClusterSummaries.mockResolvedValueOnce({
      clusters: [
        {
          clusterKey: "A",
          displayName: "A",
          months: [],
          currencies: ["UYU"],
          totalByCurrency: {},
          movementCount: 1,
          movementIds: ["a1"],
          clientMatches: [],
          evidence: "none" as const,
          compatibleReceiptCount: 0,
          missingReceiptCount: 1,
          alreadyIdentifiedCount: 0,
        },
        {
          clusterKey: "B",
          displayName: "B",
          months: [],
          currencies: ["UYU"],
          totalByCurrency: {},
          movementCount: 1,
          movementIds: ["b1"],
          clientMatches: [{ clientCompanyId: "c2", clientName: "B Client", matchType: "exact" as const }],
          evidence: "strong" as const,
          compatibleReceiptCount: 1,
          missingReceiptCount: 0,
          alreadyIdentifiedCount: 0,
        },
      ],
      total: 2,
      page: 1,
      pageSize: 5000,
    });

    const result = await listUnifiedReconciliationCases(fakeSb, {
      workspaceId: WS,
      from: "2026-01-01",
      to: "2026-07-31",
      page: 1,
      pageSize: 25,
      status: "sin_cliente",
    });

    expect(result.total).toBe(1);
    expect(result.cases[0]!.clusterKey).toBe("A");
  });
});

describe("getUnifiedReconciliationCaseDetail", () => {
  beforeEach(() => {
    getPayerClusterDetail.mockReset();
    auditDuplicateBankMovements.mockReset();
  });

  it("returns null when the cluster no longer exists", async () => {
    getPayerClusterDetail.mockResolvedValueOnce(null);
    const result = await getUnifiedReconciliationCaseDetail(fakeSb, { workspaceId: WS, from: "2026-01-01", to: "2026-07-31", clusterKey: "GONE" });
    expect(result).toBeNull();
    expect(auditDuplicateBankMovements).not.toHaveBeenCalled();
  });

  it("excludes duplicate movements from counts, status, and the batch-eligible list (Nirmex 14->13 shape)", async () => {
    type FixtureMovement = {
      movementId: string;
      date: string;
      amount: number;
      currency: string;
      referenceMasked: string | null;
      hasCompatibleReceipt: boolean;
      hasFinancialLink: boolean;
      alreadyIdentifiedClientId: string | null;
      level: "unidentified" | "client_identified" | "missing_receipt" | "reconciled_with_receipt" | "full_reconciliation";
    };
    const movements: FixtureMovement[] = Array.from({ length: 13 }, (_, i) => ({
      movementId: `m${i}`,
      date: "2026-04-10",
      amount: 7567,
      currency: "UYU",
      referenceMasked: "••••4541",
      hasCompatibleReceipt: i < 12,
      hasFinancialLink: false,
      alreadyIdentifiedClientId: i < 12 ? "client-1" : null,
      level: i < 12 ? "client_identified" : "missing_receipt",
    }));
    // 14th row is a duplicate of movement m0's operation.
    movements.push({
      movementId: "m-dup",
      date: "2026-04-10",
      amount: 7567,
      currency: "UYU",
      referenceMasked: "••••4541",
      hasCompatibleReceipt: true,
      hasFinancialLink: false,
      alreadyIdentifiedClientId: null,
      level: "unidentified" as const,
    });

    getPayerClusterDetail.mockResolvedValueOnce({
      clusterKey: "NIRMEX",
      displayName: "NIRMEX S A CIRCUNVALACION M",
      months: ["2026-04"],
      currencies: ["UYU"],
      totalByCurrency: { UYU: 7567 * 14 },
      movementCount: 14,
      movementIds: movements.map((m) => m.movementId),
      clientMatches: [{ clientCompanyId: "client-1", clientName: "Nirmex S.A.", matchType: "contains" }],
      evidence: "probable",
      compatibleReceiptCount: 13,
      missingReceiptCount: 1,
      alreadyIdentifiedCount: 12,
      movements,
    });
    auditDuplicateBankMovements.mockResolvedValueOnce([
      {
        fingerprint: "fp1",
        movementIds: ["m0", "m-dup"],
        canonicalMovementId: "m0",
        duplicateMovementIds: ["m-dup"],
        canonicalReason: "has_identification" as const,
        movementDate: "2026-04-10",
        amount: 7567,
        currency: "UYU",
        bankReference: "TR0082544541",
      },
    ]);

    const result = await getUnifiedReconciliationCaseDetail(fakeSb, {
      workspaceId: WS,
      from: "2026-04-01",
      to: "2026-04-30",
      clusterKey: "NIRMEX",
    });

    expect(result).not.toBeNull();
    expect(result!.rows).toHaveLength(14);
    const dupRow = result!.rows.find((r) => r.movementId === "m-dup")!;
    expect(dupRow.status).toBe("duplicado");
    expect(dupRow.action).toBe("ninguna");
    expect(dupRow.canonicalMovementId).toBe("m0");
    // Case-level counts recomputed WITHOUT the duplicate.
    expect(result!.movementCount).toBe(13);
    expect(result!.duplicateExcludedCount).toBe(1);
    expect(result!.totalByCurrency).toEqual({ UYU: 7567 * 13 });
    expect(result!.receiptsFoundCount).toBe(12);
    expect(result!.missingReceiptCount).toBe(1);
    expect(result!.batchEligibleMovementIds).not.toContain("m-dup");
    const readyIds = result!.rows.filter((r) => r.status === "listo_para_confirmar").map((r) => r.movementId);
    expect(readyIds).toHaveLength(12);
    expect(result!.batchEligibleMovementIds.sort()).toEqual(readyIds.sort());
    // Business-language row fields for the unified drawer (cliente + factura).
    expect(result!.rows[0]).toMatchObject({
      clientLabel: "Nirmex S.A.",
      invoiceContextLabel: "—",
    });
    const missingReceipt = result!.rows.find((r) => r.movementId === "m12")!;
    expect(missingReceipt.status).toBe("falta_recibo");
    expect(missingReceipt.hasCompatibleReceipt).toBe(false);
    expect(result!.status).toBe("revision_parcial");
    expect(result!.recommendedAction).toBe("Revisar movimientos");
  });

  it("labels invoice context from reconciliation level without inventing allocations", async () => {
    getPayerClusterDetail.mockResolvedValueOnce({
      clusterKey: "BOTICA",
      displayName: "BOTICA",
      months: ["2026-04"],
      currencies: ["UYU"],
      totalByCurrency: { UYU: 1000 },
      movementCount: 2,
      movementIds: ["r1", "r2"],
      clientMatches: [{ clientCompanyId: "c1", clientName: "Botica", matchType: "exact" }],
      evidence: "strong",
      compatibleReceiptCount: 2,
      missingReceiptCount: 0,
      alreadyIdentifiedCount: 2,
      movements: [
        {
          movementId: "r1",
          date: "2026-04-01",
          amount: 500,
          currency: "UYU",
          referenceMasked: null,
          hasCompatibleReceipt: true,
          hasFinancialLink: true,
          alreadyIdentifiedClientId: "c1",
          level: "reconciled_with_receipt" as const,
        },
        {
          movementId: "r2",
          date: "2026-04-02",
          amount: 500,
          currency: "UYU",
          referenceMasked: null,
          hasCompatibleReceipt: true,
          hasFinancialLink: true,
          alreadyIdentifiedClientId: "c1",
          level: "full_reconciliation" as const,
        },
      ],
    });
    auditDuplicateBankMovements.mockResolvedValueOnce([]);

    const result = await getUnifiedReconciliationCaseDetail(fakeSb, {
      workspaceId: WS,
      from: "2026-04-01",
      to: "2026-04-30",
      clusterKey: "BOTICA",
    });

    expect(result!.rows.find((r) => r.movementId === "r1")!.invoiceContextLabel).toBe("Sin factura comprobada");
    expect(result!.rows.find((r) => r.movementId === "r2")!.invoiceContextLabel).toBe("Factura comprobada");
    expect(result!.status).toBe("conciliado");
  });

  it("passes the cluster's own movement date range to the duplicate audit, not the full workspace window", async () => {
    getPayerClusterDetail.mockResolvedValueOnce({
      clusterKey: "X",
      displayName: "X",
      months: [],
      currencies: ["UYU"],
      totalByCurrency: {},
      movementCount: 2,
      movementIds: ["a", "b"],
      clientMatches: [],
      evidence: "none",
      compatibleReceiptCount: 0,
      missingReceiptCount: 2,
      alreadyIdentifiedCount: 0,
      movements: [
        {
          movementId: "a",
          date: "2026-02-01",
          amount: 100,
          currency: "UYU",
          referenceMasked: null,
          hasCompatibleReceipt: false,
          hasFinancialLink: false,
          alreadyIdentifiedClientId: null,
          level: "unidentified" as const,
        },
        {
          movementId: "b",
          date: "2026-05-01",
          amount: 100,
          currency: "UYU",
          referenceMasked: null,
          hasCompatibleReceipt: false,
          hasFinancialLink: false,
          alreadyIdentifiedClientId: null,
          level: "unidentified" as const,
        },
      ],
    });
    auditDuplicateBankMovements.mockResolvedValueOnce([]);

    await getUnifiedReconciliationCaseDetail(fakeSb, { workspaceId: WS, from: "2026-01-01", to: "2026-12-31", clusterKey: "X" });

    expect(auditDuplicateBankMovements).toHaveBeenCalledWith(fakeSb, WS, "2026-02-01", "2026-05-01");
  });
});
