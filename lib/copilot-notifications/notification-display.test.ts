import { describe, expect, it } from "vitest";

import {
  dedupeNotificationsForDisplay,
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
