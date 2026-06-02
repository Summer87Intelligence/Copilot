import { describe, expect, it } from "vitest";

import {
  NON_SANTANDER_PDF_FIXTURE,
  SANTANDER_PDF_UMSATZ_FIXTURE,
  SANTANDER_PDF_UMSATZ_NO_BRAND_FIXTURE,
  SANTANDER_PDF_UMSATZ_REAL_TEXT_FIXTURE,
} from "@/lib/treasury/fixtures/santander-pdf-umsatz-text.fixture";
import {
  isSantanderPdfStatementText,
  parseSantanderPdfMetadata,
  parseSantanderPdfMovements,
  parseSantanderPdfStatementText,
} from "@/lib/treasury/santander-pdf-statement-parser";

describe("santander-pdf-statement-parser", () => {
  const { metadata, movements } = parseSantanderPdfStatementText(SANTANDER_PDF_UMSATZ_FIXTURE);

  it("detecta PDF Santander por texto", () => {
    expect(isSantanderPdfStatementText(SANTANDER_PDF_UMSATZ_FIXTURE)).toBe(true);
    expect(isSantanderPdfStatementText(NON_SANTANDER_PDF_FIXTURE)).toBe(false);
  });

  it("parsea metadata del extracto", () => {
    expect(metadata.accountNumber).toBe("005101107711");
    expect(metadata.currencyCode).toBe("USD");
    expect(metadata.periodFrom).toBe("2026-05-01");
    expect(metadata.periodTo).toBe("2026-05-31");
    expect(metadata.clientName).toContain("Easy Digital");
  });

  it("parsea crédito Dolby USD 366", () => {
    const row = movements.find((m) => m.description.includes("DOLBY"));
    expect(row).toMatchObject({
      movementDate: "2026-05-27",
      documentNumber: "527474",
      movementType: "credit",
      amount: 366,
      currencyCode: "USD",
    });
  });

  it("parsea débito GoDaddy USD 5.99", () => {
    const row = movements.find(
      (m) => m.movementType === "debit" && m.description.includes("GODADDY") && m.amount === 5.99
    );
    expect(row).toMatchObject({
      movementDate: "2026-05-29",
      movementType: "debit",
      amount: 5.99,
      currencyCode: "USD",
    });
  });

  it("parsea comisión Petrovic USD 28", () => {
    const row = movements.find(
      (m) => m.movementType === "debit" && m.description.includes("PETROVIC") && m.amount === 28
    );
    expect(row).toMatchObject({
      movementDate: "2026-05-27",
      movementType: "debit",
      amount: 28,
      currencyCode: "USD",
    });
  });

  it("parsea crédito Petrovic USD 450", () => {
    const row = movements.find(
      (m) => m.movementType === "credit" && m.description.includes("PETROVIC") && m.amount === 450
    );
    expect(row).toMatchObject({
      movementDate: "2026-05-27",
      movementType: "credit",
      amount: 450,
      currencyCode: "USD",
    });
  });

  it("parsea crédito Acquagarden USD 339", () => {
    const row = movements.find((m) => m.description.includes("ACQUAGARDEN"));
    expect(row).toMatchObject({
      movementDate: "2026-05-25",
      movementType: "credit",
      amount: 339,
      currencyCode: "USD",
    });
  });

  it("no mezcla moneda", () => {
    expect(movements.every((m) => m.currencyCode === "USD")).toBe(true);
  });

  it("genera external_id estable", () => {
    const first = parseSantanderPdfMovements(SANTANDER_PDF_UMSATZ_FIXTURE);
    const second = parseSantanderPdfMovements(SANTANDER_PDF_UMSATZ_FIXTURE);
    expect(first.map((m) => m.externalId)).toEqual(second.map((m) => m.externalId));
  });
});

