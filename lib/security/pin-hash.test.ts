import { describe, expect, it } from "vitest";

import { hashPin, safeEqualPlaintextPin, verifyPinAgainstHash } from "@/lib/security/pin-hash";

describe("pin-hash", () => {
  it(
    "hashes and verifies PIN",
    async () => {
      const h = await hashPin("4242");
      expect(h.length).toBeGreaterThan(20);
      expect(await verifyPinAgainstHash("4242", h)).toBe(true);
      expect(await verifyPinAgainstHash("4243", h)).toBe(false);
    },
    20_000
  );

  it("safeEqualPlaintextPin matches equal strings", () => {
    expect(safeEqualPlaintextPin("ab", "ab")).toBe(true);
    expect(safeEqualPlaintextPin("ab", "ac")).toBe(false);
  });

  it("verifyPinAgainstHash returns false on garbage hash", async () => {
    expect(await verifyPinAgainstHash("x", "not-a-phc-string")).toBe(false);
  });
});
