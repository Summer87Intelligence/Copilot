/**
 * Decision Engine — Client Priority Ranker MVP.
 * Puro: sin DB, sin side effects.
 *
 * Score = urgency×0.55 + exposure×0.45
 * Instruction derivada de score + signals de collection_actions.
 */

import type {
  AgingBucket,
  ClientInstruction,
  DECollectionAction,
  DECompany,
  DEPendingInvoice,
  RankedClient,
  SimpleEvidence,
} from "@/lib/decision-engine/de-types";
import { CLIENT_INSTRUCTION_LABELS } from "@/lib/decision-engine/de-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
}

function syntheticDue(issueDate: string | null): Date | null {
  if (!issueDate) return null;
  const d = new Date(issueDate);
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + 30);
  return d;
}

function daysOverdue(inv: DEPendingInvoice, now: Date): number {
  const dueRaw = inv.due_date ?? null;
  const due = dueRaw ? new Date(dueRaw) : syntheticDue(inv.issue_date);
  if (!due) return 0;
  return Math.max(0, daysBetween(due, now));
}

function invoiceAgingBucket(inv: DEPendingInvoice, now: Date): AgingBucket {
  const days = daysOverdue(inv, now);
  if (days === 0) {
    const dueRaw = inv.due_date ?? null;
    const due = dueRaw ? new Date(dueRaw) : syntheticDue(inv.issue_date);
    if (!due || due > now) return "not_due";
  }
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

const URGENCY_BY_BUCKET: Record<AgingBucket, number> = {
  not_due:  0.05,
  "0-30":   0.25,
  "31-60":  0.55,
  "61-90":  0.80,
  "90+":    1.00,
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// ---------------------------------------------------------------------------
// Per-company aggregation
// ---------------------------------------------------------------------------

type CompanyPendingSummary = {
  company_id: string;
  currency_code: string;
  total_pending: number;
  invoice_count: number;
  oldest_days: number;
  dominant_bucket: AgingBucket;
  invoices: DEPendingInvoice[];
};

function groupPendingByCompanyCurrency(
  invoices: DEPendingInvoice[],
  now: Date
): CompanyPendingSummary[] {
  const map = new Map<string, CompanyPendingSummary>();

  for (const inv of invoices) {
    if (inv.balance_amount <= 0) continue;
    const cur = (inv.currency_code ?? "UYU").toUpperCase();
    const key = `${inv.company_id}::${cur}`;

    if (!map.has(key)) {
      map.set(key, {
        company_id: inv.company_id,
        currency_code: cur,
        total_pending: 0,
        invoice_count: 0,
        oldest_days: 0,
        dominant_bucket: "not_due",
        invoices: [],
      });
    }

    const entry = map.get(key)!;
    entry.total_pending += inv.balance_amount;
    entry.invoice_count += 1;
    entry.invoices.push(inv);

    const days = daysOverdue(inv, now);
    if (days > entry.oldest_days) entry.oldest_days = Math.round(days);
  }

  // Compute dominant bucket per entry
  for (const [, entry] of map) {
    const bucketAmounts: Record<AgingBucket, number> = {
      not_due: 0, "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0,
    };
    for (const inv of entry.invoices) {
      const bucket = invoiceAgingBucket(inv, now);
      bucketAmounts[bucket] += inv.balance_amount;
    }
    let maxBucket: AgingBucket = "not_due";
    let maxAmount = -1;
    for (const [bucket, amount] of Object.entries(bucketAmounts)) {
      if (amount > maxAmount) {
        maxAmount = amount;
        maxBucket = bucket as AgingBucket;
      }
    }
    entry.dominant_bucket = maxBucket;
  }

  return Array.from(map.values());
}

// ---------------------------------------------------------------------------
// Collection action signals
// ---------------------------------------------------------------------------

type ActionSignals = {
  collection_status: string | null;
  last_action_date: string | null;
  has_active_promise: boolean;
  promise_date: string | null;
  promise_amount: number | null;
  promise_currency: string | null;
  days_since_contact: number | null;
  has_escalation: boolean;
  has_broken_promise: boolean;
};

function extractActionSignals(
  companyId: string,
  actions: DECollectionAction[],
  now: Date
): ActionSignals {
  const companyActions = actions
    .filter((a) => a.company_id === companyId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (companyActions.length === 0) {
    return {
      collection_status: null,
      last_action_date: null,
      has_active_promise: false,
      promise_date: null,
      promise_amount: null,
      promise_currency: null,
      days_since_contact: null,
      has_escalation: false,
      has_broken_promise: false,
    };
  }

  const latest = companyActions[0]!;
  const contactDates = companyActions
    .filter((a) => a.contact_date != null)
    .map((a) => new Date(a.contact_date!));
  const lastContact = contactDates.length > 0
    ? contactDates.reduce((a, b) => (a > b ? a : b))
    : null;

  const promise = companyActions.find(
    (a) => a.action_type === "payment_promise" && a.promise_date != null && a.status !== "paid"
  );
  const hasActivePromise = !!promise && !!promise.promise_date && new Date(promise.promise_date) > now;

  const hasBrokenPromise = companyActions.some(
    (a) =>
      a.action_type === "payment_promise" &&
      a.promise_date != null &&
      new Date(a.promise_date) < now &&
      a.status !== "paid"
  );

  const hasEscalation = companyActions.some((a) => a.status === "escalated");

  return {
    collection_status: latest.status,
    last_action_date: latest.created_at,
    has_active_promise: hasActivePromise,
    promise_date: promise?.promise_date ?? null,
    promise_amount: promise?.promise_amount ?? null,
    promise_currency: promise?.promise_currency ?? null,
    days_since_contact: lastContact
      ? Math.round(daysBetween(lastContact, now))
      : null,
    has_escalation: hasEscalation,
    has_broken_promise: hasBrokenPromise,
  };
}

// ---------------------------------------------------------------------------
// Instruction derivation
// ---------------------------------------------------------------------------

function deriveInstruction(
  summary: CompanyPendingSummary,
  signals: ActionSignals,
  score: number
): ClientInstruction {
  // Override: promesa activa y no vencida
  if (signals.has_active_promise) return "esperar_promesa";

  // Override: promesa rota → escalar
  if (signals.has_broken_promise) return "escalar";

  // Override: ya escalado
  if (signals.has_escalation) return "escalar";

  // Score-based con matices
  if (score >= 70) {
    // Fue contactado hace menos de 5 días → no volver a llamar
    if (signals.days_since_contact !== null && signals.days_since_contact < 5) {
      return "seguimiento";
    }
    return "llamar_hoy";
  }

  if (score >= 45) {
    if (signals.days_since_contact === null || signals.days_since_contact > 14) {
      return "recordatorio";
    }
    return "seguimiento";
  }

  // Bucket 90+ sin acciones recientes → sí llamar aunque score sea bajo por exposure
  if (summary.dominant_bucket === "90+" && signals.days_since_contact === null) {
    return "llamar_hoy";
  }

  return "monitorear";
}

// ---------------------------------------------------------------------------
// Explanation builder
// ---------------------------------------------------------------------------

function buildEvidence(
  summary: CompanyPendingSummary,
  signals: ActionSignals,
  concentrationPct: number
): SimpleEvidence[] {
  const evidence: SimpleEvidence[] = [];

  // Aging — siempre primero
  if (summary.oldest_days >= 90) {
    evidence.push({
      label: "Días vencido",
      value: `${summary.oldest_days} días (crítico)`,
      is_decisive: true,
    });
  } else if (summary.oldest_days > 0) {
    evidence.push({
      label: "Días vencido",
      value: `${summary.oldest_days} días`,
      is_decisive: summary.oldest_days > 60,
    });
  }

  // Monto
  evidence.push({
    label: "Monto pendiente",
    value: `${summary.currency_code} ${summary.total_pending.toLocaleString("es-UY", { maximumFractionDigits: 0 })}`,
    is_decisive: false,
  });

  // Concentración
  if (concentrationPct > 20) {
    evidence.push({
      label: "Concentración cartera",
      value: `${concentrationPct.toFixed(0)}% del total ${summary.currency_code}`,
      is_decisive: concentrationPct > 35,
    });
  }

  // Facturas
  if (summary.invoice_count > 1) {
    evidence.push({
      label: "Facturas pendientes",
      value: `${summary.invoice_count} facturas`,
      is_decisive: false,
    });
  }

  // Promesa rota
  if (signals.has_broken_promise) {
    evidence.push({
      label: "Historial de promesas",
      value: "Promesa de pago vencida sin cobrar",
      is_decisive: true,
    });
  }

  // Sin contacto
  if (signals.days_since_contact === null && summary.oldest_days > 30) {
    evidence.push({
      label: "Último contacto",
      value: "Sin contacto registrado",
      is_decisive: false,
    });
  } else if (signals.days_since_contact !== null && signals.days_since_contact > 30) {
    evidence.push({
      label: "Último contacto",
      value: `Hace ${signals.days_since_contact} días`,
      is_decisive: false,
    });
  }

  return evidence;
}

function buildReason(
  summary: CompanyPendingSummary,
  signals: ActionSignals,
  instruction: ClientInstruction
): string {
  if (signals.has_active_promise && signals.promise_date) {
    const d = new Date(signals.promise_date).toLocaleDateString("es-UY", {
      day: "numeric",
      month: "short",
    });
    return `Promesa de pago registrada para el ${d}.`;
  }

  if (signals.has_broken_promise) {
    return `Promesa de pago anterior no se cumplió. Requiere escalamiento.`;
  }

  if (summary.oldest_days >= 90) {
    return `${summary.oldest_days} días sin cobrar en deuda vencida crítica.`;
  }

  if (summary.oldest_days > 60) {
    return `Deuda con ${summary.oldest_days} días vencida, riesgo de irrecuperabilidad.`;
  }

  if (summary.oldest_days > 30) {
    return `${summary.invoice_count} factura(s) vencida(s) sin gestión reciente.`;
  }

  if (instruction === "recordatorio") {
    return `Factura próxima a vencer o sin contacto reciente.`;
  }

  return `Deuda activa de ${summary.currency_code} ${summary.total_pending.toLocaleString("es-UY", { maximumFractionDigits: 0 })}.`;
}

// ---------------------------------------------------------------------------
// Scorer
// ---------------------------------------------------------------------------

function computeClientScore(
  summary: CompanyPendingSummary,
  totalPendingInCurrency: number
): number {
  const urgency = URGENCY_BY_BUCKET[summary.dominant_bucket] ?? 0.05;

  const exposure = totalPendingInCurrency > 0
    ? clamp(summary.total_pending / totalPendingInCurrency, 0, 1)
    : 0;

  const raw = urgency * 0.55 + exposure * 0.45;
  return Math.round(clamp(raw * 100, 0, 100));
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export function rankClients(
  pendingInvoices: DEPendingInvoice[],
  companies: DECompany[],
  actions: DECollectionAction[],
  now?: Date
): RankedClient[] {
  const ref = now ?? new Date();
  const companyMap = new Map(companies.map((c) => [c.id, c.name]));

  const summaries = groupPendingByCompanyCurrency(pendingInvoices, ref);

  // Total pending per currency (for exposure normalization)
  const totalByCurrency: Record<string, number> = {};
  for (const s of summaries) {
    totalByCurrency[s.currency_code] = (totalByCurrency[s.currency_code] ?? 0) + s.total_pending;
  }

  const ranked: RankedClient[] = [];

  for (const summary of summaries) {
    const totalInCurrency = totalByCurrency[summary.currency_code] ?? 1;
    const concentrationPct = Math.round((summary.total_pending / totalInCurrency) * 100);
    const score = computeClientScore(summary, totalInCurrency);
    const signals = extractActionSignals(summary.company_id, actions, ref);
    const instruction = deriveInstruction(summary, signals, score);
    const evidence = buildEvidence(summary, signals, concentrationPct);
    const reason = buildReason(summary, signals, instruction);

    ranked.push({
      company_id: summary.company_id,
      company_name: companyMap.get(summary.company_id) ?? summary.company_id,
      currency_code: summary.currency_code,
      pending_amount: Math.round(summary.total_pending * 100) / 100,
      invoice_count: summary.invoice_count,
      oldest_days: summary.oldest_days,
      dominant_bucket: summary.dominant_bucket,
      score,
      instruction,
      instruction_label: CLIENT_INSTRUCTION_LABELS[instruction],
      reason,
      evidence,
      collection_status: signals.collection_status,
      last_action_date: signals.last_action_date,
      has_active_promise: signals.has_active_promise,
      promise_date: signals.promise_date,
      promise_amount: signals.promise_amount,
      promise_currency: signals.promise_currency,
      concentration_pct: concentrationPct,
    });
  }

  return ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.pending_amount - a.pending_amount;
  });
}
