import { describe, it, expect } from "vitest";
import {
  CFE_NC_TIPOS_DGI,
  isCreditNoteFromMetadata,
  readCfeTipoFromZetaMetadata,
} from "./copilot-zeta-credit-note";

function meta(cfeTipo: unknown, extras: Record<string, unknown> = {}): unknown {
  return {
    zeta_customer_voucher_v1: {
      ...extras,
      cfe_tipo: cfeTipo,
    },
  };
}

describe("CFE_NC_TIPOS_DGI", () => {
  it("incluye los códigos NC core DGI", () => {
    expect(CFE_NC_TIPOS_DGI.has(102)).toBe(true); // e-Factura NC
    expect(CFE_NC_TIPOS_DGI.has(112)).toBe(true); // e-Boleta NC
    expect(CFE_NC_TIPOS_DGI.has(122)).toBe(true); // e-Ticket NC
  });

  it("incluye contingencias NC", () => {
    for (const c of [202, 212, 222, 232, 242, 282]) {
      expect(CFE_NC_TIPOS_DGI.has(c)).toBe(true);
    }
  });

  it("NO incluye facturas regulares", () => {
    for (const c of [101, 111, 121, 131, 141, 181, 201, 211, 221, 231, 241, 281]) {
      expect(CFE_NC_TIPOS_DGI.has(c)).toBe(false);
    }
  });

  it("NO incluye notas de DÉBITO (103, 113, 123, …)", () => {
    for (const c of [103, 113, 123, 203, 213, 223]) {
      expect(CFE_NC_TIPOS_DGI.has(c)).toBe(false);
    }
  });
});

describe("readCfeTipoFromZetaMetadata", () => {
  it("lee cfe_tipo number directo", () => {
    expect(readCfeTipoFromZetaMetadata(meta(102))).toBe(102);
  });

  it("lee cfe_tipo string numérico", () => {
    expect(readCfeTipoFromZetaMetadata(meta("122"))).toBe(122);
  });

  it("acepta clave camelCase 'cfeTipo'", () => {
    const m = { zeta_customer_voucher_v1: { cfeTipo: 102 } };
    expect(readCfeTipoFromZetaMetadata(m)).toBe(102);
  });

  it("acepta clave raw Zeta 'CFETipo'", () => {
    const m = { zeta_customer_voucher_v1: { CFETipo: "122" } };
    expect(readCfeTipoFromZetaMetadata(m)).toBe(122);
  });

  it("retorna null si metadata es null", () => {
    expect(readCfeTipoFromZetaMetadata(null)).toBeNull();
  });

  it("retorna null si metadata no es objeto", () => {
    expect(readCfeTipoFromZetaMetadata("string")).toBeNull();
    expect(readCfeTipoFromZetaMetadata(42)).toBeNull();
    expect(readCfeTipoFromZetaMetadata(true)).toBeNull();
  });

  it("retorna null si metadata es array", () => {
    expect(readCfeTipoFromZetaMetadata([{ cfe_tipo: 102 }])).toBeNull();
  });

  it("retorna null si zeta_customer_voucher_v1 está ausente", () => {
    expect(readCfeTipoFromZetaMetadata({})).toBeNull();
    expect(readCfeTipoFromZetaMetadata({ other: { cfe_tipo: 102 } })).toBeNull();
  });

  it("retorna null si zeta_customer_voucher_v1 no es objeto", () => {
    expect(readCfeTipoFromZetaMetadata({ zeta_customer_voucher_v1: "x" })).toBeNull();
    expect(readCfeTipoFromZetaMetadata({ zeta_customer_voucher_v1: 102 })).toBeNull();
    expect(readCfeTipoFromZetaMetadata({ zeta_customer_voucher_v1: [102] })).toBeNull();
  });

  it("retorna null si cfe_tipo está ausente", () => {
    expect(readCfeTipoFromZetaMetadata({ zeta_customer_voucher_v1: { serie: "A" } })).toBeNull();
  });

  it("retorna null si cfe_tipo es null/empty/space", () => {
    expect(readCfeTipoFromZetaMetadata(meta(null))).toBeNull();
    expect(readCfeTipoFromZetaMetadata(meta(""))).toBeNull();
    expect(readCfeTipoFromZetaMetadata(meta("   "))).toBeNull();
  });

  it("retorna null si cfe_tipo es NaN/Infinity", () => {
    expect(readCfeTipoFromZetaMetadata(meta(NaN))).toBeNull();
    expect(readCfeTipoFromZetaMetadata(meta(Infinity))).toBeNull();
  });

  it("retorna null si cfe_tipo es string no parseable", () => {
    expect(readCfeTipoFromZetaMetadata(meta("abc"))).toBeNull();
    expect(readCfeTipoFromZetaMetadata(meta("--"))).toBeNull();
  });

  it("trunca decimales (102.7 → 102)", () => {
    expect(readCfeTipoFromZetaMetadata(meta(102.7))).toBe(102);
  });

  it("ignora extras y solo lee cfe_tipo", () => {
    const m = meta(102, { serie: "A", numero: "1234", total_recibo: 678.32 });
    expect(readCfeTipoFromZetaMetadata(m)).toBe(102);
  });
});

describe("isCreditNoteFromMetadata", () => {
  it("true para CFE Tipo 102 (e-Factura NC)", () => {
    expect(isCreditNoteFromMetadata(meta(102))).toBe(true);
  });

  it("true para CFE Tipo 112 (e-Boleta NC)", () => {
    expect(isCreditNoteFromMetadata(meta(112))).toBe(true);
  });

  it("true para CFE Tipo 122 (e-Ticket NC)", () => {
    expect(isCreditNoteFromMetadata(meta(122))).toBe(true);
  });

  it("true con string '102'", () => {
    expect(isCreditNoteFromMetadata(meta("102"))).toBe(true);
  });

  it("false para CFE Tipo 101 (e-Factura regular)", () => {
    expect(isCreditNoteFromMetadata(meta(101))).toBe(false);
  });

  it("false para CFE Tipo 103 (Nota de Débito, distinto de NC)", () => {
    expect(isCreditNoteFromMetadata(meta(103))).toBe(false);
  });

  it("false si metadata es null", () => {
    expect(isCreditNoteFromMetadata(null)).toBe(false);
  });

  it("false si zeta_customer_voucher_v1 no existe", () => {
    expect(isCreditNoteFromMetadata({})).toBe(false);
  });

  it("false si cfe_tipo está ausente", () => {
    expect(isCreditNoteFromMetadata({ zeta_customer_voucher_v1: {} })).toBe(false);
  });

  it("false si cfe_tipo es número fuera del catálogo (ej. 999)", () => {
    expect(isCreditNoteFromMetadata(meta(999))).toBe(false);
  });

  it("nunca lanza con metadata corrupta", () => {
    expect(() => isCreditNoteFromMetadata(undefined)).not.toThrow();
    expect(() => isCreditNoteFromMetadata({ zeta_customer_voucher_v1: { cfe_tipo: { nested: true } } })).not.toThrow();
    expect(isCreditNoteFromMetadata({ zeta_customer_voucher_v1: { cfe_tipo: [102] } })).toBe(false);
  });
});
