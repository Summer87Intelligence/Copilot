import { describe, expect, it } from "vitest";

import {
  parseZetaCfeTipoCodigo,
  zetaCustomerVoucherRowIsPersistableSalesCfeInvoice,
  zetaCustomerVoucherRowLooksLikeReciboCobranza,
} from "@/lib/integrations/zeta/zeta-customer-vouchers-invoice-classifier";

describe("zeta-customer-vouchers-invoice-classifier", () => {
  it("excluye recibo de cobranza por nombre", () => {
    const row = {
      Serie: "A",
      Numero: 655,
      CFETipo: 111,
      TipoComprobanteNombre: "Recibo de Cobranza",
    };
    expect(zetaCustomerVoucherRowLooksLikeReciboCobranza(row)).toBe(true);
    expect(zetaCustomerVoucherRowIsPersistableSalesCfeInvoice(row)).toBe(false);
  });

  it("incluye e-Factura 111 sin texto de recibo", () => {
    const row = {
      Serie: "A",
      Numero: 2828,
      CFETipo: 111,
      Nombre: "Venta Crédito",
    };
    expect(zetaCustomerVoucherRowIsPersistableSalesCfeInvoice(row)).toBe(true);
  });

  it("excluye si CFETipo no es CFE DGI aunque no diga recibo (evita comprobantes internos)", () => {
    const row = {
      Serie: "X",
      Numero: 1,
      CFETipo: 999,
    };
    expect(zetaCustomerVoucherRowIsPersistableSalesCfeInvoice(row)).toBe(false);
  });

  it("sin CFETipo y sin recibo → incluye (compat.)", () => {
    const row = { Serie: "Z", Numero: 9, ClienteCodigo: "C1" };
    expect(parseZetaCfeTipoCodigo(row)).toBeNull();
    expect(zetaCustomerVoucherRowIsPersistableSalesCfeInvoice(row)).toBe(true);
  });

  it("excluye recibo etiquetado solo como «Recibo» / «Recibo 655» sin CFETipo", () => {
    const solo = { Serie: "A", Numero: 655, TipoComprobanteNombre: "Recibo" };
    expect(zetaCustomerVoucherRowLooksLikeReciboCobranza(solo)).toBe(true);
    expect(zetaCustomerVoucherRowIsPersistableSalesCfeInvoice(solo)).toBe(false);
    const conNumero = { Serie: "A", Numero: 655, NombreComprobante: "Recibo 655" };
    expect(zetaCustomerVoucherRowLooksLikeReciboCobranza(conNumero)).toBe(true);
    expect(zetaCustomerVoucherRowIsPersistableSalesCfeInvoice(conNumero)).toBe(false);
  });
});
