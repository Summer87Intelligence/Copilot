"use client";

import Link from "next/link";
import { Mail, MessageCircle } from "lucide-react";

import type {
  CopilotAction,
  CopilotActionCollectionContext,
  CopilotActionPriority,
  CopilotActionType,
} from "@/lib/copilot-actions/build-actions";
import {
  formatYmd as _fmtYmd,
  formatRelative as _fmtRelative,
} from "@/lib/collection/collection-date-helpers";
import {
  actionCardClass,
  metricValueClass,
} from "@/components/copilot/ui/copilot-visual-system";

function priorityBadgeClass(priority: CopilotActionPriority): string {
  switch (priority) {
    case "critical":
      return "bg-[var(--copilot-badge-danger-bg)] text-[var(--copilot-badge-danger-text)] ring-1 ring-rose-300/40";
    case "high":
      return "bg-[var(--copilot-badge-warning-bg)] text-[var(--copilot-badge-warning-text)] ring-1 ring-amber-300/40";
    case "medium":
      return "bg-[var(--copilot-soft-bg)] text-[var(--copilot-text)] ring-1 ring-sky-300/30";
    default:
      return "bg-[var(--copilot-accent-soft)] text-[var(--copilot-muted)] ring-1 ring-[var(--copilot-border)]";
  }
}

function priorityLabel(priority: CopilotActionPriority): string {
  switch (priority) {
    case "critical":
      return "Crítico";
    case "high":
      return "Alta";
    case "medium":
      return "Media";
    default:
      return "Baja";
  }
}

function typeBadgeClass(type: CopilotActionType): string {
  switch (type) {
    case "collection":
      return "bg-[var(--copilot-badge-success-bg)] text-[var(--copilot-badge-success-text)] ring-1 ring-emerald-300/40";
    case "treasury":
      return "bg-[var(--copilot-soft-bg)] text-[var(--copilot-text)] ring-1 ring-violet-300/30";
    case "system":
      return "bg-[var(--copilot-badge-neutral-bg)] text-[var(--copilot-muted)] ring-1 ring-[var(--copilot-border)]";
    default:
      return "bg-[var(--copilot-soft-bg)] text-[var(--copilot-text)] ring-1 ring-indigo-300/30";
  }
}

function typeLabel(type: CopilotActionType): string {
  switch (type) {
    case "collection":
      return "Cobranza";
    case "treasury":
      return "Tesorería";
    case "system":
      return "Sistema";
    default:
      return "Cliente";
  }
}

function formatRelativeDate(iso: string): string {
  return _fmtRelative(iso);
}

function formatDateShort(ymd: string | null | undefined): string {
  return _fmtYmd(ymd) ?? (ymd ? ymd.slice(0, 10) : "—");
}

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
  call: "Teléfono",
  internal_note: "Nota",
  meeting: "Reunión",
  payment_promise: "Promesa",
  dispute: "Disputa",
  escalation: "Escalación",
};

