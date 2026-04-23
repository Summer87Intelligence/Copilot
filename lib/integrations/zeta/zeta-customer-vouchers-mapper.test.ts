import { describe, expect, it } from "vitest";

import {
  buildZetaCustomerVoucherInvoiceNumber,
  buildZetaCustomerVoucherInvoiceNumberLegacyCompKey,
  extractZetaSaldoFromCustomerVoucherRow,
  mapCopilotCustomerVoucherToProtoInvoiceInput,
  mapZetaCustomerVoucherToCopilot,
  normalizeZetaIssueDateYmd,
  resolveCcV1InvoiceNumberFromZetaSaldoOrVoucherRow,
  resolveZetaInvoiceTotalAmount,
  sumZetaLineasTotales,
  sumZetaPagosAppliedMonto,
} from "@/lib/integrations/zeta/zeta-customer-vouchers-mapper";

describe("zeta-customer-vouchers-mapper totals (factura CFE)", () => {
  it("prioriza Total de encabezado sobre líneas", () => {
    const row = {
      Serie: "A",
      Numero: 2828,
      Total: 56852,
      TotalRecibo: 0,
      Lineas: [{ Total: 1 }],
    };
    expect(resolveZetaInvoiceTotalAmount(row)).toBe(56852);
  });

  it("sin Total en encabezado usa suma de Lineas (caso TotalRecibo 0)", () => {
    const row = {
      Serie: "A",
      Numero: 2828,
      TotalRecibo: "0.00",
      Lineas: [{ Total: 56852.0 }],
    };
    expect(resolveZetaInvoiceTotalAmount(row)).toBe(56852);
    const m = mapZetaCustomerVoucherToCopilot(row);
    expect(m.total_recibo).toBe(56852);
  });

  it("no usa TotalRecibo como total de factura (solo Total o líneas)", () => {
    const row = {
      Serie: "A",
      Numero: 1,
      ClienteCodigo: "C1",
      TotalRecibo: 1234,
      Lineas: [{ ArticuloCodigo: "X" }],
    };
    expect(sumZetaLineasTotales(row)).toBeNull();
    expect(resolveZetaInvoiceTotalAmount(row)).toBeNull();
  });
});

describe("buildZetaCustomerVoucherInvoiceNumber (identidad)", () => {
  it("usa EmpresaCodigo + Serie + Numero; mismo ComprobanteCodigo no colisiona", () => {
    const a = mapZetaCustomerVoucherToCopilot({
      EmpresaCodigo: "250218923",
      Serie: "A",
      Numero: 2828,
      ClienteCodigo: "CLI1",
      ComprobanteCodigo: 701,
      Total: 100,
      CFETipo: 101,
    });
    const b = mapZetaCustomerVoucherToCopilot({
      EmpresaCodigo: "250218923",
      Serie: "A",
      Numero: 2829,
      ClienteCodigo: "CLI1",
      ComprobanteCodigo: 701,
      Total: 200,
      CFETipo: 101,
    });
    expect(buildZetaCustomerVoucherInvoiceNumber(a)).toBe("ZETA:CCV1:250218923:CLI1:A:2828");
    expect(buildZetaCustomerVoucherInvoiceNumber(b)).toBe("ZETA:CCV1:250218923:CLI1:A:2829");
    expect(buildZetaCustomerVoucherInvoiceNumber(a)).not.toBe(buildZetaCustomerVoucherInvoiceNumber(b));
  });

  it("sin EmpresaCodigo usa segmento 0", () => {
    const m = mapZetaCustomerVoucherToCopilot({
      Serie: "B",
      Numero: 100,
      ClienteCodigo: "C1",
      Total: 1,
    });
    expect(buildZetaCustomerVoucherInvoiceNumber(m)).toBe("ZETA:CCV1:0:C1:B:100");
  });

  it("buildZetaCustomerVoucherInvoiceNumberLegacyCompKey para migración COMP", () => {
    const m = mapZetaCustomerVoucherToCopilot({ ComprobanteCodigo: 701, Serie: "A", Numero: 1 });
    expect(buildZetaCustomerVoucherInvoiceNumberLegacyCompKey(m)).toBe("ZETA:CCV1:COMP:701");
    expect(buildZetaCustomerVoucherInvoiceNumber(m)).toBe("ZETA:CCV1:0:NCLI:A:1");
  });
});

