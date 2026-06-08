/**
 * Tests del contrato canónico Zeta API.
 *
 * Cubre las 8 reglas críticas documentadas en docs/integrations/zeta-api-contract.md:
 *  1. RegistroId siempre preservado
 *  2. MonedaCodigo 1 → UYU, 2 → USD; desconocido → null + alerta
 *  3. SaldoPendiente Numero=0 no se descarta si tiene RegistroId+Saldo+Total
 *  4. CFETipo=0 + ComprobanteCodigo=701 + Lineas positivas → factura_interna_cfe0
 *  5. Nota crédito detectada por CFETipo 181 / 182
 *  6. Recibo ClienteCodigo VARIOS USD → review_required + is_varios
 *  7. Shadow: mismos RegistroId → duplicado detectado
 *  8. Tipos desconocidos → alertas, no datos inventados
 */
import { describe, expect, it } from "vitest";

import {
  resolveMonedaCodigo,
  normalizeRegistroId,
  validateSaldoPendienteRow,
  parseSaldoPendienteRow,
  parseReciboRow,
  zetaReciboIsVarios,
  classifyComprobanteCfeTipo,
  isCreditNoteCfeTipo,
  zetaRowsShareRegistroId,
  buildZetaContractAlerts,
  parseVentaDetalladaRow,
  ZETA_VARIOS_CLIENTE_CODES,
  CFE_TIPOS_NOTA_CREDITO,
  CFE_TIPOS_FACTURA,
} from "@/lib/integrations/zeta/zeta-api-contract";

// ── 1. RegistroId ────────────────────────────────────────────────────────────

describe("normalizeRegistroId", () => {
  it("preserva RegistroId numérico como string", () => {
    expect(normalizeRegistroId(2527)).toBe("2527");
  });

  it("preserva RegistroId string", () => {
    expect(normalizeRegistroId("2527")).toBe("2527");
  });

  it("retorna null para undefined / null / string vacío", () => {
    expect(normalizeRegistroId(undefined)).toBeNull();
    expect(normalizeRegistroId(null)).toBeNull();
    expect(normalizeRegistroId("")).toBeNull();
    expect(normalizeRegistroId("  ")).toBeNull();
  });

  it("preserva RegistroId en parseVentaDetalladaRow", () => {
    const row = parseVentaDetalladaRow({ RegistroId: 1234, MonedaCodigo: "1" });
    expect(row.RegistroId).toBe("1234");
  });

  it("preserva RegistroId en parseSaldoPendienteRow", () => {
    const row = parseSaldoPendienteRow({
      RegistroId: 9999,
      MonedaCodigo: "1",
      Saldo: 100,
      Total: 200,
    });
    expect(row.RegistroId).toBe("9999");
  });

  it("preserva RegistroId en parseReciboRow", () => {
    const row = parseReciboRow({ RegistroId: "ABCD", MonedaCodigo: "1", ClienteCodigo: "C001" });
    expect(row.RegistroId).toBe("ABCD");
  });
});

// ── 2. MonedaCodigo ──────────────────────────────────────────────────────────

describe("resolveMonedaCodigo", () => {
  it("MonedaCodigo 1 → UYU", () => {
    expect(resolveMonedaCodigo("1")).toBe("UYU");
    expect(resolveMonedaCodigo(1)).toBe("UYU");
  });

  it("MonedaCodigo 2 → USD", () => {
    expect(resolveMonedaCodigo("2")).toBe("USD");
    expect(resolveMonedaCodigo(2)).toBe("USD");
  });

  it("string UYU / USD por nombre", () => {
    expect(resolveMonedaCodigo("UYU")).toBe("UYU");
    expect(resolveMonedaCodigo("USD")).toBe("USD");
    expect(resolveMonedaCodigo("U$S")).toBe("USD");
    expect(resolveMonedaCodigo("US$")).toBe("USD");
  });

  it("código desconocido → null", () => {
    expect(resolveMonedaCodigo("3")).toBeNull();
    expect(resolveMonedaCodigo("EUR")).toBeNull();
    expect(resolveMonedaCodigo("")).toBeNull();
    expect(resolveMonedaCodigo(null)).toBeNull();
  });
});

// ── 3. SaldoPendiente Numero=0 ───────────────────────────────────────────────

