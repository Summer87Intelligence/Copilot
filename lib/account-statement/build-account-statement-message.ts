export type AccountStatementMessageInput = {
  clientName: string;
  periodFrom: string; // YYYY-MM-DD
  periodTo: string;   // YYYY-MM-DD
  currency: "UYU" | "USD";
  debtAmount: number;
  overdueAmount?: number;
  channel: "email" | "whatsapp";
  tone: "friendly" | "firm" | "brief";
};

export type AccountStatementMessage = {
  subject?: string;
  body: string;
};

function formatCurrency(amount: number, currency: "UYU" | "USD"): string {
  const rounded = Math.round(amount).toLocaleString("es-AR", { maximumFractionDigits: 0 });
  return currency === "UYU" ? `$ ${rounded}` : `U$S ${rounded}`;
}

function formatPeriod(from: string, to: string): string {
  const fmt = (d: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d.trim());
    if (!m) return d;
    return `${m[3]}/${m[2]}/${m[1]}`;
  };
  return `${fmt(from)} al ${fmt(to)}`;
}

export function buildAccountStatementMessage(
  input: AccountStatementMessageInput
): AccountStatementMessage {
  const { clientName, periodFrom, periodTo, currency, debtAmount, overdueAmount, channel, tone } =
    input;

  const debtStr = formatCurrency(debtAmount, currency);
  const period = formatPeriod(periodFrom, periodTo);
  const hasOverdue = overdueAmount != null && overdueAmount > 0;
  const overdueStr = hasOverdue ? formatCurrency(overdueAmount!, currency) : "";

  if (channel === "email") {
    const subject = `Estado de cuenta – ${clientName}`;

    let body: string;
    if (tone === "brief") {
      body = [
        `Estimado/a ${clientName},`,
        "",
        `Adjunto encontrará el estado de cuenta correspondiente al período ${period}.`,
        `Deuda actual: ${debtStr}${hasOverdue ? ` (${overdueStr} atrasado)` : ""}.`,
        "",
        "Quedo a disposición para cualquier consulta.",
        "Saludos.",
      ].join("\n");
    } else if (tone === "friendly") {
      body = [
        `Hola ${clientName},`,
        "",
        `Espero que todo marche bien. Te compartimos el estado de cuenta del período ${period}.`,
        "",
        `Saldo total pendiente: ${debtStr}${hasOverdue ? `\nSaldo atrasado: ${overdueStr}` : ""}`,
        "",
        "Si tenés alguna consulta sobre el detalle, con gusto te ayudamos.",
        "",
        "¡Gracias y saludos!",
      ].join("\n");
    } else {
      // firm
      body = [
        `Estimado/a ${clientName},`,
        "",
        `Por medio del presente le informamos su estado de cuenta al período ${period}.`,
        "",
        `Deuda actual: ${debtStr}`,
        ...(hasOverdue
          ? [`Saldo atrasado: ${overdueStr}`, "", "Le solicitamos regularizar el saldo atrasado a la brevedad."]
          : []),
        "",
        "Ante cualquier consulta, no dude en comunicarse.",
        "Saludos cordiales.",
      ].join("\n");
    }

    return { subject, body };
  }

  // WhatsApp — no subject
  let body: string;
  if (tone === "brief") {
    body = [
      `Hola ${clientName}, te enviamos el estado de cuenta del período ${period}.`,
      `Saldo: ${debtStr}${hasOverdue ? ` (${overdueStr} atrasado)` : ""}.`,
      "Ante cualquier consulta, avisanos.",
    ].join("\n");
  } else if (tone === "friendly") {
    body = [
      `¡Hola ${clientName}! 👋`,
      `Te compartimos el estado de cuenta del período ${period}.`,
      "",
      `💰 Saldo total: ${debtStr}`,
      ...(hasOverdue ? [`⚠️ Atrasado: ${overdueStr}`] : []),
      "",
      "Cualquier consulta, estamos disponibles. ¡Gracias!",
    ].join("\n");
  } else {
    // firm
    body = [
      `Estimado/a ${clientName}:`,
      `Le informamos su estado de cuenta al período ${period}.`,
      `Deuda actual: ${debtStr}${hasOverdue ? ` | Atrasado: ${overdueStr}` : ""}.`,
      "Le solicitamos atender el saldo a la brevedad. Gracias.",
    ].join("\n");
  }

  return { body };
}
