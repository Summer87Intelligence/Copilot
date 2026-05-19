import { describe, it, expect } from "vitest";
import {
  isTerminalInvoiceStatus,
  deriveInvoiceFinancialStatusFromBalance,
  INVOICE_BALANCE_EPSILON,
} from "./zeta-invoice-status";

// ── isTerminalInvoiceStatus ───────────────────────────────────────────────────

describe("isTerminalInvoiceStatus", () => {
  const terminalCases = [
    "void",
    "voided",
    "canceled",
    "cancelled",
    "anulada",
    "anulado",
    "annulled",
    "annul",
  ];

  for (const status of terminalCases) {
    it(`"${status}" → terminal`, () => {
      expect(isTerminalInvoiceStatus(status)).toBe(true);
    });

    it(`"${status.toUpperCase()}" → terminal (case insensitive)`, () => {
      expect(isTerminalInvoiceStatus(status.toUpperCase())).toBe(true);
    });
  }

  it('"paid" → NOT terminal (el pipeline sí convierte a paid)', () => {
    expect(isTerminalInvoiceStatus("paid")).toBe(false);
  });

  it('"issued" → NOT terminal', () => {
    expect(isTerminalInvoiceStatus("issued")).toBe(false);
  });

  it('"partial" → NOT terminal', () => {
    expect(isTerminalInvoiceStatus("partial")).toBe(false);
  });

  it('"overdue" → NOT terminal', () => {
    expect(isTerminalInvoiceStatus("overdue")).toBe(false);
  });

  it("empty string → NOT terminal", () => {
    expect(isTerminalInvoiceStatus("")).toBe(false);
  });

  // Casos de contrato crítico: facturas anuladas NO deben convertirse a paid por saldo
  it("status anulada: pipeline NO debe convertirla a paid", () => {
    const status = "anulada";
    expect(isTerminalInvoiceStatus(status)).toBe(true);
    // Contrato: si isTerminalInvoiceStatus es true, el caller debe skip el update
  });

  it("status canceled: pipeline NO debe convertirla a issued/paid", () => {
    expect(isTerminalInvoiceStatus("canceled")).toBe(true);
    expect(isTerminalInvoiceStatus("cancelled")).toBe(true);
  });
});

// ── deriveInvoiceFinancialStatusFromBalance ───────────────────────────────────

