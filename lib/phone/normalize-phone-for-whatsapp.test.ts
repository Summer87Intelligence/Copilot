import { describe, expect, it } from "vitest";
import {
  normalizeUruguayPhoneForWhatsApp,
  pickBestClientPhone,
} from "./normalize-phone-for-whatsapp";

describe("normalizeUruguayPhoneForWhatsApp", () => {
  // ─── Valid mobile cases ──────────────────────────────────────────────────────

  it("09XXXXXXX (9 digits) → valid", () => {
    const r = normalizeUruguayPhoneForWhatsApp("099123456");
    expect(r?.isValid).toBe(true);
    expect(r?.digits).toBe("59899123456");
    expect(r?.waHref).toBe("https://wa.me/59899123456");
    expect(r?.display).toBe("+598 99 123 456");
  });

  it("9XXXXXXX (8 digits) → valid", () => {
    const r = normalizeUruguayPhoneForWhatsApp("99123456");
    expect(r?.isValid).toBe(true);
    expect(r?.digits).toBe("59899123456");
  });

  it("+598 99 123 456 (formatted international) → valid", () => {
    const r = normalizeUruguayPhoneForWhatsApp("+598 99 123 456");
    expect(r?.isValid).toBe(true);
    expect(r?.digits).toBe("59899123456");
  });

  it("59899123456 (bare international) → valid", () => {
    const r = normalizeUruguayPhoneForWhatsApp("59899123456");
    expect(r?.isValid).toBe(true);
    expect(r?.digits).toBe("59899123456");
  });

  it("abc099123456 (leading non-digits stripped) → valid", () => {
    const r = normalizeUruguayPhoneForWhatsApp("abc099123456");
    expect(r?.isValid).toBe(true);
    expect(r?.digits).toBe("59899123456");
  });

  it("009899123456 (00598 prefix) → valid", () => {
    const r = normalizeUruguayPhoneForWhatsApp("00598 99 123 456");
    expect(r?.isValid).toBe(true);
    expect(r?.digits).toBe("59899123456");
  });

  // ─── Invalid cases ───────────────────────────────────────────────────────────

  it("24001234 (Montevideo fixed line) → invalid, reason fixed_line", () => {
    const r = normalizeUruguayPhoneForWhatsApp("24001234");
    expect(r?.isValid).toBe(false);
    expect(r?.reason).toBe("fixed_line");
  });

  it("2101484000191 (13 digits, too long) → invalid, reason too_long", () => {
    const r = normalizeUruguayPhoneForWhatsApp("2101484000191");
    expect(r?.isValid).toBe(false);
    expect(r?.reason).toBe("too_long");
  });

  it("210148400019 (12 digits, unrecognized) → invalid, not valid for WA", () => {
    const r = normalizeUruguayPhoneForWhatsApp("210148400019");
    expect(r?.isValid).toBe(false);
  });

  it("1234567 (7 digits, too short) → invalid, reason too_short", () => {
    const r = normalizeUruguayPhoneForWhatsApp("1234567");
    expect(r?.isValid).toBe(false);
    expect(r?.reason).toBe("too_short");
  });

  it("'598' prefix with fixed line → invalid, reason fixed_line", () => {
    const r = normalizeUruguayPhoneForWhatsApp("59824001234");
    expect(r?.isValid).toBe(false);
    expect(r?.reason).toBe("fixed_line");
  });

  // ─── Null / empty cases ──────────────────────────────────────────────────────

  it("empty string → null", () => {
    expect(normalizeUruguayPhoneForWhatsApp("")).toBeNull();
  });

  it("null → null", () => {
    expect(normalizeUruguayPhoneForWhatsApp(null)).toBeNull();
  });

  it("undefined → null", () => {
    expect(normalizeUruguayPhoneForWhatsApp(undefined)).toBeNull();
  });

  it("whitespace only → null", () => {
    expect(normalizeUruguayPhoneForWhatsApp("   ")).toBeNull();
  });

  it("all non-digit characters → null", () => {
    expect(normalizeUruguayPhoneForWhatsApp("+++---")).toBeNull();
  });

  // ─── Display format ──────────────────────────────────────────────────────────

  it("display format is +598 XX XXX XXX", () => {
    const r = normalizeUruguayPhoneForWhatsApp("099123456");
    expect(r?.display).toMatch(/^\+598 \d{2} \d{3} \d{3}$/);
  });

  // ─── wa.me href ──────────────────────────────────────────────────────────────

  it("waHref points to wa.me with e164", () => {
    const r = normalizeUruguayPhoneForWhatsApp("099123456");
    expect(r?.waHref).toBe("https://wa.me/59899123456");
  });

  it("waHref is empty string when invalid", () => {
    const r = normalizeUruguayPhoneForWhatsApp("24001234");
    expect(r?.waHref).toBe("");
  });
});

describe("pickBestClientPhone", () => {
  it("returns first valid candidate", () => {
    const r = pickBestClientPhone([
      { label: "Teléfono", value: "24001234" },
      { label: "Celular", value: "099123456" },
    ]);
    expect(r?.isValid).toBe(true);
    expect(r?.digits).toBe("59899123456");
  });

  it("returns first non-null invalid if no valid exists", () => {
    const r = pickBestClientPhone([
      { label: "Teléfono", value: "24001234" },
      { label: "Celular", value: null },
    ]);
    expect(r?.isValid).toBe(false);
    expect(r?.reason).toBe("fixed_line");
  });

  it("returns null if all candidates are null/empty", () => {
    const r = pickBestClientPhone([
      { label: "Teléfono", value: null },
      { label: "Celular", value: "" },
    ]);
    expect(r).toBeNull();
  });

  it("returns null for empty array", () => {
    expect(pickBestClientPhone([])).toBeNull();
  });
});
