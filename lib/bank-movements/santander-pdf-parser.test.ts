import { describe, expect, it } from "vitest";

import {
  NON_SANTANDER_BANK_PDF_FIXTURE,
  SANTANDER_MULTILINE_DESCRIPTION_FIXTURE,
  SANTANDER_USD_JULY_AUSZUG_FIXTURE,
  SANTANDER_USD_JUNE_UMSATZ_FIXTURE,
  SANTANDER_UYU_JULY_AUSZUG_FIXTURE,
} from "@/lib/bank-movements/fixtures/santander-pdf-text.fixture";
import {
  buildSantanderBankStatementPreview,
  normalizeSantanderPdfExtractedText,
  parseSantanderBankStatementText,
  parseSantanderPdfDate,
  parseUruguayMoney,
} from "@/lib/bank-movements/santander-pdf-parser";

describe("parseUruguayMoney", () => {
  it("parsea formato Uruguay", () => {
    expect(parseUruguayMoney("531.696,06")).toBe(531696.06);
    expect(parseUruguayMoney("-3.721,00")).toBe(-3721);
    expect(parseUruguayMoney("0,18")).toBe(0.18);
  });
});

describe("parseSantanderPdfDate", () => {
  it("parsea fechas DD/MM/YYYY", () => {
    expect(parseSantanderPdfDate("29/06/2026")).toBe("2026-06-29");
    expect(parseSantanderPdfDate("01/07/2026")).toBe("2026-07-01");
  });
});

describe("normalizeSantanderPdfExtractedText", () => {
  it("une fecha partida en dos líneas", () => {
    const raw = "01/07/20\n26\tZETA\tPAGO";
    expect(normalizeSantanderPdfExtractedText(raw)).toContain("01/07/2026");
  });
});

describe("Santander UYU julio (auszug)", () => {
  const preview = buildSantanderBankStatementPreview(SANTANDER_UYU_JULY_AUSZUG_FIXTURE);

  it("detecta cuenta y moneda UYU", () => {
    expect(preview.account_number).toBe("000001211749");
    expect(preview.currency_code).toBe("UYU");
    expect(preview.period_start).toBe("2026-07-01");
    expect(preview.period_end).toBe("2026-07-31");
  });

  it("detecta ZETA -3721", () => {
    const row = preview.movements.find((m) => m.description.includes("ZETA"));
    expect(row).toMatchObject({
      date: "2026-07-01",
      direction: "outflow",
      debit: 3721,
      amount: -3721,
      reference: "ZETA001",
    });
  });

  it("detecta Movistar -3548", () => {
    const row = preview.movements.find((m) => m.description.includes("MOVISTAR"));
    expect(row).toMatchObject({
      direction: "outflow",
      debit: 3548,
      amount: -3548,
    });
  });

  it("detecta ingreso 6000", () => {
    const row = preview.movements.find((m) => m.direction === "inflow" && m.credit === 6000);
    expect(row).toMatchObject({
      direction: "inflow",
      credit: 6000,
      amount: 6000,
    });
  });

  it("ignora saldo inicial y final como movimientos", () => {
    expect(preview.movements.every((m) => !/saldo (inicial|final)/i.test(m.description))).toBe(true);
    expect(preview.opening_balance).toBe(531696.06);
    expect(preview.closing_balance).toBe(530427.06);
  });
});

describe("Santander USD julio (auszug)", () => {
  const preview = buildSantanderBankStatementPreview(SANTANDER_USD_JULY_AUSZUG_FIXTURE);

  it("detecta cuenta y moneda USD", () => {
    expect(preview.account_number).toBe("005101107711");
    expect(preview.currency_code).toBe("USD");
  });

  it("detecta retiro -1000", () => {
    const row = preview.movements.find((m) => m.description.includes("RETIRO"));
    expect(row).toMatchObject({
      direction: "outflow",
      debit: 1000,
      amount: -1000,
    });
  });

  it("detecta ingreso 427", () => {
    const row = preview.movements.find((m) => m.credit === 427);
    expect(row).toMatchObject({
      direction: "inflow",
      credit: 427,
      amount: 427,
    });
  });
});

describe("Santander USD junio (umsatz, fecha completa)", () => {
  const preview = buildSantanderBankStatementPreview(SANTANDER_USD_JUNE_UMSATZ_FIXTURE);

  it("detecta compra OpenAI -90.91", () => {
    const row = preview.movements.find(
      (m) => m.description.includes("OPENAI") && m.description.includes("COMPRA")
    );
    expect(row).toMatchObject({
      date: "2026-06-05",
      direction: "outflow",
      debit: 90.91,
      amount: -90.91,
    });
  });

  it("detecta comisión OpenAI -2.73", () => {
    const row = preview.movements.find(
      (m) => m.description.includes("OPENAI") && m.description.includes("COMISION")
    );
    expect(row).toMatchObject({
      direction: "outflow",
      debit: 2.73,
      amount: -2.73,
    });
  });
});

describe("descripciones multilínea", () => {
  it("no rompe con descripción en varias líneas", () => {
    const { movements } = parseSantanderBankStatementText(SANTANDER_MULTILINE_DESCRIPTION_FIXTURE);
    const row = movements.find((m) => m.description.includes("PROVEEDOR"));
    expect(row).toBeDefined();
    expect(row?.direction).toBe("outflow");
    expect(row?.debit).toBe(1250.5);
  });
});

describe("rechazo de PDF no Santander", () => {
  it("lanza error para extracto desconocido", () => {
    expect(() => parseSantanderBankStatementText(NON_SANTANDER_BANK_PDF_FIXTURE)).toThrow("NOT_SANTANDER");
  });
});

describe("totales del preview", () => {
  it("calcula inflows, outflows y neto", () => {
    const preview = buildSantanderBankStatementPreview(SANTANDER_UYU_JULY_AUSZUG_FIXTURE);
    expect(preview.movements_count).toBe(3);
    expect(preview.totals.inflows).toBe(6000);
    expect(preview.totals.outflows).toBe(7269);
    expect(preview.totals.net).toBe(-1269);
  });
});
