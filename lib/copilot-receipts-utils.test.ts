import { describe, expect, it } from "vitest";

import { isReceiptVoidLike } from "./copilot-receipts-utils";

describe("isReceiptVoidLike", () => {
  const voidCases = [
    "void",
    "voided",
    "canceled",
    "cancelled",
    "anulada",
    "anulado",
    "annulled",
    "annul",
    " VOID ",
    "Cancelled",
    "ANULADA",
  ] as const;

  it.each(voidCases)("returns true for void-like status %j", (status) => {
    expect(isReceiptVoidLike(status)).toBe(true);
  });

  const nonVoidCases = [
    "paid",
    "applied",
    "processing",
    "pending",
    "",
    null,
    undefined,
  ] as const;

  it.each(nonVoidCases)("returns false for non-void status %j", (status) => {
    expect(isReceiptVoidLike(status)).toBe(false);
  });
});