describe("mapCopilotCustomerVoucherToProtoInvoiceInput (montos)", () => {
  it("balance_amount siempre 0 en ingesta vouchers (saldo lo aplica pipeline saldos pendientes)", () => {
    const rowConSaldo = {
      Serie: "A",
      Numero: 1,
      ClienteCodigo: "C1",
      Total: 1000,
      Saldo: "500,00",
      CFEEstado: "EMITIDO",
    };
    const m1 = mapZetaCustomerVoucherToCopilot(rowConSaldo);
    const p1 = mapCopilotCustomerVoucherToProtoInvoiceInput("cc1", m1, "run-1");
    expect(p1.total_amount).toBe(1000);
    expect(p1.balance_amount).toBe(0);

    const rowPagadoSinSaldo = {
      Serie: "A",
      Numero: 2,
      ClienteCodigo: "C1",
      Total: 800,
      CFEEstado: "PAGADO",
    };
    const m2 = mapZetaCustomerVoucherToCopilot(rowPagadoSinSaldo);
    const p2 = mapCopilotCustomerVoucherToProtoInvoiceInput("cc1", m2, "run-1");
    expect(p2.total_amount).toBe(800);
    expect(p2.balance_amount).toBe(0);
  });

  it("Saldo explícito 0 en fila Zeta no cambia balance en proto (sigue 0 hasta saldos)", () => {
    const row = {
      Serie: "A",
      Numero: 9,
      ClienteCodigo: "C1",
      Total: 62_000,
      Saldo: "0,00",
      CFEEstado: "EMITIDO",
    };
    expect(extractZetaSaldoFromCustomerVoucherRow(row)).toBe(0);
    const m = mapZetaCustomerVoucherToCopilot(row);
    const p = mapCopilotCustomerVoucherToProtoInvoiceInput("cc1", m, "run-1");
    expect(p.total_amount).toBe(62_000);
    expect(p.balance_amount).toBe(0);
  });

  it("con Pagos en fila: balance en proto sigue 0 (no inferir cobrado desde vouchers)", () => {
    const row = {
      Serie: "A",
      Numero: 3,
      ClienteCodigo: "C1",
      Total: 10_000,
      CFEEstado: "EMITIDO",
      Pagos: [{ MonedaPagoMonto: 10_000 }],
    };
    expect(sumZetaPagosAppliedMonto(row)).toBe(10_000);
    const m = mapZetaCustomerVoucherToCopilot(row);
    const p = mapCopilotCustomerVoucherToProtoInvoiceInput("cc1", m, "run-1");
    expect(p.balance_amount).toBe(0);
  });

  it("sin Saldo ni Pagos y emitido: balance 0 (no usar total como saldo por defecto)", () => {
    const row = {
      Serie: "A",
      Numero: 4,
      ClienteCodigo: "C1",
      Total: 5000,
      CFEEstado: "EMITIDO",
    };
    const m = mapZetaCustomerVoucherToCopilot(row);
    const p = mapCopilotCustomerVoucherToProtoInvoiceInput("cc1", m, "run-1");
    expect(p.total_amount).toBe(5000);
    expect(p.balance_amount).toBe(0);
  });
});

describe("normalizeZetaIssueDateYmd / issue_date mapping", () => {
  it("parsea YYYYMMDD a YYYY-MM-DD", () => {
    expect(normalizeZetaIssueDateYmd("20260107")).toBe("2026-01-07");
    expect(normalizeZetaIssueDateYmd("20260401")).toBe("2026-04-01");
  });

  it("mantiene compatibilidad con YYYY-MM-DD y YYYY/MM/DD", () => {
    expect(normalizeZetaIssueDateYmd("2026-03-09")).toBe("2026-03-09");
    expect(normalizeZetaIssueDateYmd("2026/03/09")).toBe("2026-03-09");
  });

  it("con Fecha YYYYMMDD arma issue_date real y due_date +30 días", () => {
    const m = mapZetaCustomerVoucherToCopilot({
      Fecha: "20260107",
      Serie: "A",
      Numero: 10,
      ClienteCodigo: "C1",
      Total: 100,
    });
    const p = mapCopilotCustomerVoucherToProtoInvoiceInput("cc1", m, "run-1");
    expect(p.issue_date).toBe("2026-01-07");
    expect(p.due_date).toBe("2026-02-06");
  });
});

describe("mapZetaCustomerVoucherToCopilot (RegistroId para cruce saldos)", () => {
  it("expone zeta_registro_id desde RegistroId de la fila Zeta", () => {
    const m = mapZetaCustomerVoucherToCopilot({
      RegistroId: "5469",
      Serie: "A",
      Numero: 2654,
      ClienteCodigo: "114",
      EmpresaCodigo: "0",
      Total: 318.18,
    });
    expect(m.zeta_registro_id).toBe("5469");
  });
});

describe("resolveCcV1InvoiceNumberFromZetaSaldoOrVoucherRow (cruce saldos ↔ vouchers)", () => {
  it("arma la misma clave ZETA:CCV1 con fila tipo saldos pendientes", () => {
    const saldoLike = {
      EmpresaCodigo: "250218923",
      ClienteCodigo: "CLI1",
      Serie: "A",
      Numero: "2828",
      ComprobanteCodigo: 701,
      Fecha: "2026-01-15",
    };
    expect(resolveCcV1InvoiceNumberFromZetaSaldoOrVoucherRow(saldoLike)).toBe(
      "ZETA:CCV1:250218923:CLI1:A:2828"
    );
  });
});
