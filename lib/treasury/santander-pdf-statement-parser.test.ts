import { describe, expect, it } from "vitest";

import {
  NON_SANTANDER_PDF_FIXTURE,
  SANTANDER_PDF_UMSATZ_FIXTURE,
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
