/**
 * Agente de Cliente Individual — builder puro.
 * Sin LLM, sin Supabase, sin Zeta. Lee datos existentes de la ficha 360.
 *
 * Detecta (en orden de prioridad):
 * A) Sin deuda                → stable
 * B) Deuda sin vencido        → attention
 * C) Deuda vencida            → critical si relevante, attention si menor
 * D) Promesa vigente          → atenúa la severidad
 * E) Promesa vencida + deuda  → critical
 * F) Sin contacto útil + deuda → insight de contacto faltante
 * G) Datos desactualizados    → insight medium
 *
 * NO modifica datos. NO toca pagos. NO crea gestiones. Solo lee y recomienda.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClientAgentInsight = {
  id: string;
  title: string;
  body: string;
  severity: "critical" | "high" | "medium" | "low";
};

export type ClientAgentRecommendedAction = {
  label:
    | "Preparar cobranza"
    | "Ver seguimiento"
    | "Ver estado de cuenta"
    | "Ver contactos"
    | "Ver actualización";
  tab?: "contactos" | "zeta" | "cuenta";
  scrollToAssistant?: boolean;
};

export type ClientAgentBrief = {
  status: "stable" | "attention" | "critical";
  summary: string;
  mainFinding: string;
  whyItMatters: string;
  recommendedAction: ClientAgentRecommendedAction;
  insights: ClientAgentInsight[];
};

export type LastCollectionAction = {
  outcome?: string | null;
  channel?: string | null;
  createdAt?: string | null;
  nextFollowUpAt?: string | null;
  promiseDate?: string | null;
  promiseAmount?: number | null;
  promiseCurrency?: string | null;
};

export type BuildClientAgentBriefInput = {
  clientName: string;
  debtUyu: number;
  debtUsd: number;
  overdueUyu: number;
  overdueUsd: number;
  invoiceCount: number;
  receiptCount: number;
  contactsCount: number;
  hasEmail: boolean;
  hasUsableWhatsapp: boolean;
  lastSyncAt?: string | null;
  lastMovement?:
    | {
        kind: "factura" | "recibo";
        date?: string | null;
      }
    | null;
  lastCollectionAction?: LastCollectionAction | null;
  now?: Date;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function extractYmd(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.length >= 10) return raw.slice(0, 10);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function todayYmd(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function daysBetween(isoA: string, isoB: string): number {
  return Math.round(
    (new Date(`${isoB}T12:00:00Z`).getTime() - new Date(`${isoA}T12:00:00Z`).getTime()) /
      86_400_000
  );
}

function relativeLabel(isoDate: string, now: Date): string {
  try {
    const ymd = extractYmd(isoDate);
    if (!ymd) return isoDate.slice(0, 10);
    const days = daysBetween(ymd, todayYmd(now));
    if (days === 0) return "hoy";
    if (days === 1) return "ayer";
    if (days <= 6) return `hace ${days} días`;
    if (days <= 30) return "hace ~1 mes";
    return ymd;
  } catch {
    return isoDate.slice(0, 10);
  }
}

function formatDateShortYmd(ymd: string): string {
  try {
    const d = new Date(`${ymd}T12:00:00`);
    return d.toLocaleDateString("es-UY", { day: "numeric", month: "numeric" });
  } catch {
    return ymd;
  }
}

function channelLabel(channel: string | null | undefined): string {
  const map: Record<string, string> = {
    whatsapp: "WhatsApp",
    email: "email",
    call: "teléfono",
    meeting: "reunión",
    internal_note: "nota interna",
  };
  return channel ? (map[channel] ?? channel) : "un canal";
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function movementLabel(
  movement: BuildClientAgentBriefInput["lastMovement"],
  now: Date
): string | null {
  if (!movement?.date) return null;
  const relative = relativeLabel(movement.date, now);
  if (movement.kind === "recibo") {
    return `Último movimiento: cobro ${relative}.`;
  }
  return `Último movimiento: factura emitida ${relative}.`;
}

function buildContextSentence(input: BuildClientAgentBriefInput, now: Date): string {
  const firstSentenceParts: string[] = [];
  if (input.invoiceCount > 0) {
    firstSentenceParts.push(pluralize(input.invoiceCount, "factura"));
  }
  if (input.receiptCount > 0) {
    firstSentenceParts.push(pluralize(input.receiptCount, "cobro"));
  }
  if (input.contactsCount > 0) {
    firstSentenceParts.push(pluralize(input.contactsCount, "contacto"));
  }

  const sentences: string[] = [];
  if (firstSentenceParts.length > 0) {
    sentences.push(`La ficha muestra ${firstSentenceParts.join(", ")} registrados.`);
  }

  const lastMovement = movementLabel(input.lastMovement, now);
  if (lastMovement) {
    sentences.push(lastMovement);
  }

  if (input.lastSyncAt) {
    sentences.push(`Último sync ${relativeLabel(input.lastSyncAt, now)}.`);
  } else {
    sentences.push("Sin último sync visible en la ficha.");
  }

  return sentences.join(" ");
}

function buildMissingContactReason(input: BuildClientAgentBriefInput): string {
  if (input.contactsCount > 0) {
    return `Hay ${pluralize(input.contactsCount, "contacto")} cargados, pero ninguno tiene email ni WhatsApp utilizable.`;
  }
  return "No hay contactos cargados con email ni WhatsApp utilizable.";
}

function syncFreshness(
  lastSyncAt: string | null | undefined,
  now: Date
): "missing" | "stale" | "fresh" {
  const ymd = extractYmd(lastSyncAt);
  if (!ymd) return "missing";
  return daysBetween(ymd, todayYmd(now)) > 3 ? "stale" : "fresh";
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function buildClientAgentBrief(input: BuildClientAgentBriefInput): ClientAgentBrief {
  const now = input.now ?? new Date();
  const today = todayYmd(now);
  const contextSentence = buildContextSentence(input, now);

  const hasDebt = input.debtUyu > 0 || input.debtUsd > 0;
  const hasOverdue = input.overdueUyu > 0 || input.overdueUsd > 0;
  const hasUsableContact = input.hasEmail || input.hasUsableWhatsapp;
  const syncState = syncFreshness(input.lastSyncAt, now);

  // ── Promise logic ──
  const action = input.lastCollectionAction ?? null;
  const promiseDate = action?.promiseDate ?? null;
  const outcome = action?.outcome ?? null;
  const isPromiseOutcome = outcome === "promised_payment";
  const promiseDateYmd = extractYmd(promiseDate);
  const promiseIsExpired = isPromiseOutcome && !!promiseDateYmd && promiseDateYmd < today;
  const promiseIsFuture = isPromiseOutcome && !!promiseDateYmd && promiseDateYmd >= today;

  // ── Recent contact logic ──
  const actionCreatedYmd = extractYmd(action?.createdAt);
  const daysSinceAction =
    actionCreatedYmd !== null ? daysBetween(actionCreatedYmd, today) : null;
  const isRecentlyContacted =
    outcome === "contacted" && daysSinceAction !== null && daysSinceAction <= 7;

  // ── Followup logic ──
  const followupYmd = extractYmd(action?.nextFollowUpAt);
  const followupIsOverdue = !!followupYmd && followupYmd < today;
  const followupIsToday = followupYmd === today;
  const followupIsFuture = !!followupYmd && followupYmd > today;

  // ── Overdue relevance ──
  const overdueShareUyu = input.debtUyu > 0 ? input.overdueUyu / input.debtUyu : 0;
  const overdueShareUsd = input.debtUsd > 0 ? input.overdueUsd / input.debtUsd : 0;
  const isCriticalOverdue = overdueShareUyu >= 0.5 || overdueShareUsd >= 0.5;

  // ── Status ──
  let status: ClientAgentBrief["status"];

  if (!hasDebt) {
    status = "stable";
  } else if (hasOverdue) {
    if (promiseIsExpired || isCriticalOverdue || (!hasUsableContact)) {
      status = "critical";
    } else {
      status = "attention";
    }
  } else {
    // debt without overdue
    status = "attention";
  }

  // If there's a valid future promise, downgrade critical → attention (except no-contact case)
  if (status === "critical" && promiseIsFuture && hasUsableContact) {
    status = "attention";
  }

  // ── Insights ──
  const insights: ClientAgentInsight[] = [];

  // Overdue per currency (never mix)
  if (input.overdueUyu > 0 && input.debtUyu > 0) {
    const pct = Math.round((input.overdueUyu / input.debtUyu) * 100);
    insights.push({
      id: "overdue-uyu",
      title: "Saldo vencido en pesos",
      body: `Tiene $ ${fmt(input.overdueUyu)} vencidos sobre $ ${fmt(input.debtUyu)} pendientes (${pct}% vencido).`,
      severity: overdueShareUyu >= 0.5 ? "critical" : "high",
    });
  }
  if (input.overdueUsd > 0 && input.debtUsd > 0) {
    const pct = Math.round((input.overdueUsd / input.debtUsd) * 100);
    insights.push({
      id: "overdue-usd",
      title: "Saldo vencido en dólares",
      body: `Tiene U$S ${fmt(input.overdueUsd)} vencidos sobre U$S ${fmt(input.debtUsd)} pendientes (${pct}% vencido).`,
      severity: overdueShareUsd >= 0.5 ? "critical" : "high",
    });
  }

  // Debt without overdue
  if (!hasOverdue && hasDebt) {
    const parts: string[] = [];
    if (input.debtUyu > 0) parts.push(`$ ${fmt(input.debtUyu)} en pesos`);
    if (input.debtUsd > 0) parts.push(`U$S ${fmt(input.debtUsd)} en dólares`);
    insights.push({
      id: "debt-current",
      title: "Saldo pendiente",
      body: `Tiene ${parts.join(" y ")} pendiente${parts.length > 1 ? "s" : ""} sin vencer.`,
      severity: "medium",
    });
  }

  // Promise insights
  if (promiseIsExpired) {
    insights.push({
      id: "promise-expired",
      title: "Promesa de pago vencida",
      body: `Prometió pagar el ${formatDateShortYmd(promiseDateYmd!)} y la fecha ya pasó. Revisar si la deuda sigue abierta.`,
      severity: "critical",
    });
  } else if (promiseIsFuture) {
    const promiseAmountStr =
      action?.promiseAmount != null && action.promiseCurrency
        ? ` (${action.promiseCurrency === "USD" ? "U$S" : "$"} ${fmt(action.promiseAmount)})`
        : "";
    insights.push({
      id: "promise-active",
      title: "Promesa de pago",
      body: `Prometió pagar el ${formatDateShortYmd(promiseDateYmd!)}${promiseAmountStr}. Revisar si la deuda se cancela.`,
      severity: "medium",
    });
  }

  // Contact insights
  if (hasDebt) {
    if (input.hasEmail && input.hasUsableWhatsapp) {
      insights.push({
        id: "contact-ok",
        title: "Contacto disponible",
        body: "Hay email y WhatsApp disponibles para contactar al cliente.",
        severity: "low",
      });
    } else if (input.hasEmail) {
      insights.push({
        id: "contact-email",
        title: "Contacto disponible",
        body: "Hay email cargado para contactar al cliente.",
        severity: "low",
      });
    } else if (input.hasUsableWhatsapp) {
      insights.push({
        id: "contact-wa",
        title: "Contacto disponible",
        body: "Hay WhatsApp disponible para contactar al cliente.",
        severity: "low",
      });
    } else {
      insights.push({
        id: "contact-missing",
        title: "Sin contacto útil",
        body: `El cliente tiene deuda, pero ${buildMissingContactReason(input)}`,
        severity: "high",
      });
    }
  }

  // Last collection action
  if (action && action.createdAt) {
    const label = relativeLabel(action.createdAt, now);
    const ch = channelLabel(action.channel);
    let lastActionBody: string;
    let lastActionSeverity: ClientAgentInsight["severity"] = "low";

    if (isRecentlyContacted) {
      lastActionBody = `Ya contactado por ${ch} ${label}. Esperar respuesta o programar seguimiento.`;
    } else if (outcome === "no_response") {
      const days = daysSinceAction ?? 0;
      lastActionBody = `Sin respuesta en la última gestión por ${ch} (${label}).`;
      lastActionSeverity = days >= 5 ? "high" : "medium";
    } else if (outcome === "wrong_contact") {
      lastActionBody = `El último contacto fue incorrecto. Actualizar datos del cliente.`;
      lastActionSeverity = "high";
    } else if (outcome === "disputed") {
      lastActionBody = `El cliente está en disputa (gestión ${label}).`;
      lastActionSeverity = "medium";
    } else {
      lastActionBody = `La última gestión fue por ${ch} ${label}.`;
    }

    insights.push({
      id: "last-action",
      title: "Última gestión",
      body: lastActionBody,
      severity: lastActionSeverity,
    });
  } else if (hasDebt) {
    insights.push({
      id: "no-actions",
      title: "Sin gestiones registradas",
      body: "Todavía no hay gestiones de cobranza registradas para este cliente.",
      severity: "medium",
    });
  }

  // Followup scheduled insight
  if (followupYmd && hasDebt) {
    if (followupIsOverdue) {
      insights.push({
        id: "followup-scheduled",
        title: "Seguimiento vencido",
        body: `El seguimiento estaba programado para ${formatDateShortYmd(followupYmd)} y no fue retomado.`,
        severity: "high",
      });
    } else if (followupIsToday) {
      insights.push({
        id: "followup-scheduled",
        title: "Seguimiento programado hoy",
        body: "Hay un seguimiento programado para hoy. Revisar antes de fin del día.",
        severity: "high",
      });
    } else if (followupIsFuture) {
      insights.push({
        id: "followup-scheduled",
        title: "Próximo seguimiento programado",
        body: `El próximo seguimiento está programado para ${formatDateShortYmd(followupYmd)}.`,
        severity: "low",
      });
    }
  }

  if (input.lastMovement?.date) {
    const movementCopy =
      input.lastMovement.kind === "recibo"
        ? `El último movimiento fue un cobro ${relativeLabel(input.lastMovement.date, now)}.`
        : `El último movimiento fue una factura emitida ${relativeLabel(input.lastMovement.date, now)}.`;
    insights.push({
      id: "last-movement",
      title: "Último movimiento",
      body: movementCopy,
      severity: input.lastMovement.kind === "recibo" ? "low" : "medium",
    });
  }

  if (syncState === "missing") {
    insights.push({
      id: "sync-missing",
      title: "Sin última actualización visible",
      body: "La ficha no muestra un último sync confirmado. Conviene revisar la actualización de datos.",
      severity: "medium",
    });
  } else if (syncState === "stale") {
    insights.push({
      id: "sync-stale",
      title: "Datos para verificar",
      body: `El último sync visible fue ${relativeLabel(input.lastSyncAt!, now)}.`,
      severity: "medium",
    });
  }

  // ── Summary, mainFinding, whyItMatters ──
  let summary: string;
  let mainFinding: string;
  let whyItMatters: string;
  let recommendedAction: ClientAgentRecommendedAction;

  if (!hasDebt) {
    summary = "El cliente no tiene deuda pendiente registrada.";
    mainFinding = "Sin saldo pendiente";
    whyItMatters = [
      "No hay facturas abiertas actualmente.",
      contextSentence,
    ]
      .filter(Boolean)
      .join(" ");
    recommendedAction =
      syncState === "fresh"
        ? { label: "Ver estado de cuenta", tab: "cuenta" }
        : { label: "Ver actualización", tab: "zeta" };
  } else if (promiseIsExpired) {
    summary = "La promesa de pago venció y el cliente sigue con deuda.";
    mainFinding = "Promesa de pago vencida";
    whyItMatters = `${buildDebtWhyItMatters(input)} ${contextSentence}`.trim();
    recommendedAction = hasUsableContact
      ? { label: "Ver seguimiento", scrollToAssistant: true }
      : { label: "Ver contactos", tab: "contactos" };
  } else if (!hasUsableContact && hasDebt) {
    summary = "El cliente tiene deuda, pero falta un contacto utilizable.";
    mainFinding = "Sin medio de contacto";
    whyItMatters = `${buildDebtWhyItMatters(input)} ${buildMissingContactReason(input)} ${contextSentence}`.trim();
    recommendedAction = { label: "Ver contactos", tab: "contactos" };
  } else if (hasOverdue) {
    whyItMatters = `${buildDebtWhyItMatters(input)} ${contextSentence}`.trim();
    if (isRecentlyContacted && !promiseIsFuture) {
      const ch = channelLabel(action!.channel);
      const whenLabel =
        daysSinceAction === 0
          ? "hoy"
          : daysSinceAction === 1
          ? "ayer"
          : `hace ${daysSinceAction} días`;
      summary = `El cliente tiene saldo vencido, pero ya fue contactado por ${ch} ${whenLabel}. Esperar respuesta o programar seguimiento.`;
      mainFinding = "Saldo vencido — ya contactado";
      recommendedAction = { label: "Ver seguimiento", scrollToAssistant: true };
    } else if (promiseIsFuture) {
      summary = "El cliente tiene saldo vencido, pero ya hay una promesa de pago vigente.";
      mainFinding = "Saldo vencido con promesa vigente";
      recommendedAction = { label: "Ver seguimiento", scrollToAssistant: true };
    } else if (followupIsToday) {
      summary = "El cliente tiene saldo vencido. Hay un seguimiento programado para hoy.";
      mainFinding = "Saldo vencido — seguimiento hoy";
      recommendedAction = { label: "Ver seguimiento", scrollToAssistant: true };
    } else if (followupIsOverdue) {
      summary = "El cliente tiene saldo vencido y hay un seguimiento pendiente de retomar.";
      mainFinding = "Saldo vencido — seguimiento vencido";
      recommendedAction = { label: "Ver seguimiento", scrollToAssistant: true };
    } else {
      summary = "El cliente tiene saldo vencido y requiere seguimiento de cobranza.";
      mainFinding = "Saldo vencido";
      recommendedAction = { label: "Preparar cobranza", scrollToAssistant: true };
    }
  } else if (promiseIsFuture) {
    summary = "Hay una promesa de pago registrada.";
    mainFinding = "Promesa de pago vigente";
    whyItMatters = `${buildDebtWhyItMatters(input)} ${contextSentence}`.trim();
    recommendedAction = { label: "Ver seguimiento", scrollToAssistant: true };
  } else {
    summary = "El cliente tiene saldo pendiente, pero no figura deuda vencida.";
    mainFinding = "Deuda al día";
    whyItMatters = `${buildDebtWhyItMatters(input)} ${contextSentence}`.trim();
    recommendedAction =
      syncState === "stale"
        ? { label: "Ver actualización", tab: "zeta" }
        : { label: "Ver estado de cuenta", tab: "cuenta" };
  }

  return {
    status,
    summary,
    mainFinding,
    whyItMatters,
    recommendedAction,
    insights: sortInsights(insights).slice(0, 5),
  };
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function buildDebtWhyItMatters(input: BuildClientAgentBriefInput): string {
  const parts: string[] = [];

  if (input.overdueUyu > 0 && input.debtUyu > 0) {
    const pct = Math.round((input.overdueUyu / input.debtUyu) * 100);
    parts.push(
      `$ ${fmt(input.overdueUyu)} vencidos sobre $ ${fmt(input.debtUyu)} pendientes en pesos (${pct}% vencido)`
    );
  } else if (input.debtUyu > 0) {
    parts.push(`$ ${fmt(input.debtUyu)} pendientes en pesos sin vencer`);
  }

  if (input.overdueUsd > 0 && input.debtUsd > 0) {
    const pct = Math.round((input.overdueUsd / input.debtUsd) * 100);
    parts.push(
      `U$S ${fmt(input.overdueUsd)} vencidos sobre U$S ${fmt(input.debtUsd)} pendientes en dólares (${pct}% vencido)`
    );
  } else if (input.debtUsd > 0) {
    parts.push(`U$S ${fmt(input.debtUsd)} pendientes en dólares sin vencer`);
  }

  if (parts.length === 0) return "No hay deuda activa actualmente.";
  return parts.join(". ") + ".";
}

function sortInsights(insights: ClientAgentInsight[]): ClientAgentInsight[] {
  const rank: Record<ClientAgentInsight["severity"], number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  return [...insights].sort((a, b) => {
    const severityDiff = rank[a.severity] - rank[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return a.title.localeCompare(b.title, "es");
  });
}