describe("santander-pdf-statement-parser — sin marca extraíble", () => {
  it("reconoce PDF por estructura aunque no tenga texto Santander", () => {
    expect(isSantanderPdfStatementText(SANTANDER_PDF_UMSATZ_NO_BRAND_FIXTURE)).toBe(true);
  });

  it("rechaza PDF sin estructura bancaria válida", () => {
    expect(isSantanderPdfStatementText(NON_SANTANDER_PDF_FIXTURE)).toBe(false);
  });

  it("parsea movimientos del PDF sin marca", () => {
    const { movements } = parseSantanderPdfStatementText(SANTANDER_PDF_UMSATZ_NO_BRAND_FIXTURE);
    expect(movements.length).toBeGreaterThan(0);
  });

  it("detecta moneda USD desde línea de cuenta", () => {
    const { metadata } = parseSantanderPdfStatementText(SANTANDER_PDF_UMSATZ_NO_BRAND_FIXTURE);
    expect(metadata.currencyCode).toBe("USD");
  });

  it("extrae número de cuenta del PDF sin marca", () => {
    const { metadata } = parseSantanderPdfStatementText(SANTANDER_PDF_UMSATZ_NO_BRAND_FIXTURE);
    expect(metadata.accountNumber).toBe("005101107711");
  });

  it("parsea período del PDF sin marca", () => {
    const { metadata } = parseSantanderPdfStatementText(SANTANDER_PDF_UMSATZ_NO_BRAND_FIXTURE);
    expect(metadata.periodFrom).toBe("2026-05-01");
    expect(metadata.periodTo).toBe("2026-05-31");
  });

  it("parsea crédito Dolby del PDF sin marca", () => {
    const { movements } = parseSantanderPdfStatementText(SANTANDER_PDF_UMSATZ_NO_BRAND_FIXTURE);
    const row = movements.find((m) => m.description.includes("DOLBY"));
    expect(row).toMatchObject({
      movementDate: "2026-05-27",
      movementType: "credit",
      amount: 366,
      currencyCode: "USD",
    });
  });

  it("parsea débito GoDaddy del PDF sin marca", () => {
    const { movements } = parseSantanderPdfStatementText(SANTANDER_PDF_UMSATZ_NO_BRAND_FIXTURE);
    const row = movements.find(
      (m) => m.movementType === "debit" && m.description.includes("GODADDY") && m.amount === 5.99
    );
    expect(row).toMatchObject({
      movementDate: "2026-05-29",
      movementType: "debit",
      amount: 5.99,
      currencyCode: "USD",
    });
  });
});

describe("santander-pdf-statement-parser — texto real (espacio-separado, refs partidas)", () => {
  const { metadata, movements } = parseSantanderPdfStatementText(SANTANDER_PDF_UMSATZ_REAL_TEXT_FIXTURE);

  it("reconoce PDF real por estructura", () => {
    expect(isSantanderPdfStatementText(SANTANDER_PDF_UMSATZ_REAL_TEXT_FIXTURE)).toBe(true);
  });

  it("parsea metadata del texto real", () => {
    expect(metadata.currencyCode).toBe("USD");
    expect(metadata.accountNumber).toBe("005101107711");
    expect(metadata.periodFrom).toBe("2026-05-01");
    expect(metadata.periodTo).toBe("2026-05-31");
    expect(metadata.clientName).toContain("Easy Digital");
  });

  it("extrae 6 movimientos del texto real", () => {
    expect(movements).toHaveLength(6);
  });

  it("parsea débito comisión GoDaddy (ref partida 614822990 282)", () => {
    const row = movements.find((m) => m.description.includes("COMISION COMPRA INTERNACIONAL GODADDY"));
    expect(row).toMatchObject({
      movementDate: "2026-05-29",
      movementType: "debit",
      amount: 0.18,
      currencyCode: "USD",
      documentNumber: "614822990282",
    });
  });

  it("parsea débito compra GoDaddy 5.99 (ref partida 614822990 282)", () => {
    const row = movements.find(
      (m) => m.movementType === "debit" && m.description.includes("COMPRA CON TARJETA") && m.amount === 5.99
    );
    expect(row).toMatchObject({
      movementDate: "2026-05-29",
      movementType: "debit",
      amount: 5.99,
      currencyCode: "USD",
      documentNumber: "614822990282",
    });
  });

  it("parsea crédito Dolby 366 (ref 527474)", () => {
    const row = movements.find((m) => m.description.includes("DOLBY"));
    expect(row).toMatchObject({
      movementDate: "2026-05-27",
      movementType: "credit",
      amount: 366,
      currencyCode: "USD",
      documentNumber: "527474",
    });
  });

  it("parsea crédito Petrovic 450 (ref partida TR0084255 336)", () => {
    const row = movements.find((m) => m.movementType === "credit" && m.description.includes("PETROVIC") && m.amount === 450);
    expect(row).toMatchObject({
      movementDate: "2026-05-27",
      movementType: "credit",
      amount: 450,
      currencyCode: "USD",
      documentNumber: "TR0084255336",
    });
  });

  it("parsea débito comisión Petrovic 28 (ref partida TR0084255 336)", () => {
    const row = movements.find((m) => m.movementType === "debit" && m.description.includes("PETROVIC") && m.amount === 28);
    expect(row).toMatchObject({
      movementDate: "2026-05-27",
      movementType: "debit",
      amount: 28,
      currencyCode: "USD",
      documentNumber: "TR0084255336",
    });
  });

  it("parsea crédito Acquagarden 339 (ref LR55167568)", () => {
    const row = movements.find((m) => m.description.includes("ACQUAGARDEN"));
    expect(row).toMatchObject({
      movementDate: "2026-05-25",
      movementType: "credit",
      amount: 339,
      currencyCode: "USD",
      documentNumber: "LR55167568",
    });
  });

  it("no genera movimiento por línea de saldo informado", () => {
    expect(movements.every((m) => !m.description.toLowerCase().includes("saldo informado"))).toBe(true);
  });

  it("todos los movimientos son USD", () => {
    expect(movements.every((m) => m.currencyCode === "USD")).toBe(true);
  });
});