describe("validateSaldoPendienteRow — Numero=0 no se descarta", () => {
  it("acepta fila con Numero=0 si tiene RegistroId + Saldo + Total", () => {
    const row = parseSaldoPendienteRow({
      RegistroId: "2674",
      Numero: "0",
      Saldo: 8662,
      Total: 8662,
      MonedaCodigo: "1",
      ClienteCodigo: "ELP",
      Fecha: "2026-01-01",
    });
    expect(row.RegistroId).toBe("2674");
    expect(row.Numero).toBe("0");
    const v = validateSaldoPendienteRow(row);
    expect(v.ok).toBe(true);
  });

  it("rechaza fila sin RegistroId aunque tenga Saldo y Total", () => {
    const row = parseSaldoPendienteRow({
      RegistroId: null,
      Numero: "123",
      Saldo: 1000,
      Total: 1000,
      MonedaCodigo: "1",
    });
    const v = validateSaldoPendienteRow(row);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("missing_registro_id");
  });

  it("rechaza fila sin Saldo", () => {
    const row = parseSaldoPendienteRow({
      RegistroId: "999",
      Numero: "1",
      Total: 1000,
      MonedaCodigo: "1",
    });
    const v = validateSaldoPendienteRow(row);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("missing_saldo");
  });

  it("rechaza fila sin Total", () => {
    const row = parseSaldoPendienteRow({
      RegistroId: "999",
      Numero: "1",
      Saldo: 100,
      MonedaCodigo: "2",
    });
    const v = validateSaldoPendienteRow(row);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("missing_total");
  });
});

// ── 4. CFETipo=0 + Lineas positivas ─────────────────────────────────────────

describe("classifyComprobanteCfeTipo — CFETipo=0 especial PRESTIS", () => {
  it("CFETipo=0 + hasLineas=true + noFormasPago → factura_interna_cfe0", () => {
    expect(classifyComprobanteCfeTipo(0, true, false)).toBe("factura_interna_cfe0");
  });

  it("CFETipo=0 + hasLineas=false → recibo (excluido de facturas)", () => {
    expect(classifyComprobanteCfeTipo(0, false, false)).toBe("recibo");
  });

  it("CFETipo=0 + hasFormasPago=true → recibo (tiene pago aplicado)", () => {
    expect(classifyComprobanteCfeTipo(0, true, true)).toBe("recibo");
  });

  it("CFETipo=101 → factura", () => {
    expect(classifyComprobanteCfeTipo(101, false, false)).toBe("factura");
  });

  it("CFETipo=181 → nota_credito", () => {
    expect(classifyComprobanteCfeTipo(181, false, false)).toBe("nota_credito");
  });

  it("CFETipo=182 → nota_credito", () => {
    expect(classifyComprobanteCfeTipo(182, false, false)).toBe("nota_credito");
  });

  it("CFETipo=281 → remito", () => {
    expect(classifyComprobanteCfeTipo(281, false, false)).toBe("remito");
  });

  it("CFETipo desconocido → unknown (no inventa clasificación)", () => {
    expect(classifyComprobanteCfeTipo(999, false, false)).toBe("unknown");
    expect(classifyComprobanteCfeTipo(50, false, false)).toBe("unknown");
  });

  it("CFETipo null → unknown", () => {
    expect(classifyComprobanteCfeTipo(null, false, false)).toBe("unknown");
  });
});

// ── 5. Nota de crédito por CFETipo ───────────────────────────────────────────

describe("isCreditNoteCfeTipo", () => {
  it("181 → true", () => {
    expect(isCreditNoteCfeTipo(181)).toBe(true);
  });

  it("182 → true", () => {
    expect(isCreditNoteCfeTipo(182)).toBe(true);
  });

  it("101 → false", () => {
    expect(isCreditNoteCfeTipo(101)).toBe(false);
  });

  it("0 → false", () => {
    expect(isCreditNoteCfeTipo(0)).toBe(false);
  });

  it("null / undefined → false", () => {
    expect(isCreditNoteCfeTipo(null)).toBe(false);
    expect(isCreditNoteCfeTipo(undefined)).toBe(false);
  });

  it("catálogo CFE_TIPOS_NOTA_CREDITO contiene solo 181 y 182", () => {
    expect([...CFE_TIPOS_NOTA_CREDITO].sort()).toEqual([181, 182]);
  });

  it("catálogo CFE_TIPOS_FACTURA no contiene NC", () => {
    expect(CFE_TIPOS_FACTURA.has(181)).toBe(false);
    expect(CFE_TIPOS_FACTURA.has(182)).toBe(false);
  });
});

// ── 6. Recibo ClienteCodigo VARIOS USD ──────────────────────────────────────

