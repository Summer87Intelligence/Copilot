import { describe, expect, it } from "vitest";

import {
  dedupeNotificationsForDisplay,
  isAutoResolvedCashRisk,
  normalizeNotificationBody,
} from "./notification-display";
import type { CopilotNotification } from "./notification-types";

describe("normalizeNotificationBody", () => {
  it("reescribe canceló su saldo pendiente", () => {
    expect(normalizeNotificationBody("ACME canceló su saldo pendiente.", "client_debt_settled")).toBe(
      "ACME pagó su deuda."
    );
  });

  it("reemplaza vencido por atrasado", () => {
    expect(normalizeNotificationBody("Cliente está vencido desde ayer.")).toBe(
      "Cliente está atrasado desde ayer."
    );
  });
});

describe("dedupeNotificationsForDisplay", () => {
  it("colapsa duplicados del mismo tipo y entidad", () => {
    const base = {
      id: "1",
      workspace_company_id: "ws-1",
      type: "client_debt_settled",
      severity: "info",
      title: "Cliente saldó su deuda",
      body: "ACME pagó su deuda.",
      entity_type: "company",
      entity_id: "c1",
      amount: null,
      currency: "UYU",
      action_href: null,
      dedup_key: "k1",
      metadata: {},
      read_at: null,
      created_at: "2026-06-10T10:00:00Z",
    } satisfies CopilotNotification;
    const dup = { ...base, id: "2", dedup_key: "k2" };
    expect(dedupeNotificationsForDisplay([base, dup])).toHaveLength(1);
  });
});

// ── isAutoResolvedCashRisk ────────────────────────────────────────────────────

const BASE_NOTIF: CopilotNotification = {
  id: "n1",
  workspace_company_id: "ws-1",
  type: "cash_risk_detected",
  severity: "critical",
  title: "Riesgo de caja detectado",
  body: "Faltan USD 1.000,00 para cubrir compromisos próximos.",
  entity_type: null,
  entity_id: null,
  amount: null,
  currency: null,
  action_href: "/copilot/tesoreria",
  dedup_key: "cash_risk_detected:2026-06-21:USD",
  metadata: {},
  read_at: null,
  created_at: "2026-06-21T10:00:00Z",
};

describe("isAutoResolvedCashRisk", () => {
  it("read_at nulo → no es auto-resuelta (alerta activa)", () =>
    expect(
      isAutoResolvedCashRisk({ ...BASE_NOTIF, read_at: null, metadata: { auto_resolved_reason: "x" } })
    ).toBe(false));

  it("tipo distinto → false aunque tenga auto_resolved_reason", () =>
    expect(
      isAutoResolvedCashRisk({
        ...BASE_NOTIF,
        type: "collection_received",
        read_at: "2026-06-21T11:00:00Z",
        metadata: { auto_resolved_reason: "x" },
      })
    ).toBe(false));

  it("cash_risk_detected + read_at + auto_resolved_reason → true", () =>
    expect(
      isAutoResolvedCashRisk({
        ...BASE_NOTIF,
        read_at: "2026-06-21T11:00:00Z",
        metadata: { auto_resolved_reason: "Resolved after consolidated USD coverage recalculation." },
      })
    ).toBe(true));

  it("cash_risk_detected + read_at sin auto_resolved_reason → false (leída manualmente)", () =>
    expect(
      isAutoResolvedCashRisk({ ...BASE_NOTIF, read_at: "2026-06-21T11:00:00Z", metadata: {} })
    ).toBe(false));

  it("auto_resolved_reason no es string → false", () =>
    expect(
      isAutoResolvedCashRisk({
        ...BASE_NOTIF,
        read_at: "2026-06-21T11:00:00Z",
        metadata: { auto_resolved_reason: true },
      })
    ).toBe(false));
});
