/**
 * Generador determinístico de mensajes de cobranza sugeridos.
 * Sin LLM, sin Supabase, sin Zeta. Solo templates con reglas.
 *
 * Reglas:
 * - No inventar montos.
 * - No mezclar UYU + USD.
 * - Lenguaje profesional, corto y educado.
 * - No amenazar, no mencionar sistema interno, no prometer acuerdos.
 * - No decir que la deuda está certificada legalmente.
 */

export type CollectionMessageTone = "friendly" | "firm" | "urgent";
export type CollectionMessageChannel = "whatsapp" | "email";

export type BuildCollectionMessageInput = {
  clientName: string;
  amount?: number;
  currency?: "UYU" | "USD";
  tone: CollectionMessageTone;
  channel: CollectionMessageChannel;
};

export type CollectionMessageSuggestion = {
  subject?: string;
  body: string;
  tone: CollectionMessageTone;
  channel: CollectionMessageChannel;
};

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatAmount(amount: number, currency: "UYU" | "USD"): string {
  const sym = currency === "UYU" ? "$" : "U$S";
  return `${sym} ${amount.toLocaleString("es-UY", { maximumFractionDigits: 0 })}`;
}

// ─── WhatsApp bodies ─────────────────────────────────────────────────────────

function buildWhatsAppBody(
  clientName: string,
  amountStr: string | null,
  tone: CollectionMessageTone
): string {
  const greeting = `Hola ${clientName}, ¿cómo estás?`;

  if (!amountStr) {
    if (tone === "friendly") {
      return `${greeting} Te escribo para consultar por un saldo pendiente en tu cuenta. ¿Nos podés confirmar una fecha estimada de pago? Gracias.`;
    }
    if (tone === "firm") {
      return `${greeting} Tenemos registrado un saldo pendiente en tu cuenta. Te pedimos por favor confirmar una fecha estimada de pago para poder ordenar la cuenta. Gracias.`;
    }
    return `${greeting} Te contacto porque figura un saldo vencido en tu cuenta. Necesitamos confirmar hoy una fecha de regularización. Quedo atento/a, gracias.`;
  }

  if (tone === "friendly") {
    return `${greeting} Te escribo por el saldo pendiente de ${amountStr}. ¿Nos podés confirmar una fecha estimada de pago? Gracias.`;
  }
  if (tone === "firm") {
    return `${greeting} Tenemos registrado un saldo pendiente de ${amountStr}. Te pedimos por favor confirmar fecha estimada de pago para poder ordenar la cuenta. Gracias.`;
  }
  // urgent
  return `${greeting} Te contacto porque figura un saldo vencido de ${amountStr}. Necesitamos confirmar hoy una fecha de regularización. Quedo atento/a, gracias.`;
}

// ─── Email subjects ───────────────────────────────────────────────────────────

function buildEmailSubject(tone: CollectionMessageTone): string {
  if (tone === "friendly") return "Consulta por saldo pendiente";
  if (tone === "firm") return "Saldo pendiente a regularizar";
  return "Saldo vencido pendiente";
}

// ─── Email bodies ─────────────────────────────────────────────────────────────

function buildEmailBody(
  clientName: string,
  amountStr: string | null,
  tone: CollectionMessageTone
): string {
  const greeting = `Hola ${clientName},\n\n¿Cómo estás?`;
  const closing = "\n\nQuedo atento/a.\nGracias.";

  if (!amountStr) {
    if (tone === "friendly") {
      return `${greeting}\n\nTe escribo para consultar por un saldo pendiente en tu cuenta. ¿Nos podés confirmar una fecha estimada de pago?${closing}`;
    }
    if (tone === "firm") {
      return `${greeting}\n\nTenemos registrado un saldo pendiente en tu cuenta. Te pedimos por favor confirmar una fecha estimada de pago para poder ordenar la cuenta.${closing}`;
    }
    return `${greeting}\n\nTe contacto porque figura un saldo vencido en tu cuenta. Necesitamos confirmar una fecha de regularización.${closing}`;
  }

  if (tone === "friendly") {
    return `${greeting}\n\nTe escribo para consultar por el saldo pendiente de ${amountStr}. ¿Nos podés confirmar una fecha estimada de pago?${closing}`;
  }
  if (tone === "firm") {
    return `${greeting}\n\nTenemos registrado un saldo pendiente de ${amountStr}. Te pedimos por favor confirmar una fecha estimada de pago para poder ordenar la cuenta.${closing}`;
  }
  // urgent
  return `${greeting}\n\nTe contacto porque figura un saldo vencido de ${amountStr}. Necesitamos confirmar una fecha de regularización.${closing}`;
}

// ─── Main builder ─────────────────────────────────────────────────────────────

export function buildCollectionMessage(
  input: BuildCollectionMessageInput
): CollectionMessageSuggestion {
  const amountStr =
    input.amount != null && input.currency
      ? formatAmount(input.amount, input.currency)
      : null;

  if (input.channel === "whatsapp") {
    return {
      body: buildWhatsAppBody(input.clientName, amountStr, input.tone),
      tone: input.tone,
      channel: input.channel,
    };
  }

  return {
    subject: buildEmailSubject(input.tone),
    body: buildEmailBody(input.clientName, amountStr, input.tone),
    tone: input.tone,
    channel: input.channel,
  };
}