describe("zetaReciboIsVarios / parseReciboRow — pending_review", () => {
  it("ClienteCodigo VARIOS USD → is_varios y review_required", () => {
    expect(zetaReciboIsVarios("VARIOS USD")).toBe(true);
    expect(zetaReciboIsVarios("VARIOS")).toBe(true);
    expect(zetaReciboIsVarios("VARIOS UYU")).toBe(true);
  });

  it("parseReciboRow con VARIOS USD marca review_required=true y is_varios=true", () => {
    const row = parseReciboRow({
      RegistroId: "9876",
      ClienteCodigo: "VARIOS USD",
      MonedaCodigo: "2",
      Total: 1500,
      Fecha: "2026-03-01",
    });
    expect(row.is_varios).toBe(true);
    expect(row.review_required).toBe(true);
    expect(row.RegistroId).toBe("9876");
  });

  it("ClienteCodigo normal → no es varios", () => {
    expect(zetaReciboIsVarios("C001")).toBe(false);
    expect(zetaReciboIsVarios("182")).toBe(false);
  });

  it("ClienteCodigo null → no es varios", () => {
    expect(zetaReciboIsVarios(null)).toBe(false);
  });

  it("VARIOS_CLIENTE_CODES contiene los valores esperados", () => {
    expect(ZETA_VARIOS_CLIENTE_CODES.has("VARIOS")).toBe(true);
    expect(ZETA_VARIOS_CLIENTE_CODES.has("VARIOS USD")).toBe(true);
    expect(ZETA_VARIOS_CLIENTE_CODES.has("VARIOS UYU")).toBe(true);
  });

  it("parseReciboRow sin VARIOS → review_required=false", () => {
    const row = parseReciboRow({
      RegistroId: "111",
      ClienteCodigo: "C001",
      MonedaCodigo: "1",
      Total: 500,
    });
    expect(row.is_varios).toBe(false);
    expect(row.review_required).toBe(false);
  });
});

// ── 7. Shadow / deduplicación por RegistroId ────────────────────────────────

describe("zetaRowsShareRegistroId — no duplicar CCV1", () => {
  it("mismo RegistroId → duplicado detectado", () => {
    expect(zetaRowsShareRegistroId("2527", "2527")).toBe(true);
  });

  it("RegistroId distintos → no duplicado", () => {
    expect(zetaRowsShareRegistroId("2527", "2528")).toBe(false);
  });

  it("null en cualquier lado → no duplicado (sin info para deduplicar)", () => {
    expect(zetaRowsShareRegistroId(null, "2527")).toBe(false);
    expect(zetaRowsShareRegistroId("2527", null)).toBe(false);
    expect(zetaRowsShareRegistroId(null, null)).toBe(false);
  });

  it("coincidencia con espacios al margen", () => {
    expect(zetaRowsShareRegistroId(" 2527 ", "2527")).toBe(true);
  });
});

// ── 8. Tipos desconocidos → alertas, no datos inventados ────────────────────

describe("buildZetaContractAlerts — alertas sin inventar datos", () => {
  it("MonedaCodigo desconocido → UNKNOWN_MONEDA_CODIGO", () => {
    const alerts = buildZetaContractAlerts({
      RegistroId: "1",
      MonedaCodigo: "3",
      currency_iso: null,
    });
    expect(alerts.some((a) => a.code === "UNKNOWN_MONEDA_CODIGO")).toBe(true);
  });

  it("CFETipo desconocido → UNKNOWN_CFE_TIPO", () => {
    const alerts = buildZetaContractAlerts({
      RegistroId: "1",
      MonedaCodigo: "1",
      currency_iso: "UYU",
      CFETipo: 999,
    });
    expect(alerts.some((a) => a.code === "UNKNOWN_CFE_TIPO")).toBe(true);
  });

  it("RegistroId ausente → INVOICE_MISSING_REGISTRO_ID", () => {
    const alerts = buildZetaContractAlerts({
      RegistroId: null,
      MonedaCodigo: "1",
      currency_iso: "UYU",
    });
    expect(alerts.some((a) => a.code === "INVOICE_MISSING_REGISTRO_ID")).toBe(true);
  });

  it("ComprobanteCodigo desconocido → UNKNOWN_COMPROBANTE_CODIGO", () => {
    const alerts = buildZetaContractAlerts({
      RegistroId: "1",
      MonedaCodigo: "1",
      currency_iso: "UYU",
      ComprobanteCodigo: "9999",
    });
    expect(alerts.some((a) => a.code === "UNKNOWN_COMPROBANTE_CODIGO")).toBe(true);
  });

  it("fila correcta → sin alertas", () => {
    const alerts = buildZetaContractAlerts({
      RegistroId: "1234",
      MonedaCodigo: "2",
      currency_iso: "USD",
      CFETipo: 111,
      ComprobanteCodigo: "1",
    });
    expect(alerts).toHaveLength(0);
  });

  it("CFETipo=0 → NO genera UNKNOWN_CFE_TIPO (es código especial documentado)", () => {
    const alerts = buildZetaContractAlerts({
      RegistroId: "1",
      MonedaCodigo: "1",
      currency_iso: "UYU",
      CFETipo: 0,
    });
    expect(alerts.some((a) => a.code === "UNKNOWN_CFE_TIPO")).toBe(false);
  });

  it("MonedaCodigo conocida → no genera UNKNOWN_MONEDA_CODIGO aunque currency_iso sea válido", () => {
    const alerts = buildZetaContractAlerts({
      RegistroId: "1",
      MonedaCodigo: "1",
      currency_iso: "UYU",
      CFETipo: 101,
    });
    expect(alerts.some((a) => a.code === "UNKNOWN_MONEDA_CODIGO")).toBe(false);
  });
});