const CONTEXT_BADGE_CLASS: Record<string, string> = {
  "En seguimiento": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Promesa de pago": "bg-blue-50 text-blue-700 border-blue-200",
  "Reintentar contacto": "bg-slate-100 text-slate-600 border-slate-200",
  "Actualizar contacto": "bg-orange-50 text-orange-700 border-orange-200",
  "En disputa": "bg-red-50 text-red-700 border-red-200",
  "Seguimiento pendiente": "bg-amber-50 text-amber-700 border-amber-200",
  Escalado: "bg-red-50 text-red-700 border-red-200",
  Gestionado: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

function CollectionContextBlock({ ctx }: { ctx: CopilotActionCollectionContext }) {
  const badgeCls =
    CONTEXT_BADGE_CLASS[ctx.statusLabel] ?? "bg-slate-100 text-slate-500 border-slate-200";
  const channelLabel = CHANNEL_LABEL[ctx.latestChannel] ?? ctx.latestChannel;

  const today = new Date().toISOString().slice(0, 10);
  const followupTag = (() => {
    if (ctx.nextFollowUpAt) {
      if (ctx.nextFollowUpAt < today) {
        return { label: "Seguimiento vencido", cls: "bg-rose-50 text-rose-700 border-rose-200" };
      }
      if (ctx.nextFollowUpAt === today) {
        return { label: "Seguimiento hoy", cls: "bg-amber-50 text-amber-700 border-amber-200" };
      }
      return { label: "Seguimiento programado", cls: "bg-sky-50 text-sky-700 border-sky-200" };
    }
    if (ctx.latestOutcome === "promised_payment" && ctx.promiseDate) {
      if (ctx.promiseDate < today) {
        return { label: "Promesa vencida", cls: "bg-rose-50 text-rose-700 border-rose-200" };
      }
      return { label: "Promesa vigente", cls: "bg-blue-50 text-blue-700 border-blue-200" };
    }
    return null;
  })();

  return (
    <div className="mt-2.5 rounded-xl border border-[var(--copilot-border)]/70 bg-[rgba(44,40,37,0.025)] px-3 py-2 space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badgeCls}`}
        >
          {ctx.statusLabel}
        </span>
        {followupTag ? (
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${followupTag.cls}`}
          >
            {followupTag.label}
          </span>
        ) : null}
        <span className="text-[11px] text-[var(--copilot-ink-muted)]">
          Última gestión: {channelLabel} · {formatRelativeDate(ctx.latestDateIso)}
        </span>
      </div>
      {ctx.promiseDate ? (
        <p className="text-[11px] text-blue-600">
          Prometió pagar: {formatDateShort(ctx.promiseDate)}
          {ctx.promiseAmount != null && ctx.promiseCurrency
            ? ` · ${ctx.promiseCurrency === "USD" ? "U$S" : "$"} ${ctx.promiseAmount.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`
            : ""}
        </p>
      ) : null}
      {ctx.nextFollowUpAt ? (
        <p className="text-[11px] text-[var(--copilot-ink-muted)]">
          Próximo seguimiento: {formatDateShort(ctx.nextFollowUpAt)}
        </p>
      ) : null}
    </div>
  );
}

function formatAmount(amount: number, currency?: string | null): string {
  const symbol = currency === "USD" ? "U$S" : "$";
  return `${symbol} ${amount.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function deriveNextStep(action: CopilotAction): string {
  if (action.type === "treasury") return "Verificar cobertura en Tesorería";
  if (action.type === "system") return "Revisar estado del sistema";
  if (action.type === "collection") {
    const ctx = action.collectionContext;
    if (!ctx) return "Contactar al cliente y registrar gestión";
    if (ctx.latestOutcome === "promised_payment" && ctx.promiseDate) {
      const today = new Date().toISOString().slice(0, 10);
      return ctx.promiseDate <= today
        ? "Confirmar si el pago fue realizado"
        : "Monitorear promesa de pago pendiente";
    }
    if (ctx.nextFollowUpAt) return "Registrar resultado del seguimiento programado";
    const ch = CHANNEL_LABEL[ctx.latestChannel];
    return ch ? `Contactar al cliente vía ${ch}` : "Contactar al cliente y registrar gestión";
  }
  return action.primaryActionLabel;
}

export function ActionCard({ action }: { action: CopilotAction }) {
  const whatsappHref = action.contactPhone
    ? `https://wa.me/${action.contactPhone.replace(/\D/g, "")}`
    : null;
  const mailtoHref = action.contactEmail
    ? `mailto:${action.contactEmail}`
    : null;

  return (
    <div className={`${actionCardClass} px-4 py-3.5`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${priorityBadgeClass(action.priority)}`}
          >
            {priorityLabel(action.priority)}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${typeBadgeClass(action.type)}`}
          >
            {typeLabel(action.type)}
          </span>
        </div>
        {action.amount != null && action.amount > 0 ? (
          <span className={`text-sm ${metricValueClass}`}>
            {formatAmount(action.amount, action.currency)}
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-sm font-semibold text-[var(--copilot-ink)]">
        {action.title}
      </p>
      <div className="mt-1.5 space-y-1.5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">Por qué importa</p>
          <p className="text-xs leading-relaxed text-[var(--copilot-ink-muted)]">{action.reason}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">Siguiente paso</p>
          <p className="text-xs font-medium text-[var(--copilot-ink)]">{deriveNextStep(action)}</p>
        </div>
      </div>

      {action.collectionContext ? (
        <CollectionContextBlock ctx={action.collectionContext} />
      ) : null}

      <div className="mt-3 flex flex-nowrap items-center gap-1.5 overflow-x-auto">
        <Link
          href={action.href}
          className="inline-flex shrink-0 items-center rounded-lg bg-[var(--copilot-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
        >
          {action.primaryActionLabel}
        </Link>
        {whatsappHref ? (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            title={`WhatsApp ${action.contactPhone}`}
            aria-label={`WhatsApp ${action.contactPhone}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-2 py-1.5 text-xs font-medium text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-panel-bg)]"
          >
            <MessageCircle className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
            WA
          </a>
        ) : null}
        {mailtoHref ? (
          <a
            href={mailtoHref}
            title={action.contactEmail ?? "Email"}
            aria-label={`Email ${action.contactEmail}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-2 py-1.5 text-xs font-medium text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-panel-bg)]"
          >
            <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Email
          </a>
        ) : null}
      </div>
    </div>
  );
}