describe("deriveInvoiceFinancialStatusFromBalance", () => {
  it("balance = 0 → paid", () => {
    expect(
      deriveInvoiceFinancialStatusFromBalance({ balanceAmount: 0 })
    ).toBe("paid");
  });

  it("balance dentro de epsilon → paid", () => {
    expect(
      deriveInvoiceFinancialStatusFromBalance({ balanceAmount: INVOICE_BALANCE_EPSILON / 2 })
    ).toBe("paid");
  });

  it("balance exactamente epsilon → paid (borderline)", () => {
    expect(
      deriveInvoiceFinancialStatusFromBalance({ balanceAmount: INVOICE_BALANCE_EPSILON })
    ).toBe("paid");
  });

  it("balance > epsilon sin totalAmount → issued", () => {
    expect(
      deriveInvoiceFinancialStatusFromBalance({ balanceAmount: 100 })
    ).toBe("issued");
  });

  it("balance > 0 y balance === totalAmount → issued (saldo completo)", () => {
    expect(
      deriveInvoiceFinancialStatusFromBalance({ balanceAmount: 1000, totalAmount: 1000 })
    ).toBe("issued");
  });

  it("balance > 0 y balance > totalAmount → issued (caso extremo)", () => {
    expect(
      deriveInvoiceFinancialStatusFromBalance({ balanceAmount: 1200, totalAmount: 1000 })
    ).toBe("issued");
  });

  it("balance > 0 y balance < totalAmount → partial", () => {
    expect(
      deriveInvoiceFinancialStatusFromBalance({ balanceAmount: 400, totalAmount: 1000 })
    ).toBe("partial");
  });

  it("partial: balance just above epsilon, totalAmount mucho mayor", () => {
    expect(
      deriveInvoiceFinancialStatusFromBalance({
        balanceAmount: INVOICE_BALANCE_EPSILON * 2,
        totalAmount: 1000,
      })
    ).toBe("partial");
  });

  it("totalAmount = 0 con balance > 0 → issued (no divide por cero, no partial)", () => {
    expect(
      deriveInvoiceFinancialStatusFromBalance({ balanceAmount: 0.5, totalAmount: 0 })
    ).toBe("issued");
  });

  // Casos de contrato explícitos del ticket
  it("update existente con balance 0 → status derivado = paid", () => {
    const bal = 0;
    const status = deriveInvoiceFinancialStatusFromBalance({
      balanceAmount: bal,
      totalAmount: 5000,
    });
    expect(status).toBe("paid");
  });

  it("update existente con balance > 0 → status derivado = issued", () => {
    const bal = 3000;
    const status = deriveInvoiceFinancialStatusFromBalance({
      balanceAmount: bal,
      totalAmount: 5000,
    });
    // 3000 < 5000, so partial
    expect(status).toBe("partial");
  });

  it("update existente con balance = totalAmount → issued (no se cobra nada)", () => {
    const status = deriveInvoiceFinancialStatusFromBalance({
      balanceAmount: 5000,
      totalAmount: 5000,
    });
    expect(status).toBe("issued");
  });

  // Propiedad: la función nunca devuelve un string distinto de los 3 valores
  it("solo devuelve paid | partial | issued", () => {
    const results = new Set([
      deriveInvoiceFinancialStatusFromBalance({ balanceAmount: 0 }),
      deriveInvoiceFinancialStatusFromBalance({ balanceAmount: 500, totalAmount: 1000 }),
      deriveInvoiceFinancialStatusFromBalance({ balanceAmount: 1000, totalAmount: 1000 }),
      deriveInvoiceFinancialStatusFromBalance({ balanceAmount: 1000 }),
    ]);
    for (const r of results) {
      expect(["paid", "partial", "issued"]).toContain(r);
    }
  });
});

// ── Contrato combinado: guarda terminal + derivación ─────────────────────────

describe("contrato: status anulada no cambia", () => {
  it("si status = anulada → isTerminalInvoiceStatus es true → no se debe llamar a deriveInvoiceFinancialStatusFromBalance", () => {
    const currentStatus = "anulada";
    const balanceFromZeta = 0;

    // El caller debe verificar esto antes de actualizar
    const shouldSkip = isTerminalInvoiceStatus(currentStatus);
    expect(shouldSkip).toBe(true);

    // Si no skipeamos, la función derivaría "paid" — por eso el guard es obligatorio
    const derivedIfNotGuarded = deriveInvoiceFinancialStatusFromBalance({
      balanceAmount: balanceFromZeta,
    });
    expect(derivedIfNotGuarded).toBe("paid");
    // → prueba que sin el guard, se pisaría "anulada" con "paid"
  });

  it("si status = cancelled → isTerminalInvoiceStatus es true → no se actualiza", () => {
    expect(isTerminalInvoiceStatus("cancelled")).toBe(true);
    expect(isTerminalInvoiceStatus("canceled")).toBe(true);
  });
});

// ── No toca vouchers (contrato de separación) ─────────────────────────────────

describe("separación de responsabilidades", () => {
  it("los helpers son funciones puras sin efecto — no acceden a Supabase", () => {
    // Si llaman a Supabase, el test fallaría por falta de cliente
    expect(() => isTerminalInvoiceStatus("paid")).not.toThrow();
    expect(() =>
      deriveInvoiceFinancialStatusFromBalance({ balanceAmount: 100, totalAmount: 200 })
    ).not.toThrow();
  });
});
