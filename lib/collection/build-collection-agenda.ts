/**
 * Agenda de Cobranza — builder puro.
 * Sin DB, sin Supabase, sin Zeta. Solo reglas determinísticas sobre CollectionAction[].
 *
 * Clasifica la gestión más reciente por cliente en secciones operativas:
 * - Seguimientos vencidos / hoy / próximos
 * - Promesas vencidas / futuras
 * - Contactados recientes (sin señal pendiente)
 *
 * Priority order per client (first match wins):
 *   1. Promesa vencida
 *   2. Seguimiento vencido / hoy / próximo
 *   3. Promesa futura
 *   4. Contactado reciente (wrong_contact → overdue, no_response ≥5d → overdue)
 */

import type { CollectionAction } from "@/lib/copilot-collection-types";
import { formatYmd } from "./collection-date-helpers";

// ─── Input / Output types ─────────────────────────────────────────────────────

export type AgendaClientInfo = {
  companyId: string;
  name: string;
  debtUyu?: number;
  debtUsd?: number;
  overdueUyu?: number;
  overdueUsd?: number;
};

export type BuildCollectionAgendaInput = {
  actions: CollectionAction[];
  clients?: AgendaClientInfo[];
  now?: Date;
};

export type CollectionAgendaItemType =
  | "followup_overdue"
  | "followup_today"
  | "followup_upcoming"
  | "promise_overdue"
  | "promise_upcoming"
  | "recent_contact";

export type CollectionAgendaItem = {
  companyId: string;
  clientName: string;
  type: CollectionAgendaItemType;
  severity: "critical" | "high" | "medium" | "low";
  dateLabel: string;
  channelLabel?: string;
  outcomeLabel?: string;
  amountLabel?: string;
  note?: string;
  href: string;
};

export type CollectionAgenda = {
  overdueFollowups: CollectionAgendaItem[];
  dueTodayFollowups: CollectionAgendaItem[];
  upcomingFollowups: CollectionAgendaItem[];
  overduePromises: CollectionAgendaItem[];
  upcomingPromises: CollectionAgendaItem[];
  recentContacts: CollectionAgendaItem[];
  summary: {
    overdueFollowupsCount: number;
    dueTodayCount: number;
    upcomingCount: number;
    overduePromisesCount: number;
    recentContactsCount: number;
  };
};

// ─── Constants ────────────────────────────────────────────────────────────────

const RECENT_CONTACT_DAYS = 7;
const NO_RESPONSE_URGENT_DAYS = 5;

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
  call: "Teléfono",
  meeting: "Reunión",
  internal_note: "Nota",
  payment_promise: "Promesa",
  dispute: "Disputa",
  escalation: "Escalación",
};

const OUTCOME_LABEL: Record<string, string> = {
  contacted: "Contactado",
  promised_payment: "Prometió pagar",
  no_response: "Sin respuesta",
  wrong_contact: "Contacto incorrecto",
  disputed: "En disputa",
  needs_followup: "Requiere seguimiento",
  paused: "En pausa",
  escalated: "Escalado",
  paid: "Pagado",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getUiOutcome(action: CollectionAction): string {
  const meta = action.metadata as Record<string, unknown> | null;
  const uiOutcome = meta?.ui_outcome;
  if (typeof uiOutcome === "string" && uiOutcome) return uiOutcome;
  return action.status;
}

function channelLabel(type: string): string {
  return CHANNEL_LABEL[type] ?? type;
}

function outcomeLabel(outcome: string): string {
  return OUTCOME_LABEL[outcome] ?? outcome;
}

function amountLabel(
  amount: number | null | undefined,
  currency: string | null | undefined
): string | undefined {
  if (amount == null || !currency) return undefined;
  const symbol = currency === "USD" ? "U$S" : "$";
  return `${symbol} ${amount.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

function isValidYmd(ymd: string | null | undefined): ymd is string {
  if (!ymd || ymd.length < 10) return false;
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00`);
  return !isNaN(d.getTime());
}

function daysBetween(isoDate: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(isoDate).getTime()) / 86_400_000);
}

function makeHref(companyId: string): string {
  return `/copilot/clientes/${encodeURIComponent(companyId)}`;
}

