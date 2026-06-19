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
import { useDisplayCurrency } from "@/components/copilot/display-currency-provider";
import { convertToUsdEquivalent, formatUsdEquivalent } from "@/lib/currency-display-mode";

function priorityBadgeClass(priority: CopilotActionPriority): string {
  switch (priority) {
    case "critical":
      return "bg-[var(--copilot-badge-danger-bg)] text-[var(--copilot-badge-danger-text)]";
    case "high":
      return "bg-[var(--copilot-badge-warning-bg)] text-[var(--copilot-badge-warning-text)]";
    case "medium":
      return "bg-[var(--copilot-badge-neutral-bg)] text-[var(--copilot-ink-muted)]";
    default:
      return "bg-[var(--copilot-badge-neutral-bg)] text-[var(--copilot-ink-muted)]";
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
      return "bg-[var(--copilot-badge-neutral-bg)] text-[var(--copilot-ink-muted)]";
    case "treasury":
      return "bg-[var(--copilot-badge-neutral-bg)] text-[var(--copilot-ink-muted)]";
    case "system":
      return "bg-[var(--copilot-badge-neutral-bg)] text-[var(--copilot-ink-muted)]";
    default:
      return "bg-[var(--copilot-badge-neutral-bg)] text-[var(--copilot-ink-muted)]";
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
  "En seguimiento": "bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)] border-[var(--copilot-success-border)]",
  "Promesa de pago": "bg-[var(--copilot-tone-neutral-bg)] text-[var(--copilot-accent)] border-[var(--copilot-border)]",
  "Reintentar contacto": "bg-[var(--copilot-soft-bg)] text-[var(--copilot-ink-muted)] border-[var(--copilot-border)]",
  "Actualizar contacto": "bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)] border-[var(--copilot-warning-border)]",
  "En disputa": "bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)] border-[var(--copilot-danger-border)]",
  "Seguimiento pendiente": "bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)] border-[var(--copilot-warning-border)]",
  Escalado: "bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)] border-[var(--copilot-danger-border)]",
  Gestionado: "bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)] border-[var(--copilot-success-border)]",
};

function CollectionContextBlock({ ctx }: { ctx: CopilotActionCollectionContext }) {
  const { mode, fxRate } = useDisplayCurrency();
  const badgeCls =
    CONTEXT_BADGE_CLASS[ctx.statusLabel] ?? "bg-[var(--copilot-soft-bg)] text-[var(--copilot-ink-muted)] border-[var(--copilot-border)]";
  const channelLabel = CHANNEL_LABEL[ctx.latestChannel] ?? ctx.latestChannel;

  const today = new Date().toISOString().slice(0, 10);
  const followupTag = (() => {
    if (ctx.nextFollowUpAt) {
      if (ctx.nextFollowUpAt < today) {
        return { label: "Seguimiento atrasado", cls: "bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)] border-[var(--copilot-danger-border)]" };
      }
      if (ctx.nextFollowUpAt === today) {
        return { label: "Seguimiento hoy", cls: "bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)] border-[var(--copilot-warning-border)]" };
      }
      return { label: "Seguimiento programado", cls: "bg-[var(--copilot-tone-neutral-bg)] text-[var(--copilot-accent)] border-[var(--copilot-border)]" };
    }
    if (ctx.latestOutcome === "promised_payment" && ctx.promiseDate) {
      if (ctx.promiseDate < today) {
        return { label: "Promesa atrasada", cls: "bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)] border-[var(--copilot-danger-border)]" };
      }
      return { label: "Promesa vigente", cls: "bg-[var(--copilot-tone-neutral-bg)] text-[var(--copilot-accent)] border-[var(--copilot-border)]" };
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
        <p className="text-[11px] text-[var(--copilot-accent)]">
          Prometió pagar: {formatDateShort(ctx.promiseDate)}
          {ctx.promiseAmount != null && ctx.promiseCurrency
            ? ` · ${
                mode === "usd_equivalent"
                  ? formatUsdEquivalent(convertToUsdEquivalent({ uyu: ctx.promiseCurrency === "UYU" ? ctx.promiseAmount : 0, usd: ctx.promiseCurrency === "USD" ? ctx.promiseAmount : 0 }, fxRate))
                  : `${ctx.promiseCurrency === "USD" ? "U$S" : "$"} ${ctx.promiseAmount.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`
              }`
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
  return `${symbol} ${amount.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function normalizeActionCopy(text: string): string {
  return text
    .replace(/\bvencid[oa]s?\b/gi, (m) =>
      m.toLowerCase().endsWith("s") ? "atrasados" : m.toLowerCase().endsWith("a") ? "atrasada" : "atrasado"
    )
    .replace(/\best[aá]\s+vencid[oa]\b/gi, (m) =>
      m.toLowerCase().includes("vencida") ? "está atrasada" : "está atrasado"
    );
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
  const { mode, fxRate } = useDisplayCurrency();
  const whatsappHref = action.contactPhone
    ? `https://wa.me/${action.contactPhone.replace(/\D/g, "")}`
    : null;
  const mailtoHref = action.contactEmail
    ? `mailto:${action.contactEmail}`
    : null;

  const reason = normalizeActionCopy(action.reason);
  const nextStep = normalizeActionCopy(deriveNextStep(action));

  return (
    <div className={`${actionCardClass} w-full min-w-0 px-3 py-3 sm:px-4 sm:py-3.5`}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-[var(--copilot-ink)]">
          {action.title}
        </p>
        {action.amount != null && action.amount > 0 ? (
          <span className={`shrink-0 text-sm ${metricValueClass}`}>
            {mode === "usd_equivalent"
              ? formatUsdEquivalent(convertToUsdEquivalent({ uyu: action.currency === "UYU" ? action.amount : 0, usd: action.currency === "USD" ? action.amount : 0 }, fxRate))
              : formatAmount(action.amount, action.currency)}
          </span>
        ) : null}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${priorityBadgeClass(action.priority)}`}
        >
          {priorityLabel(action.priority)}
        </span>
        <span className="text-[10px] text-[var(--copilot-ink-muted)]">·</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${typeBadgeClass(action.type)}`}
        >
          {typeLabel(action.type)}
        </span>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-[var(--copilot-ink-muted)]">{reason}</p>
      <p className="mt-1 text-xs font-medium text-[var(--copilot-ink)]">
        Acción: {nextStep}
      </p>

      {action.collectionContext ? (
        <CollectionContextBlock ctx={action.collectionContext} />
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
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
            <MessageCircle className="h-3.5 w-3.5 shrink-0 text-[var(--copilot-success-text)]" aria-hidden />
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
