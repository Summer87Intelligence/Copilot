"use client";

import Link from "next/link";
import { Mail, MessageCircle } from "lucide-react";

import type {
  CopilotAction,
  CopilotActionPriority,
  CopilotActionType,
} from "@/lib/copilot-actions/build-actions";

function priorityBadgeClass(priority: CopilotActionPriority): string {
  switch (priority) {
    case "critical":
      return "bg-rose-100 text-rose-800 ring-1 ring-rose-200";
    case "high":
      return "bg-amber-100 text-amber-800 ring-1 ring-amber-200";
    case "medium":
      return "bg-sky-100 text-sky-800 ring-1 ring-sky-200";
    default:
      return "bg-[var(--copilot-accent-soft)] text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)]";
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
      return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200";
    case "treasury":
      return "bg-violet-50 text-violet-800 ring-1 ring-violet-200";
    case "system":
      return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
    default:
      return "bg-indigo-50 text-indigo-800 ring-1 ring-indigo-200";
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

function formatAmount(amount: number, currency?: string | null): string {
  const symbol = currency === "USD" ? "U$S" : "$";
  return `${symbol} ${amount.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export function ActionCard({ action }: { action: CopilotAction }) {
  const whatsappHref = action.contactPhone
    ? `https://wa.me/${action.contactPhone.replace(/\D/g, "")}`
    : null;
  const mailtoHref = action.contactEmail
    ? `mailto:${action.contactEmail}`
    : null;

  return (
    <div className="rounded-2xl border border-[var(--copilot-border)] bg-white/85 px-4 py-3.5 shadow-sm">
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
          <span className="text-sm font-semibold tabular-nums text-[var(--copilot-ink)]">
            {formatAmount(action.amount, action.currency)}
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-sm font-semibold text-[var(--copilot-ink)]">
        {action.title}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
        {action.reason}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          href={action.href}
          className="inline-flex items-center rounded-lg bg-[var(--copilot-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
        >
          {action.primaryActionLabel}
        </Link>
        {whatsappHref ? (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--copilot-border)] bg-white/70 px-3 py-1.5 text-xs font-medium text-[var(--copilot-ink-muted)] hover:bg-white"
          >
            <MessageCircle className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
            WhatsApp
          </a>
        ) : null}
        {mailtoHref ? (
          <a
            href={mailtoHref}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--copilot-border)] bg-white/70 px-3 py-1.5 text-xs font-medium text-[var(--copilot-ink-muted)] hover:bg-white"
          >
            <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Email
          </a>
        ) : null}
      </div>
    </div>
  );
}
