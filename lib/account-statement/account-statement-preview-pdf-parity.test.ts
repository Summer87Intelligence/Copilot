/**
 * Preview JSON ↔ PDF parity — Estudio Fletcher SAS UYU opening -700.
 */

import { PDFParse } from "pdf-parse";
import { describe, expect, it } from "vitest";

import { buildClientAccountStatement } from "@/lib/copilot-client-account-statement";
import {
  buildAccountStatementPeriodBlocks,
  getPreviousBalance,
  formatSignedBalanceAmount,
} from "@/lib/account-statement/account-statement-period-model";
import { renderAccountStatementPdf } from "@/lib/account-statement/render-account-statement-pdf";
import type { DataRow } from "@/lib/copilot-data";

async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
}

function inv(id: string, date: string, total: number, number: string): DataRow {
  return {
    id,
    invoice_number: number,
    issue_date: date,
    total_amount: total,
    currency_code: "UYU",
    is_active: true,
    category: "Zeta / comprobantes por cliente",
    zeta_metadata: { zeta_customer_voucher_v1: { cfe_tipo: "111" } },
  };
}

function rec(id: string, date: string, amount: number, ref: string): DataRow {
  return {
    id,
    receipt_number: ref,
    receipt_date: date,
    amount,
    currency_code: "UYU",
    is_active: true,
    reference: ref,
  };
}

/** Fletcher UYU 2026 — opening -700, saldo final ledger 28.580 */
const FLETCHER_INVOICES: DataRow[] = [
  inv("f1", "2026-01-05", 14640, "ZETA:CCV1:0:38:A:2662"),
  inv("f2", "2026-02-05", 14640, "ZETA:CCV1:0:38:A:2742"),
  inv("f3", "2026-03-04", 14640, "ZETA:CCV1:0:38:A:2775"),
  inv("f4", "2026-04-03", 14640, "ZETA:CCV1:0:38:A:2859"),
  inv("f5", "2026-05-04", 14640, "ZETA:CCV1:0:38:A:2891"),
  inv("f6", "2026-06-04", 14640, "ZETA:CCV1:0:38:A:2948"),
];

const FLETCHER_RECEIPTS: DataRow[] = [
  rec("r1", "2026-01-14", 14640, "A517"),
  rec("r2", "2026-03-11", 29280, "A619"),
  rec("r3", "2026-04-25", 14640, "A715"),
];

const FROM = "2026-01-01";
const TO = "2026-12-31";
const OPENING = -700;

describe("Fletcher UYU — preview model = PDF model (opening -700)", () => {
  const statement = buildClientAccountStatement({
    invoices: FLETCHER_INVOICES,
    receipts: FLETCHER_RECEIPTS,
    ledgerMode: true,
    openingBalanceUyu: OPENING,
  });

  const blocks = buildAccountStatementPeriodBlocks(statement, ["UYU"], FROM, TO);
  const uyu = blocks[0]!;

  it("baseline / saldo anterior al período = -700 (no cae a 0)", () => {
    expect(statement.uyu.baselineBalance).toBe(OPENING);
    expect(getPreviousBalance(statement.uyu, FROM)).toBe(OPENING);
    expect(uyu.previousBalance).toBe(OPENING);
  });

  it("saldo final ledger = 28.580", () => {
    expect(statement.uyu.summary.finalBalance).toBe(28580);
    expect(uyu.finalBalance).toBe(28580);
  });

  it("formatSignedBalanceAmount muestra -700,00 (no 700 ambiguo)", () => {
    expect(formatSignedBalanceAmount(-700)).toBe("-700,00");
    expect(formatSignedBalanceAmount(28580)).toBe("28.580,00");
  });

  it("PDF incluye saldo anterior -700 y saldo final 28.580", async () => {
    const buf = await renderAccountStatementPdf({
      companyName: "Estudio Fletcher SAS",
      statement,
      client: { name: "Estudio Fletcher SAS", code: "38" },
      currencies: ["UYU"],
      from: FROM,
      to: TO,
    });

    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
    const text = await extractPdfText(buf);
    expect(text).toContain("Saldo anterior");
    expect(text).toMatch(/-700[,.]00|700[,.]00/);
    expect(text).toMatch(/28[.,]580[,.]00|28580/);
  }, 20_000);

  it("period blocks preview y getPreviousBalance coinciden", () => {
    const prevDirect = getPreviousBalance(statement.uyu, FROM);
    expect(uyu.previousBalance).toBe(prevDirect);
    const lastMv = uyu.movements[uyu.movements.length - 1];
    expect(lastMv?.runningBalance).toBe(28580);
    expect(uyu.finalBalance).toBe(lastMv?.runningBalance);
  });
});

describe("sin opening — saldo anterior cae a 0 (regresión)", () => {
  const statement = buildClientAccountStatement({
    invoices: FLETCHER_INVOICES,
    receipts: FLETCHER_RECEIPTS,
    ledgerMode: true,
  });

  it("previousBalance = 0 sin ledger_opening_balance", () => {
    expect(getPreviousBalance(statement.uyu, FROM)).toBe(0);
    expect(statement.uyu.summary.finalBalance).toBe(29280);
  });
});
