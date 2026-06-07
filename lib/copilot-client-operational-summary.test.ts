import { describe, expect, it } from "vitest";
import {
  buildClientOperationalSummary,
  type ClientOperationalSummaryInput,
} from "./copilot-client-operational-summary";

const BASE_INPUT: ClientOperationalSummaryInput = {
  saldo_pendiente: 0,
  overdue_debt: 0,
  receipts_count: 0,
  contacts_count: 1,
  risk: "Bajo",
  invoices_count: 0,
  today: "2026-05-21",
};

describe("buildClientOperationalSummary", () => {
  describe("cliente sin deuda", () => {
    it("devuelve hint ok sin deuda", () => {
      const result = buildClientOperationalSummary({ ...BASE_INPUT, saldo_pendiente: 0 });
      expect(result.riskHints.some((h) => h.id === "no_debt" && h.severity === "ok")).toBe(true);
    });

    it("summary ejecutivo indica sin deuda activa", () => {
      const result = buildClientOperationalSummary({ ...BASE_INPUT, saldo_pendiente: 0 });
      expect(result.executiveSummary).toContain("sin deuda");
    });

    it("no sugiere acciones de cobranza", () => {
      const result = buildClientOperationalSummary({ ...BASE_INPUT, saldo_pendiente: 0 });
      expect(result.suggestedActions.join(" ")).not.toContain("cobranza");
    });
  });

  describe("cliente con deuda vencida", () => {
    const input: ClientOperationalSummaryInput = {
      ...BASE_INPUT,
      saldo_pendiente: 150_000,
      overdue_debt: 80_000,
      overdue_uyu: 80_000,
      receipts_count: 2,
      receipts_last_date: "2026-02-10", // > 60d antes de today 2026-05-21
      risk: "Alto",
    };

    it("devuelve hint critical por deuda vencida", () => {
      const result = buildClientOperationalSummary(input);
      expect(result.riskHints.some((h) => h.id === "overdue_debt" && h.severity === "critical")).toBe(true);
    });

    it("devuelve hint warning por sin cobros recientes", () => {
      const result = buildClientOperationalSummary(input);
      expect(result.riskHints.some((h) => h.id === "no_recent_receipts" && h.severity === "warning")).toBe(true);
    });

    it("devuelve hint critical por riesgo alto", () => {
      const result = buildClientOperationalSummary(input);
      expect(result.riskHints.some((h) => h.id === "high_risk" && h.severity === "critical")).toBe(true);
    });

    it("sugiere priorizar cobranza", () => {
      const result = buildClientOperationalSummary(input);
      expect(result.suggestedActions.some((a) => a.toLowerCase().includes("cobranza"))).toBe(true);
    });

    it("summary ejecutivo menciona riesgo alto", () => {
      const result = buildClientOperationalSummary(input);
      expect(result.executiveSummary.toLowerCase()).toContain("riesgo alto");
    });

    it("riskHints no supera 5", () => {
      const result = buildClientOperationalSummary(input);
      expect(result.riskHints.length).toBeLessThanOrEqual(5);
    });
  });

  describe("cliente sin contactos", () => {
    const input: ClientOperationalSummaryInput = {
      ...BASE_INPUT,
      saldo_pendiente: 50_000,
      contacts_count: 0,
    };

    it("registra missing hint por sin contactos", () => {
      const result = buildClientOperationalSummary(input);
      expect(result.missingDataHints.some((h) => h.id === "no_contacts" && h.severity === "warning")).toBe(true);
    });

    it("sugiere registrar contacto", () => {
      const result = buildClientOperationalSummary(input);
      expect(result.suggestedActions.some((a) => a.toLowerCase().includes("contacto"))).toBe(true);
    });
  });

  describe("cliente multi-moneda", () => {
    const input: ClientOperationalSummaryInput = {
      ...BASE_INPUT,
      saldo_pendiente: 200_000,
      debt_uyu: 150_000,
      debt_usd: 1_200,
      has_mixed_currency: true,
    };

    it("devuelve hint info multi-moneda", () => {
      const result = buildClientOperationalSummary(input);
      expect(result.riskHints.some((h) => h.id === "multi_currency" && h.severity === "info")).toBe(true);
    });
  });

  describe("cliente con recibos recientes", () => {
    const input: ClientOperationalSummaryInput = {
      ...BASE_INPUT,
      saldo_pendiente: 30_000,
      receipts_count: 5,
      receipts_last_date: "2026-05-15", // 6 días antes → dentro de 60d
    };

    it("no genera hint de sin cobros recientes", () => {
      const result = buildClientOperationalSummary(input);
      expect(result.riskHints.some((h) => h.id === "no_recent_receipts")).toBe(false);
    });
  });

  describe("timeline", () => {
    const input: ClientOperationalSummaryInput = {
      ...BASE_INPUT,
      saldo_pendiente: 50_000,
      overdue_debt: 30_000,
      invoices: [
        {
          id: "inv-1",
          issue_date: "2026-04-01",
          due_date: "2026-04-30",
          serie_numero: "A-001",
          importe: 50_000,
          balance: 30_000,
          currency_code: "UYU",
        },
      ],
      receipts: [
        {
          id: "rec-1",
          receipt_date: "2026-04-15",
          importe: 20_000,
          medio: "Transferencia",
          currency_code: "UYU",
        },
      ],
    };

    it("incluye evento de factura emitida", () => {
      const result = buildClientOperationalSummary(input);
      expect(result.timelineEvents.some((e) => e.kind === "invoice_issued")).toBe(true);
    });

    it("incluye evento de factura vencida", () => {
      const result = buildClientOperationalSummary(input);
      expect(result.timelineEvents.some((e) => e.kind === "invoice_overdue" && e.severity === "critical")).toBe(true);
    });

    it("incluye evento de recibo", () => {
      const result = buildClientOperationalSummary(input);
      expect(result.timelineEvents.some((e) => e.kind === "receipt" && e.severity === "ok")).toBe(true);
    });

    it("eventos ordenados por fecha descendente", () => {
      const result = buildClientOperationalSummary(input);
      const dates = result.timelineEvents.map((e) => e.date);
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]! <= dates[i - 1]!).toBe(true);
      }
    });

    it("timeline no supera 20 eventos", () => {
      const manyInvoices = Array.from({ length: 30 }, (_, i) => ({
        id: `inv-${i}`,
        issue_date: `2026-03-${String(i + 1).padStart(2, "0")}`,
        serie_numero: `A-${i + 1}`,
        importe: 1000,
        balance: 0,
        currency_code: "UYU",
      }));
      const result = buildClientOperationalSummary({ ...BASE_INPUT, invoices: manyInvoices });
      expect(result.timelineEvents.length).toBeLessThanOrEqual(20);
    });

    it("empty state cuando no hay eventos", () => {
      const result = buildClientOperationalSummary({
        ...BASE_INPUT,
        invoices: [],
        receipts: [],
        sync_rows: [],
      });
      expect(result.timelineEvents.length).toBe(0);
    });

    it("recibo expone medio en description (usado por timeline inline)", () => {
      const result = buildClientOperationalSummary(input);
      const receipt = result.timelineEvents.find((e) => e.kind === "receipt");
      expect(receipt?.description).toBe("Transferencia");
    });

    it("recibo expone importe en amount", () => {
      const result = buildClientOperationalSummary(input);
      const receipt = result.timelineEvents.find((e) => e.kind === "receipt");
      expect(receipt?.amount).toBe(20_000);
    });

    it("factura emitida expone importe en amount", () => {
      const result = buildClientOperationalSummary(input);
      const inv = result.timelineEvents.find((e) => e.kind === "invoice_issued");
      expect(inv?.amount).toBe(50_000);
    });
  });

  describe("suggestedActions no duplica", () => {
    it("no supera 4 acciones", () => {
      const input: ClientOperationalSummaryInput = {
        ...BASE_INPUT,
        saldo_pendiente: 200_000,
        overdue_debt: 100_000,
        receipts_count: 0,
        contacts_count: 0,
        risk: "Alto",
        has_mixed_currency: true,
      };
      const result = buildClientOperationalSummary(input);
      expect(result.suggestedActions.length).toBeLessThanOrEqual(4);
    });
  });
});
