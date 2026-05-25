/**
 * Helper puro para normalización de teléfonos uruguayos para WhatsApp.
 * Sin LLM, sin Supabase, sin efectos secundarios.
 *
 * Reglas Uruguay:
 * - Celular local con 0:   09XXXXXXX  (9 dígitos)  → 5989XXXXXXX
 * - Celular sin 0:         9XXXXXXX   (8 dígitos)  → 5989XXXXXXX
 * - Internacional:         5989XXXXXXX (11 dígitos) → válido
 * - Fijo Montevideo:       2XXXXXXX   (8 dígitos)  → no apto WhatsApp
 * - Número corto o RUT:    < 8 dígitos o > 12 dígitos → inválido
 * - No se asume ningún país distinto a Uruguay.
 */

export type PhoneCandidate = {
  label: string;
  value: string | null | undefined;
};

export type WhatsAppPhoneResult = {
  raw: string;
  digits: string;
  waHref: string;
  display: string;
  isValid: boolean;
  reason?: string;
};

// ─── Strip & normalize ────────────────────────────────────────────────────────

function stripNonDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function stripCountryPrefix(digits: string): string {
  if (digits.startsWith("00598")) return digits.slice(2);
  return digits;
}

function buildWaHref(e164: string, encodedText?: string): string {
  const base = `https://wa.me/${e164}`;
  return encodedText ? `${base}?text=${encodedText}` : base;
}

// ─── Main normalizer ──────────────────────────────────────────────────────────

export function normalizeUruguayPhoneForWhatsApp(
  value: string | null | undefined
): WhatsAppPhoneResult | null {
  if (!value || typeof value !== "string") return null;

  const raw = value.trim();
  if (!raw) return null;

  let digits = stripNonDigits(raw);
  digits = stripCountryPrefix(digits);

  if (digits.length === 0) return null;

  // Sanity: too short or suspiciously long (likely RUT/document)
  if (digits.length < 8 || digits.length > 12) {
    return {
      raw,
      digits,
      waHref: "",
      display: raw,
      isValid: false,
      reason: digits.length < 8 ? "too_short" : "too_long",
    };
  }

  let e164: string | null = null;
  let reason: string | undefined;

  // Case 1: already in international format 598...
  if (digits.startsWith("598")) {
    if (digits.length === 11 && digits[3] === "9") {
      e164 = digits; // 598 9XXXXXXX → valid mobile
    } else {
      reason = digits.length !== 11 ? "invalid_length" : "fixed_line";
    }
  }
  // Case 2: local with leading 0 — 09XXXXXXX (9 digits)
  else if (digits.startsWith("09") && digits.length === 9) {
    e164 = "598" + digits.slice(1); // 09XXXXXXX → 598 9XXXXXXX
  }
  // Case 3: local without leading 0 — 9XXXXXXX (8 digits)
  else if (digits.startsWith("9") && digits.length === 8) {
    e164 = "598" + digits; // 9XXXXXXX → 598 9XXXXXXX
  }
  // Case 4: fixed line (2XXXXXXX in Montevideo, or similar)
  else if (digits.startsWith("2") && digits.length === 8) {
    reason = "fixed_line";
  }
  // Default: unrecognized format
  else {
    reason = "unrecognized_format";
  }

  if (!e164) {
    return {
      raw,
      digits,
      waHref: "",
      display: raw,
      isValid: false,
      reason,
    };
  }

  // Format display: +598 9X XXX XXX
  const local = e164.slice(3); // 8 digits: 9XXXXXXX
  const display =
    local.length === 8
      ? `+598 ${local[0]}${local[1]} ${local.slice(2, 5)} ${local.slice(5)}`
      : `+${e164}`;

  return {
    raw,
    digits: e164,
    waHref: buildWaHref(e164),
    display,
    isValid: true,
  };
}

// ─── Pick best from candidates ────────────────────────────────────────────────

export function pickBestClientPhone(
  candidates: PhoneCandidate[]
): WhatsAppPhoneResult | null {
  // First pass: find first valid result
  for (const c of candidates) {
    const result = normalizeUruguayPhoneForWhatsApp(c.value);
    if (result?.isValid) return result;
  }
  // Second pass: return first non-null invalid result (so UI can show "no utilizable")
  for (const c of candidates) {
    const result = normalizeUruguayPhoneForWhatsApp(c.value);
    if (result) return result;
  }
  return null;
}

// ─── Build wa.me href with message ───────────────────────────────────────────

export function buildWhatsAppHref(e164: string, messageBody: string): string {
  return buildWaHref(e164, encodeURIComponent(messageBody));
}
