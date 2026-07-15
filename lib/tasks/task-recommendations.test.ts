import { describe, expect, it } from "vitest";

import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";
import type { PipelineHealthSummary } from "@/lib/data/zeta-pipeline-health";
import type { CopilotNotification } from "@/lib/copilot-notifications/notification-types";
import {
  buildAlertRecommendations,
  buildClientesRecommendations,
  buildCobranzaRecommendations,
  buildDataRecommendations,
} from "@/lib/tasks/task-recommendations";

const BASE = {
  workspaceId: "ws",
  generatedAt: "2026-07-15T12:00:00Z",
  businessDate: "2026-07-15",
};

function row(overrides: Partial<ClientPortfolioRow>): ClientPortfolioRow {
  return {
    company_id: "c1",
    name: "Cliente Uno",
    industry: "—",
    total_billing: 0,
    total_debt: 0,
    overdue_debt: 0,
    invoices_count: 0,
    receipts_count: 0,
    share_pct: 0,
    payment_behavior: "medio",
    risk: "Medio",
    source: "contact",
    has_contact_data: true,
    derived_from_debt: false,
    debt_uyu: 0,
    debt_usd: 0,
    overdue_uyu: 0,
    overdue_usd: 0,
    has_mixed_currency: false,
    overdue_days_uyu: null,
    overdue_days_usd: null,
    oldest_open_invoice_issue_date: null,
    open_invoices_count: 0,
    ...overrides,
  };
}

function notification(overrides: Partial<CopilotNotification>): CopilotNotification {
  return {
    id: "a1",
    workspace_company_id: "ws",
    type: "client_overdue",
    severity: "critical",
    title: "Cliente atrasado",
    body: "Hay atraso.",
    entity_type: "client",
    entity_id: "c1",
    amount: null,
    currency: null,
    action_href: "/copilot/clientes/c1",
    dedup_key: "d1",
    metadata: {},
    read_at: null,
    created_at: "2026-07-15T00:00:00Z",
    ...overrides,
  };
}

function health(overrides: Partial<PipelineHealthSummary>): PipelineHealthSummary {
  return {
    pipeline_name: "contacts",
    status: "healthy",
    last_run_at: null,
    last_success_at: null,
    consecutive_failures: 0,
    last_error_summary: null,
    expected_interval_ms: 1,
    is_overdue: false,
    last_run_duration_ms: null,
    last_run_rows_processed: null,
    last_run_rows_updated: null,
    last_run_rows_failed: null,
    ...overrides,
  };
}

describe("buildCobranzaRecommendations", () => {
  it("genera recomendación para cliente con atraso por due_date", () => {
    const recs = buildCobranzaRecommendations({
      ...BASE,
      rows: [row({ overdue_uyu: 100, overdue_days_uyu: 16 })],
    });
    expect(recs).toHaveLength(1);
    expect(recs[0]?.stableKey).toContain("collection:client:c1:overdue:");
    expect(recs[0]?.reason).toContain("16 días");
    expect(recs[0]?.priority).toBe("high");
  });

  it("no genera recomendación para cliente al día", () => {
    expect(buildCobranzaRecommendations({ ...BASE, rows: [row({ debt_uyu: 100 })] })).toHaveLength(0);
  });

  it("mantiene UYU y USD separados en impacto", () => {
    const rec = buildCobranzaRecommendations({
      ...BASE,
      rows: [row({ overdue_uyu: 100, overdue_usd: 20, overdue_days_uyu: 20 })],
    })[0]!;
    expect(rec.impact?.currencies).toEqual({ UYU: 100, USD: 20 });
  });
});

describe("buildClientesRecommendations", () => {
  it("dato faltante real genera recomendación", () => {
    const recs = buildClientesRecommendations({ ...BASE, rows: [row({ has_contact_data: false })] });
    expect(recs[0]?.stableKey).toBe("client:c1:missing-contact");
  });

  it("datos completos no generan tarea falsa", () => {
    expect(buildClientesRecommendations({ ...BASE, rows: [row({ has_contact_data: true })] })).toHaveLength(0);
  });
});

describe("buildAlertRecommendations", () => {
  it("alerta pendiente genera recomendación deduplicable", () => {
    const recs = buildAlertRecommendations({ ...BASE, notifications: [notification({ id: "a1" })] });
    expect(recs[0]?.stableKey).toBe("alert:a1:review:critical");
    expect(recs[0]?.priority).toBe("high");
  });

  it("alerta leída no genera recomendación", () => {
    expect(
      buildAlertRecommendations({
        ...BASE,
        notifications: [notification({ read_at: "2026-07-15T01:00:00Z" })],
      })
    ).toHaveLength(0);
  });
});

describe("buildDataRecommendations", () => {
  it("pipeline con falla genera texto comprensible", () => {
    const recs = buildDataRecommendations({
      ...BASE,
      health: [health({ status: "stalled", pipeline_name: "contacts" })],
    });
    expect(recs[0]?.title).toContain("Revisar actualización de datos");
    expect(recs[0]?.moduleKey).toBe("datos");
  });

  it("pipeline sano no genera recomendación", () => {
    expect(buildDataRecommendations({ ...BASE, health: [health({ status: "healthy" })] })).toHaveLength(0);
  });
});
