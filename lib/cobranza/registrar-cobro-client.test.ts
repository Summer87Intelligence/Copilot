import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildInitialRegistrarCobroFormFromPrefill,
  buildRegistrarCobroPayload,
  createEmptyRegistrarCobroForm,
  inferDefaultCurrencyFromDebt,
  submitRegistrarCobro,
  todayYmdLocal,
  validateRegistrarCobroForm,
} from "@/lib/cobranza/registrar-cobro-client";

describe("registrar-cobro-client", () => {
  const companyId = "8fd1272a-3829-4d50-8aa8-66aced1828a0";
  const today = "2026-06-22";

  it("valida monto > 0", () => {
    const values = {
      ...createEmptyRegistrarCobroForm(today),
      companyId,
      amount: "0",
    };
    const errors = validateRegistrarCobroForm(values, today);
    expect(errors.amount).toBeTruthy();
  });

  it("rechaza fecha futura", () => {
    const values = {
      ...createEmptyRegistrarCobroForm(today),
      companyId,
      amount: "100",
      paymentDate: "2099-01-01",
    };
    const errors = validateRegistrarCobroForm(values, today);
    expect(errors.paymentDate).toMatch(/futura/i);
  });

  it("arma payload con client_request_id", () => {
    const values = {
      ...createEmptyRegistrarCobroForm(today),
      companyId,
      amount: "1500.50",
      currencyCode: "UYU" as const,
      reference: "TRF-1",
      bankOrigin: "Santander",
      notes: "test",
      affectsCashflow: true,
    };
    const payload = buildRegistrarCobroPayload(values, "req-123");
    expect(payload).toMatchObject({
      company_id: companyId,
      payment_date: today,
      amount: 1500.5,
      currency_code: "UYU",
      reference: "TRF-1",
      bank_origin: "Santander",
      notes: "test",
      affects_cashflow: true,
      client_request_id: "req-123",
    });
  });

  it("prefill moneda única UYU", () => {
    expect(inferDefaultCurrencyFromDebt(1000, 0)).toBe("UYU");
  });

  it("prefill moneda única USD", () => {
    expect(inferDefaultCurrencyFromDebt(0, 500)).toBe("USD");
  });

  it("prefill moneda dual elige mayor deuda USD equivalente", () => {
    expect(inferDefaultCurrencyFromDebt(100_000, 100, 40)).toBe("UYU");
    expect(inferDefaultCurrencyFromDebt(1000, 500, 40)).toBe("USD");
  });

  it("prefill cliente y moneda desde deuda", () => {
    const form = buildInitialRegistrarCobroFormFromPrefill(
      {
        companyId: "411b0506-b51e-4764-b3ce-fd0688d941c4",
        debtUyu: 5000,
        debtUsd: 0,
      },
      today
    );
    expect(form.companyId).toBe("411b0506-b51e-4764-b3ce-fd0688d941c4");
    expect(form.currencyCode).toBe("UYU");
  });

  it("todayYmdLocal devuelve YYYY-MM-DD", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T15:00:00.000Z"));
    expect(todayYmdLocal()).toBe("2026-06-22");
    vi.useRealTimers();
  });
});

describe("submitRegistrarCobro", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submit llama endpoint con payload correcto", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        ok: true,
        message: "Cobro registrado.",
        warnings: [],
      }),
    });

    const values = {
      ...createEmptyRegistrarCobroForm("2026-06-22"),
      companyId: "8fd1272a-3829-4d50-8aa8-66aced1828a0",
      amount: "1",
      reference: "SMOKE-B2",
    };

    const result = await submitRegistrarCobro(values, "req-smoke-b2", mockFetch);
    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/copilot/cobranza/registrar-cobro",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("req-smoke-b2"),
      })
    );
    const body = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string);
    expect(body.amount).toBe(1);
    expect(body.company_id).toBe(values.companyId);
    expect(body.reference).toBe("SMOKE-B2");
  });

  it("error partial mantiene mensaje específico", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 207,
      json: async () => ({
        ok: false,
        partial: true,
        movement_id: "mov-1",
        message: "Parcial",
      }),
    });

    const result = await submitRegistrarCobro(
      {
        ...createEmptyRegistrarCobroForm("2026-06-22"),
        companyId: "8fd1272a-3829-4d50-8aa8-66aced1828a0",
        amount: "1",
      },
      "req-partial",
      mockFetch
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.partial).toBe(true);
    expect(result.message).toMatch(/evidencia de cobranza/i);
  });
});
