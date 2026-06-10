import { beforeEach, describe, expect, it, vi } from "vitest";

import * as createModule from "@/lib/copilot-notifications/create-notification";
import {
  notifyClientDebtSettled,
  notifyCollectionReceived,
  notifyInvoiceOverdue,
  notifyNewDebtor,
} from "@/lib/copilot-notifications/notification-events";

vi.mock("@/lib/copilot-notifications/create-notification", () => ({
  createNotificationIfNotExists: vi.fn(),
}));

const tenantId = "ws-1";

beforeEach(() => {
  vi.mocked(createModule.createNotificationIfNotExists).mockReset();
  vi.mocked(createModule.createNotificationIfNotExists).mockResolvedValue({
    ok: true,
    created: true,
    id: "n1",
  });
});

describe("notifyNewDebtor", () => {
  it("genera new_debtor con copy y metadata requerida", async () => {
    await notifyNewDebtor({
      tenantCompanyId: tenantId,
      clientId: "c1",
      clientName: "ACME",
      amount: 12000,
      currency: "UYU",
      dateBucket: "2026-06-10",
      invoiceId: "inv-1",
    });

    expect(createModule.createNotificationIfNotExists).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({
        type: "new_debtor",
        title: "Nueva deuda detectada",
        body: "ACME registra deuda pendiente por UYU 12.000.",
        dedup_key: "new_debtor:c1:UYU:2026-06-10",
        metadata: expect.objectContaining({
          client_id: "c1",
          client_name: "ACME",
          currency: "UYU",
          amount: 12000,
          invoice_id: "inv-1",
          event_key: "new_debtor:c1:UYU:2026-06-10",
        }),
      })
    );
  });
});

describe("notifyCollectionReceived", () => {
  it("cobro parcial usa título y saldo restante", async () => {
    await notifyCollectionReceived({
      tenantCompanyId: tenantId,
      receiptId: "r1",
      clientName: "ACME",
      amount: 5000,
      currency: "UYU",
      clientId: "c1",
      remainingBalance: 7000,
    });

    expect(createModule.createNotificationIfNotExists).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({
        type: "collection_received",
        title: "Cobro parcial recibido",
        body: "ACME pagó UYU 5.000. Saldo pendiente: 7.000.",
        metadata: expect.objectContaining({
          client_id: "c1",
          currency: "UYU",
          amount: 5000,
          remaining_balance: 7000,
          receipt_id: "r1",
          status: "partial",
        }),
      })
    );
  });
});

describe("notifyClientDebtSettled", () => {
  it("genera client_debt_settled con dedup diario", async () => {
    await notifyClientDebtSettled({
      tenantCompanyId: tenantId,
      clientId: "c1",
      clientName: "ACME",
      currency: "UYU",
      receiptId: "r9",
      dateBucket: "2026-06-10",
    });

    expect(createModule.createNotificationIfNotExists).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({
        type: "client_debt_settled",
        title: "Cliente saldó su deuda",
        body: "ACME canceló su saldo pendiente.",
        dedup_key: "client_debt_settled:c1:2026-06-10",
        metadata: expect.objectContaining({
          client_id: "c1",
          currency: "UYU",
          receipt_id: "r9",
          status: "settled",
          remaining_balance: 0,
        }),
      })
    );
  });
});

describe("notifyInvoiceOverdue", () => {
  it("genera factura vencida con dedup por invoice_id", async () => {
    await notifyInvoiceOverdue({
      tenantCompanyId: tenantId,
      invoiceId: "inv-22",
      clientId: "c1",
      clientName: "ACME",
      amount: 3000,
      currency: "USD",
      dueDate: "2026-05-15",
      daysOverdue: 26,
    });

    expect(createModule.createNotificationIfNotExists).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({
        type: "client_overdue",
        title: "Factura vencida",
        body: "ACME tiene USD 3.000 vencido.",
        dedup_key: "invoice_overdue:inv-22",
        metadata: expect.objectContaining({
          client_id: "c1",
          invoice_id: "inv-22",
          currency: "USD",
          amount: 3000,
        }),
      })
    );
  });
});
