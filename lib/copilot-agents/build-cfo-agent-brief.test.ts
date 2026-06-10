import { describe, expect, it } from "vitest";
import { buildCfoAgentBrief } from "./build-cfo-agent-brief";
import type { CopilotNotification } from "@/lib/copilot-notifications/notification-types";
import type { FinancialSnapshotApiV1 } from "@/lib/copilot-financial-engine";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNotif(overrides: Partial<CopilotNotification>): CopilotNotification {
  return {
    id: "n1",
    workspace_company_id: "ws1",
    type: "treasury_payment_due",
    severity: "warning",
    title: "Pago próximo",
    body: null,
    entity_type: null,
    entity_id: null,
    amount: null,
    currency: null,
    action_href: "/copilot/tesoreria?section=pagos",
    dedup_key: null,
    metadata: {},
    read_at: null,
    created_at: "2026-05-25T10:00:00Z",
    ...overrides,
  };
}

function makeSnapshot(
  projected: Partial<{ liquidity_balance: number; coverage_ratio: number; risk_band: string }> = {},
  overrides: Partial<FinancialSnapshotApiV1> = {}
): FinancialSnapshotApiV1 {
  return {
    // legacy flat fields (fallbacks for selectors)
    available_cash: 50000,
    expected_inflows: 80000,
    expected_outflows: 40000,
    projected_balance: 90000,
    coverage_ratio: projected.coverage_ratio ?? 2.25,
    risk_level: (projected.risk_band ?? "low") as FinancialSnapshotApiV1["risk_level"],
    // canonical v1
    metrics_schema_version: "1.0.0",
    as_of_date: "2026-05-25",
    meta: {
      tenant_scope: "workspace_company_id",
      currency: "UYU",
      amount_scale: "unit",
      fiscal_expected_horizon_days: 30,
      operational_outflows_scope: "payment_date_strictly_after_as_of",
      receivables_expected_scope: "all_open_invoice_rows_in_load",
      balance_authoritative_source: "proto_invoices",
      row_cap: 2000,
    },
    realized: { cash_net: 50000, receipts_gross: 200000, payments_gross: 150000, tax_paid_ltd: 0 },
    expected: {
      receivables_open_balance: 100000,
      receivables_risk_weighted: 80000,
      outflows_operational_scheduled: 30000,
      outflows_fiscal_due: 10000,
    },
    projected: {
      liquidity_balance: projected.liquidity_balance ?? 90000,
      coverage_ratio: projected.coverage_ratio ?? 2.25,
      risk_band: (projected.risk_band ?? "low") as FinancialSnapshotApiV1["risk_level"],
    },
    diagnostics: {
      invoice_financials_coverage: "full" as const,
      balance_source: "proto_invoices",
      divergences: [],
      dataset_caps: {
        row_cap: 2000,
        isTruncated: false,
        tables_at_cap: [],
        truncation_unknown: false,
        note: "",
      },
      engine_notes: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      snapshot_load: {} as any,
    },
    ...overrides,
  } as FinancialSnapshotApiV1;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("buildCfoAgentBrief", () => {
  it("sin señales → stable, sin prioridades", () => {
    const result = buildCfoAgentBrief({});
    expect(result.agentId).toBe("cfo");
    expect(result.status).toBe("stable");
    expect(result.priorities).toHaveLength(0);
    expect(result.nextBestAction).toEqual({ label: "Ver Finanzas", href: "/copilot/finanzas" });
  });

  it("cash_risk_detected notification → prioridad revisar liquidez (critical)", () => {
    const notifications = [
      makeNotif({
        type: "cash_risk_detected",
        severity: "critical",
        body: "Los egresos próximos pueden superar la caja.",
      }),
    ];
    const result = buildCfoAgentBrief({ notifications });
    expect(result.status).toBe("critical");
    const p = result.priorities.find((x) => x.id === "cfo-cash-risk");
    expect(p).toBeDefined();
    expect(p!.severity).toBe("critical");
    expect(p!.href).toBe("/copilot/finanzas");
  });

  it("client_overdue notifications → prioridad cartera vencida", () => {
    const notifications = [
      makeNotif({ id: "n1", type: "client_overdue", severity: "warning" }),
      makeNotif({ id: "n2", type: "client_overdue", severity: "warning" }),
    ];
    const result = buildCfoAgentBrief({ notifications });
    const p = result.priorities.find((x) => x.id === "cfo-cartera-vencida");
    expect(p).toBeDefined();
    expect(p!.reason).toContain("2 clientes");
    expect(p!.href).toBe("/copilot/cartera");
  });

  it("client_overdue critical → severity high", () => {
    const notifications = [
      makeNotif({ type: "client_overdue", severity: "critical" }),
    ];
    const result = buildCfoAgentBrief({ notifications });
    const p = result.priorities.find((x) => x.id === "cfo-cartera-vencida");
    expect(p!.severity).toBe("high");
  });

  it("sync_failed critical → prioridad validar datos severity high", () => {
    const notifications = [
      makeNotif({ type: "sync_failed", severity: "critical" }),
    ];
    const result = buildCfoAgentBrief({ notifications });
    const p = result.priorities.find((x) => x.id === "cfo-data-integrity");
    expect(p).toBeDefined();
    expect(p!.severity).toBe("high");
    expect(p!.href).toBe("/copilot/alertas");
  });

  it("sync_failed warning → prioridad validar datos severity medium", () => {
    const notifications = [
      makeNotif({ type: "sync_failed", severity: "warning" }),
    ];
    const result = buildCfoAgentBrief({ notifications });
    const p = result.priorities.find((x) => x.id === "cfo-data-integrity");
    expect(p!.severity).toBe("medium");
  });

  it("treasury overdue → prioridad egresos severity high", () => {
    const notifications = [
      makeNotif({ type: "treasury_payment_overdue", severity: "critical", amount: 5000, currency: "UYU" }),
    ];
    const result = buildCfoAgentBrief({ notifications });
    const p = result.priorities.find((x) => x.id === "cfo-egresos");
    expect(p).toBeDefined();
    expect(p!.severity).toBe("high");
    expect(p!.amount).toBe(5000);
    expect(p!.currency).toBe("UYU");
    expect(p!.href).toBe("/copilot/tesoreria?section=pagos");
  });

  it("solo treasury_payment_due (no overdue) → egresos severity medium", () => {
    const notifications = [
      makeNotif({ type: "treasury_payment_due", severity: "warning" }),
    ];
    const result = buildCfoAgentBrief({ notifications });
    const p = result.priorities.find((x) => x.id === "cfo-egresos");
    expect(p!.severity).toBe("medium");
  });

  it("notification sin amount → no inventa monto", () => {
    const notifications = [
      makeNotif({ type: "treasury_payment_due", amount: null, currency: null }),
    ];
    const result = buildCfoAgentBrief({ notifications });
    const p = result.priorities.find((x) => x.id === "cfo-egresos");
    expect(p!.amount).toBeUndefined();
    expect(p!.currency).toBeUndefined();
  });

  it("snapshot risk_band critical → liquidez prioridad critical, no se duplica con cash_risk", () => {
    const snapshot = makeSnapshot({ risk_band: "critical", liquidity_balance: -5000, coverage_ratio: 0.3 });
    const notifications = [makeNotif({ type: "cash_risk_detected", severity: "critical" })];
    const result = buildCfoAgentBrief({ notifications, financialSnapshot: snapshot });
    // liquidez del snapshot tiene prioridad; no se duplica con cash_risk
    const liquidityPriority = result.priorities.filter((p) => p.id === "cfo-liquidity-critical");
    const cashRiskPriority = result.priorities.filter((p) => p.id === "cfo-cash-risk");
    expect(liquidityPriority).toHaveLength(1);
    expect(cashRiskPriority).toHaveLength(0);
    expect(result.status).toBe("critical");
  });

  it("snapshot risk_band high → severity high en liquidez", () => {
    const snapshot = makeSnapshot({ risk_band: "high", liquidity_balance: 5000, coverage_ratio: 0.8 });
    const result = buildCfoAgentBrief({ financialSnapshot: snapshot });
    const p = result.priorities.find((x) => x.id === "cfo-liquidity-high");
    expect(p).toBeDefined();
    expect(p!.severity).toBe("high");
    expect(result.status).toBe("attention");
  });

  it("snapshot truncado → prioridad datos parciales", () => {
    const snapshot = makeSnapshot({}, {
      diagnostics: {
        invoice_financials_coverage: "full" as const,
        balance_source: "proto_invoices",
        divergences: [],
        dataset_caps: { row_cap: 2000, isTruncated: true, tables_at_cap: ["proto_invoices"], truncation_unknown: false, note: "" },
        engine_notes: [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        snapshot_load: {} as any,
      },
    } as Partial<FinancialSnapshotApiV1>);
    const result = buildCfoAgentBrief({ financialSnapshot: snapshot });
    const p = result.priorities.find((x) => x.id === "cfo-data-partial");
    expect(p).toBeDefined();
    expect(p!.severity).toBe("medium");
  });

  it("varias señales → orden correcto: liquidez crítica primero", () => {
    const snapshot = makeSnapshot({ risk_band: "critical", liquidity_balance: -1000, coverage_ratio: 0.2 });
    const notifications = [
      makeNotif({ id: "n1", type: "client_overdue", severity: "warning" }),
      makeNotif({ id: "n2", type: "treasury_payment_overdue", severity: "critical" }),
      makeNotif({ id: "n3", type: "sync_failed", severity: "warning" }),
    ];
    const result = buildCfoAgentBrief({ notifications, financialSnapshot: snapshot });
    expect(result.priorities[0].id).toBe("cfo-liquidity-critical");
    expect(result.status).toBe("critical");
    expect(result.priorities.length).toBeGreaterThanOrEqual(3);
  });

  it("solo warnings menores → brief status attention", () => {
    const notifications = [
      makeNotif({ type: "client_overdue", severity: "warning" }),
      makeNotif({ type: "treasury_payment_due", severity: "warning" }),
    ];
    const result = buildCfoAgentBrief({ notifications });
    expect(result.status).toBe("attention");
  });

  it("severity critical → brief status critical, summary menciona revisión inmediata", () => {
    const notifications = [makeNotif({ type: "cash_risk_detected", severity: "critical" })];
    const result = buildCfoAgentBrief({ notifications });
    expect(result.status).toBe("critical");
    expect(result.summary).toContain("inmediata");
  });

  it("notificaciones ya leídas no se incluyen", () => {
    const notifications = [
      makeNotif({ type: "cash_risk_detected", severity: "critical", read_at: "2026-05-25T09:00:00Z" }),
    ];
    const result = buildCfoAgentBrief({ notifications });
    expect(result.status).toBe("stable");
    expect(result.priorities).toHaveLength(0);
  });

  it("nextBestAction apunta a la primera prioridad", () => {
    const notifications = [makeNotif({ type: "client_overdue", severity: "critical" })];
    const result = buildCfoAgentBrief({ notifications });
    expect(result.nextBestAction!.href).toBe(result.priorities[0].href);
    expect(result.nextBestAction!.label).toBe(result.priorities[0].ctaLabel);
  });
});