function fmtDate(ymd: string | null | undefined): string {
  return formatYmd(ymd) ?? (ymd ? ymd.slice(0, 10) : "—");
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function buildCollectionAgenda(
  input: BuildCollectionAgendaInput
): CollectionAgenda {
  const now = input.now ?? new Date();
  const todayYmd = now.toISOString().slice(0, 10);

  const clientMap = new Map<string, AgendaClientInfo>();
  for (const c of input.clients ?? []) {
    clientMap.set(c.companyId, c);
  }

  // Latest active action per company (sorted desc by createdAt)
  const latestByCompany = new Map<string, CollectionAction>();
  for (const action of input.actions) {
    if (action.isActive === false) continue;
    const existing = latestByCompany.get(action.companyId);
    if (!existing || action.createdAt > existing.createdAt) {
      latestByCompany.set(action.companyId, action);
    }
  }

  const overdueFollowups: CollectionAgendaItem[] = [];
  const dueTodayFollowups: CollectionAgendaItem[] = [];
  const upcomingFollowups: CollectionAgendaItem[] = [];
  const overduePromises: CollectionAgendaItem[] = [];
  const upcomingPromises: CollectionAgendaItem[] = [];
  const recentContacts: CollectionAgendaItem[] = [];

  for (const [companyId, action] of latestByCompany) {
    const client = clientMap.get(companyId);
    const clientName = client?.name ?? companyId;
    const href = makeHref(companyId);
    const uiOutcome = getUiOutcome(action);
    const ch = channelLabel(action.actionType);
    const days = daysBetween(action.createdAt, now);

    const base = {
      companyId,
      clientName,
      href,
      channelLabel: ch,
      outcomeLabel: outcomeLabel(uiOutcome),
      note: action.notes ?? undefined,
    };

    // 1. Promesa vencida — highest priority
    if (
      uiOutcome === "promised_payment" &&
      isValidYmd(action.promiseDate) &&
      action.promiseDate! < todayYmd
    ) {
      overduePromises.push({
        ...base,
        type: "promise_overdue",
        severity: "critical",
        dateLabel: `Prometió pagar ${fmtDate(action.promiseDate)}`,
        amountLabel: amountLabel(action.promiseAmount, action.promiseCurrency),
      });
      continue;
    }

    // 2a. Seguimiento vencido (< today)
    if (isValidYmd(action.nextActionDate) && action.nextActionDate! < todayYmd) {
      overdueFollowups.push({
        ...base,
        type: "followup_overdue",
        severity: "high",
        dateLabel: `Seguimiento ${fmtDate(action.nextActionDate)}`,
      });
      continue;
    }

    // 2b. Seguimiento hoy
    if (isValidYmd(action.nextActionDate) && action.nextActionDate === todayYmd) {
      dueTodayFollowups.push({
        ...base,
        type: "followup_today",
        severity: "high",
        dateLabel: "Seguimiento hoy",
      });
      continue;
    }

    // 2c. Seguimiento próximo (> today)
    if (isValidYmd(action.nextActionDate) && action.nextActionDate! > todayYmd) {
      upcomingFollowups.push({
        ...base,
        type: "followup_upcoming",
        severity: "low",
        dateLabel: `Próx. seguimiento ${fmtDate(action.nextActionDate)}`,
        // Store raw date temporarily for sorting; removed before return
        _rawDate: action.nextActionDate!,
      } as unknown as CollectionAgendaItem);
      continue;
    }

    // 3. Promesa futura
    if (
      uiOutcome === "promised_payment" &&
      isValidYmd(action.promiseDate) &&
      action.promiseDate! >= todayYmd
    ) {
      upcomingPromises.push({
        ...base,
        type: "promise_upcoming",
        severity: "medium",
        dateLabel: `Prometió pagar ${fmtDate(action.promiseDate)}`,
        amountLabel: amountLabel(action.promiseAmount, action.promiseCurrency),
      });
      continue;
    }

    // 4. Contacto incorrecto → overdue high
    if (uiOutcome === "wrong_contact") {
      overdueFollowups.push({
        ...base,
        type: "followup_overdue",
        severity: "high",
        dateLabel: "Actualizar contacto",
        outcomeLabel: "Contacto incorrecto",
      });
      continue;
    }

    // 5. Sin respuesta ≥ 5 días → overdue high
    if (uiOutcome === "no_response" && days >= NO_RESPONSE_URGENT_DAYS) {
      overdueFollowups.push({
        ...base,
        type: "followup_overdue",
        severity: "high",
        dateLabel: `Sin respuesta hace ${days} días`,
        outcomeLabel: "Sin respuesta",
      });
      continue;
    }

    // 6. Contactado reciente
    if (uiOutcome === "contacted" && days <= RECENT_CONTACT_DAYS) {
      recentContacts.push({
        ...base,
        type: "recent_contact",
        severity: "low",
        dateLabel: days === 0 ? "Contactado hoy" : days === 1 ? "Contactado ayer" : `Contactado hace ${days} días`,
      });
      continue;
    }
  }

  // Sort upcomingFollowups ascending by raw date, then strip sort key
  upcomingFollowups.sort((a, b) => {
    const da = (a as unknown as Record<string, string>)._rawDate ?? "";
    const db = (b as unknown as Record<string, string>)._rawDate ?? "";
    return da.localeCompare(db);
  });
  for (const item of upcomingFollowups) {
    delete (item as unknown as Record<string, unknown>)._rawDate;
  }

  return {
    overdueFollowups,
    dueTodayFollowups,
    upcomingFollowups,
    overduePromises,
    upcomingPromises,
    recentContacts,
    summary: {
      overdueFollowupsCount: overdueFollowups.length,
      dueTodayCount: dueTodayFollowups.length,
      upcomingCount: upcomingFollowups.length,
      overduePromisesCount: overduePromises.length,
      recentContactsCount: recentContacts.length,
    },
  };
}
