export type ReportContactChannels = {
  hasWhatsApp: boolean;
  hasEmail: boolean;
  label: string;
};

const INVALID_EMAIL_PLACEHOLDERS = new Set([
  "-",
  "—",
  "n/a",
  "na",
  "sin email",
  "sin correo",
  "no email",
]);

/** Solo dígitos del teléfono. */
export function phoneDigitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

function isRepeatedDigitSequence(digits: string): boolean {
  return digits.length > 0 && /^(\d)\1+$/.test(digits);
}

/**
 * Celular uruguayo usable para WhatsApp.
 * - Mínimo 8 dígitos reales.
 * - Rechaza secuencias triviales (22, 2222222, 00000000).
 * - Acepta 09xxxxxxxx, 9xxxxxxxx, 5989xxxxxxxx.
 */
export function isValidWhatsAppPhone(phone: string | null | undefined): boolean {
  if (!phone?.trim()) return false;

  const digits = phoneDigitsOnly(phone);
  if (digits.length < 8) return false;
  if (isRepeatedDigitSequence(digits)) return false;

  if (digits.length === 9 && digits.startsWith("09")) {
    return digits[2] === "9";
  }

  if (digits.length === 8 && digits.startsWith("9")) {
    return true;
  }

  if (digits.length === 11 && digits.startsWith("5989")) {
    return true;
  }

  if (digits.length === 12 && digits.startsWith("59809")) {
    return true;
  }

  return false;
}

/** Email con formato mínimo válido para el reporte. */
export function isValidReportEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;

  const normalized = email.trim().toLowerCase();
  if (INVALID_EMAIL_PLACEHOLDERS.has(normalized)) return false;
  if (!normalized.includes("@")) return false;

  const parts = normalized.split("@");
  if (parts.length !== 2) return false;

  const [local, domain] = parts;
  if (!local || !domain || !domain.includes(".")) return false;

  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized);
}

/** Etiqueta de contacto para el reporte (solo canales validados). */
export function buildReportContactLabel(input: {
  phone?: string | null;
  email?: string | null;
}): string {
  const hasWhatsApp = isValidWhatsAppPhone(input.phone);
  const hasEmail = isValidReportEmail(input.email);

  if (hasWhatsApp && hasEmail) return "WhatsApp / Email";
  if (hasWhatsApp) return "WhatsApp";
  if (hasEmail) return "Email";
  return "Sin contacto";
}

export function resolveReportContactChannels(input: {
  phone?: string | null;
  email?: string | null;
}): ReportContactChannels {
  const hasWhatsApp = isValidWhatsAppPhone(input.phone);
  const hasEmail = isValidReportEmail(input.email);
  return {
    hasWhatsApp,
    hasEmail,
    label: buildReportContactLabel(input),
  };
}
