"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Clock,
  Copy,
  FileText,
  Loader2,
  Mail,
  MessageCircle,
  RefreshCw,
  ShieldAlert,
  TrendingDown,
  User,
  Wallet,
  XCircle,
  Zap,
} from "lucide-react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import {
  CopilotBadge,
  CopilotCard,
  CopilotGhostLink,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { CollectionMessageAssistant } from "@/components/copilot/clientes/collection-message-assistant";
import { CollectionFollowupForm } from "@/components/copilot/clientes/collection-followup-form";
import type { Client360Payload } from "@/lib/copilot-client-360";
import { normalizeUruguayPhoneForWhatsApp } from "@/lib/phone/normalize-phone-for-whatsapp";
import {
  buildClientOperationalSummary,
  type OperationalHintSeverity,
  type TimelineEvent,
} from "@/lib/copilot-client-operational-summary";

type TabId = "resumen" | "cuenta" | "comprobantes" | "recibos" | "contactos" | "zeta";

const TABS: { id: TabId; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "cuenta", label: "Estado de cuenta" },
  { id: "comprobantes", label: "Facturas" },
  { id: "recibos", label: "Cobros" },
  { id: "contactos", label: "Contactos" },
  { id: "zeta", label: "Actualización de datos" },
];

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatMoney(n: number, currency?: string | null): string {
  const sym = currency === "USD" ? "U$S" : "$";
  return `${sym} ${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

function formatDateShort(ymd: string): string {
  if (!ymd || ymd === "—") return ymd;
  try {
    return new Date(ymd + "T12:00:00").toLocaleDateString("es-UY", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return ymd;
  }
}

function formatRelativeDays(ymd: string): string {
  try {
    const d = new Date(ymd + "T12:00:00Z");
    const now = new Date();
    const diff = Math.round((now.getTime() - d.getTime()) / 86_400_000);
    if (diff === 0) return "hoy";
    if (diff === 1) return "ayer";
    if (diff < 30) return `hace ${diff} días`;
    if (diff < 60) return "hace ~1 mes";
    return formatDateShort(ymd);
  } catch {
    return formatDateShort(ymd);
  }
}

function safeJsonPreview(value: unknown, max = 12_000): string {
  try {
    const s = JSON.stringify(value, null, 2);
    if (s.length <= max) return s;
    return `${s.slice(0, max)}\n… (${s.length} caracteres; truncado)`;
  } catch {
    return String(value);
  }
}

// ─── Status translations ──────────────────────────────────────────────────────

function translateInvoiceStatus(estado: string): string {
  const map: Record<string, string> = {
    paid: "Pagada",
    issued: "Emitida",
    pending: "Pendiente",
    overdue: "Vencida",
    cancelled: "Cancelada",
  };
  return map[estado.toLowerCase()] ?? estado;
}

function invoiceBadgeTone(
  estado: string
): "success" | "warning" | "danger" | "neutral" {
  if (estado === "paid") return "success";
  if (estado === "overdue") return "danger";
  if (estado === "pending" || estado === "issued") return "warning";
  return "neutral";
}

function translateReceiptStatus(estado: string): string {
  const map: Record<string, string> = {
    paid: "Cobrado",
    pending: "Pendiente",
  };
  return map[estado.toLowerCase()] ?? estado;
}

// Clean up timeline event titles for display
function cleanTimelineTitle(ev: TimelineEvent): string {
  if (ev.kind === "sync") {
    return ev.title.replace(/^Sync Zeta:\s*/i, "Datos actualizados: ");
  }
  if (ev.kind === "invoice_issued") {
    return ev.title.replace(/^Comprobante emitido:\s*/i, "Factura emitida: ");
  }
  return ev.title;
}

// ─── Risk styling ─────────────────────────────────────────────────────────────

function riskTone(r: string) {
  if (r.includes("Alto"))
    return { bg: "bg-rose-100/80", text: "text-rose-800", border: "border-rose-200" };
  if (r.includes("Medio"))
    return { bg: "bg-amber-100/80", text: "text-amber-900", border: "border-amber-200" };
  return { bg: "bg-emerald-100/70", text: "text-emerald-900", border: "border-emerald-200" };
}

function hintSeverityStyle(s: OperationalHintSeverity) {
  const map: Record<OperationalHintSeverity, { icon: typeof AlertTriangle; color: string; bg: string }> = {
    ok: { icon: CheckCircle2, color: "text-emerald-700", bg: "bg-emerald-50/60" },
    info: { icon: Zap, color: "text-sky-700", bg: "bg-sky-50/60" },
    warning: { icon: AlertTriangle, color: "text-amber-700", bg: "bg-amber-50/70" },
    critical: { icon: ShieldAlert, color: "text-rose-700", bg: "bg-rose-50/70" },
  };
  return map[s];
}

function timelineIcon(kind: TimelineEvent["kind"], severity: OperationalHintSeverity) {
  if (kind === "receipt") return <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />;
  if (kind === "invoice_overdue") return <XCircle className="h-4 w-4 text-rose-600" aria-hidden />;
  if (kind === "invoice_issued") return <FileText className="h-4 w-4 text-sky-600" aria-hidden />;
  if (kind === "sync") return severity === "warning"
    ? <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden />
    : <BadgeCheck className="h-4 w-4 text-slate-400" aria-hidden />;
  return <CircleDashed className="h-4 w-4 text-slate-400" aria-hidden />;
}

// ─── Debt status label ────────────────────────────────────────────────────────

function debtStatusLabel(data: Client360Payload): { label: string; cls: string } {
  const hasOverdue = data.overdue_uyu > 0 || data.overdue_usd > 0;
  const hasDebt = data.debt_uyu > 0 || data.debt_usd > 0;
  if (hasOverdue) {
    return {
      label: "Con deuda vencida",
      cls: "border-rose-200/80 bg-rose-50/80 text-rose-800",
    };
  }
  if (hasDebt) {
    return {
      label: "Con deuda al día",
      cls: "border-amber-200/80 bg-amber-50/80 text-amber-800",
    };
  }
  return {
    label: "Sin deuda",
    cls: "border-emerald-200/80 bg-emerald-50/80 text-emerald-800",
  };
}

// ─── KPI chip ─────────────────────────────────────────────────────────────────

function KpiChip({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "warning" | "danger" | "ok";
}) {
  const tones = {
    neutral: "text-[var(--copilot-ink)]",
    warning: "text-amber-700",
    danger: "text-rose-700",
    ok: "text-emerald-700",
  };
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card)] px-4 py-3 shadow-sm">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        {label}
      </span>
      <span className={`text-lg font-bold tabular-nums leading-tight ${tones[tone]}`}>
        {value}
      </span>
      {sub ? (
        <span className="text-[11px] text-[var(--copilot-ink-muted)]">{sub}</span>
      ) : null}
    </div>
  );
}

// ─── Quick Actions ────────────────────────────────────────────────────────────

function QuickActions({ contactEmail }: { contactEmail?: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {contactEmail ? (
        <a
          href={`mailto:${contactEmail}`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--copilot-border)] bg-white/70 px-3 py-1.5 text-xs font-medium text-[var(--copilot-ink-muted)] hover:bg-white"
        >
          <Mail className="h-3.5 w-3.5" aria-hidden />
          Contactar
        </a>
      ) : null}
      <CopilotGhostLink
        href="/copilot/cartera"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
      >
        <Wallet className="h-3.5 w-3.5" aria-hidden />
        Ver cartera
      </CopilotGhostLink>
      <CopilotGhostLink
        href="/copilot/alertas"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
      >
        <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
        Ver alertas
      </CopilotGhostLink>
    </div>
  );
}

// ─── Copilot hint block ───────────────────────────────────────────────────────

function CopilotHintBlock({ data }: { data: Client360Payload }) {
  const summary = useMemo(() => {
    const riskHint = data.insights.find((i) => i.id === "riesgo_basico");
    const risk: "Bajo" | "Medio" | "Alto" = riskHint?.label.includes("Alto")
      ? "Alto"
      : riskHint?.label.includes("Medio")
        ? "Medio"
        : "Bajo";
    return buildClientOperationalSummary({
      saldo_pendiente: data.cuenta.saldo_pendiente_total,
      overdue_debt: data.overdue_uyu + data.overdue_usd,
      overdue_uyu: data.overdue_uyu,
      overdue_usd: data.overdue_usd,
      debt_uyu: data.debt_uyu,
      debt_usd: data.debt_usd,
      receipts_count: data.receipts.length,
      receipts_last_date: data.last_receipt_date,
      contacts_count: data.contacts.length,
      risk,
      has_mixed_currency: data.debt_uyu > 0 && data.debt_usd > 0,
      invoices_count: data.invoices.length,
      last_sync_at: data.last_sync_at,
    });
  }, [data]);

  const whyItMatters = useMemo(() => {
    if (data.overdue_uyu > 0 && data.debt_uyu > 0) {
      const pct = Math.round((data.overdue_uyu / data.debt_uyu) * 100);
      return `Tiene $ ${data.overdue_uyu.toLocaleString("es-AR", { maximumFractionDigits: 0 })} vencido sobre $ ${data.debt_uyu.toLocaleString("es-AR", { maximumFractionDigits: 0 })} pendientes en pesos (${pct}% vencido).`;
    }
    if (data.overdue_usd > 0 && data.debt_usd > 0) {
      const pct = Math.round((data.overdue_usd / data.debt_usd) * 100);
      return `Tiene U$S ${data.overdue_usd.toLocaleString("es-AR", { maximumFractionDigits: 0 })} vencido sobre U$S ${data.debt_usd.toLocaleString("es-AR", { maximumFractionDigits: 0 })} pendientes en dólares (${pct}% vencido).`;
    }
    if (data.debt_uyu > 0 || data.debt_usd > 0) {
      const parts: string[] = [];
      if (data.debt_uyu > 0)
        parts.push(
          `$ ${data.debt_uyu.toLocaleString("es-AR", { maximumFractionDigits: 0 })} en pesos`
        );
      if (data.debt_usd > 0)
        parts.push(
          `U$S ${data.debt_usd.toLocaleString("es-AR", { maximumFractionDigits: 0 })} en dólares`
        );
      return `Tiene ${parts.join(" y ")} pendiente${parts.length > 1 ? "s" : ""} sin vencer.`;
    }
    return "No tiene saldo pendiente actualmente.";
  }, [data]);

  const queHacer =
    summary.suggestedActions[0] ??
    summary.riskHints.find((h) => h.action)?.action ??
    "Revisar el estado de cuenta del cliente.";

  const extraHints = [...summary.riskHints, ...summary.missingDataHints].filter(
    (h) => h.id !== "no_debt" && h.id !== "overdue_debt" && h.id !== "active_debt"
  );

  return (
    <div className="rounded-2xl border border-[var(--copilot-border)] bg-white/60 p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Zap className="h-4 w-4 text-[var(--copilot-accent)]" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink)]">
          Lectura de Copilot
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]/70">
            Que pasa
          </p>
          <p className="text-sm leading-relaxed text-[var(--copilot-ink)]">
            {summary.executiveSummary}
          </p>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]/70">
            Por que importa
          </p>
          <p className="text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
            {whyItMatters}
          </p>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]/70">
            Que hacer
          </p>
          <p className="text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
            {queHacer}
          </p>
        </div>
      </div>

      {extraHints.length > 0 ? (
        <ul className="mt-4 space-y-1.5 border-t border-[var(--copilot-border)]/60 pt-4">
          {extraHints.slice(0, 4).map((hint) => {
            const style = hintSeverityStyle(hint.severity);
            const Icon = style.icon;
            return (
              <li
                key={hint.id}
                className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${style.bg}`}
              >
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.color}`} aria-hidden />
                <span className={`font-medium ${style.color}`}>{hint.text}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

function TimelineBlock({ events }: { events: TimelineEvent[] }) {
  const commercialEvents = events.filter((e) => e.kind !== "sync");
  const syncEvents = events.filter((e) => e.kind === "sync");

  if (events.length === 0) {
    return (
      <p className="text-sm text-[var(--copilot-ink-muted)]">
        No hay actividad reciente registrada.
      </p>
    );
  }

  function EventList({ evts }: { evts: TimelineEvent[] }) {
    if (evts.length === 0) return null;
    return (
      <ol className="relative space-y-0 border-l border-[var(--copilot-border)]">
        {evts.map((ev) => (
          <li key={ev.id} className="relative pb-5 pl-6 last:pb-0">
            <span className="absolute -left-2 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--copilot-card)] ring-2 ring-[var(--copilot-border)]">
              {timelineIcon(ev.kind, ev.severity)}
            </span>
            <div className="flex flex-wrap items-start justify-between gap-1">
              <div>
                <p className="text-sm font-medium text-[var(--copilot-ink)]">
                  {cleanTimelineTitle(ev)}
                </p>
                {ev.description ? (
                  <p className="text-xs text-[var(--copilot-ink-muted)]">{ev.description}</p>
                ) : null}
              </div>
              <div className="text-right">
                {ev.amount != null ? (
                  <p className="text-sm tabular-nums font-semibold text-[var(--copilot-ink)]">
                    {formatMoney(ev.amount, ev.currency)}
                  </p>
                ) : null}
                <p className="text-xs text-[var(--copilot-ink-muted)]">
                  {formatDateShort(ev.date)}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className="space-y-5">
      {commercialEvents.length > 0 ? (
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]/70">
            Actividad comercial
          </p>
          <EventList evts={commercialEvents} />
        </div>
      ) : null}
      {syncEvents.length > 0 ? (
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]/70">
            Actualizacion de datos
          </p>
          <EventList evts={syncEvents} />
        </div>
      ) : null}
    </div>
  );
}

// ─── Contacts tab ─────────────────────────────────────────────────────────────

function ContactsTab({
  contacts,
  companyPhone,
}: {
  contacts: Client360Payload["contacts"];
  companyPhone: string | null;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const waPhone = normalizeUruguayPhoneForWhatsApp(companyPhone);

  function copyEmail(email: string) {
    navigator.clipboard?.writeText(email).catch(() => null);
    setCopied(email);
    setTimeout(() => setCopied(null), 2000);
  }

  if (contacts.length === 0) {
    return (
      <CopilotCard>
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <User className="h-10 w-10 text-[var(--copilot-ink-muted)]/40" aria-hidden />
          <p className="text-sm font-medium text-[var(--copilot-ink-muted)]">
            No hay contactos registrados para este cliente.
          </p>
          <p className="max-w-sm text-xs text-[var(--copilot-ink-muted)]">
            Los contactos se actualizan automaticamente. Apareceran aqui tras la
            proxima sincronizacion si el cliente tiene contactos.
          </p>
        </div>
      </CopilotCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* Company phone */}
      {companyPhone ? (
        <CopilotCard className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--copilot-accent-soft)]">
            <MessageCircle className="h-4 w-4 text-[var(--copilot-accent)]" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]/70">
              Teléfono de la empresa
            </p>
            <p className="truncate text-sm font-medium text-[var(--copilot-ink)]">
              {waPhone?.isValid ? waPhone.display : companyPhone}
            </p>
          </div>
          {waPhone?.isValid ? (
            <a
              href={waPhone.waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--copilot-border)] px-2.5 py-1 text-[11px] font-medium text-[var(--copilot-ink-muted)] hover:bg-slate-50"
            >
              <MessageCircle className="h-3 w-3" aria-hidden />
              WhatsApp
            </a>
          ) : (
            <span className="shrink-0 text-[11px] text-[var(--copilot-ink-muted)]/50">
              No apto WhatsApp
            </span>
          )}
        </CopilotCard>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {contacts.map((c) => (
        <CopilotCard key={c.id} className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--copilot-accent-soft)] text-sm font-semibold text-[var(--copilot-accent)]">
              {c.full_name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--copilot-ink)]">
                {c.full_name}
              </p>
              {c.job_title ? (
                <p className="truncate text-xs text-[var(--copilot-ink-muted)]">
                  {c.job_title}
                </p>
              ) : null}
            </div>
          </div>

          {c.email ? (
            <div className="space-y-1.5">
              <a
                href={`mailto:${c.email}`}
                className="flex items-center gap-1.5 truncate text-xs text-[var(--copilot-accent)] hover:underline"
              >
                <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {c.email}
              </a>
              <div className="flex flex-wrap gap-1.5">
                <a
                  href={`mailto:${c.email}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--copilot-border)] px-2.5 py-1 text-[11px] font-medium text-[var(--copilot-ink-muted)] hover:bg-slate-50"
                >
                  <Mail className="h-3 w-3" aria-hidden />
                  Enviar email
                </a>
                <button
                  type="button"
                  onClick={() => copyEmail(c.email!)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--copilot-border)] px-2.5 py-1 text-[11px] font-medium text-[var(--copilot-ink-muted)] hover:bg-slate-50"
                >
                  <Copy className="h-3 w-3" aria-hidden />
                  {copied === c.email ? "Copiado" : "Copiar email"}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-[var(--copilot-ink-muted)]/60">Sin email cargado</p>
          )}

        </CopilotCard>
      ))}
      </div>
    </div>
  );
}

// ─── Zeta sync status card ────────────────────────────────────────────────────

function ZetaSyncStatusCard({
  rows,
}: {
  rows: Client360Payload["zeta_sync_rows"];
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--copilot-ink-muted)]">
        Sin informacion de actualizaciones disponible.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((z) => {
        const lastOk = z.last_success_at
          ? formatRelativeDays(z.last_success_at.slice(0, 10))
          : null;
        const isOk = z.bootstrap_completed && z.last_success_at != null;
        return (
          <div
            key={z.resource_flow}
            className="flex items-center justify-between gap-3 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card)] px-4 py-3"
          >
            <div className="flex items-center gap-2">
              {isOk ? (
                <BadgeCheck className="h-4 w-4 text-emerald-500 shrink-0" aria-hidden />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" aria-hidden />
              )}
              <p className="text-sm font-medium text-[var(--copilot-ink)]">
                {z.label}
              </p>
            </div>
            <p className="text-xs text-[var(--copilot-ink-muted)] tabular-nums shrink-0">
              {lastOk ? `Actualizado ${lastOk}` : "Sin actualizar"}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function CopilotClient360View({ companyId }: { companyId: string }) {
  const [tab, setTab] = useState<TabId>("resumen");
  const [data, setData] = useState<Client360Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/copilot/client-360?companyId=${encodeURIComponent(companyId)}`,
        { credentials: "same-origin", headers: { Accept: "application/json" } }
      );
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; payload?: Client360Payload; error?: string }
        | null;
      if (!res.ok || !body?.ok || !body.payload) {
        const msg =
          typeof body?.error === "string" && body.error.trim()
            ? body.error
            : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      setData(body.payload);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "No se pudo cargar la ficha.");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const riskLabel = useMemo((): "Bajo" | "Medio" | "Alto" => {
    const hint = data?.insights.find((i) => i.id === "riesgo_basico");
    if (!hint) return "Bajo";
    if (hint.label.includes("Alto")) return "Alto";
    if (hint.label.includes("Medio")) return "Medio";
    return "Bajo";
  }, [data]);

  const hasMixedCurrency = (data?.debt_uyu ?? 0) > 0 && (data?.debt_usd ?? 0) > 0;

  const timelineEvents = useMemo(() => {
    if (!data) return [];
    const { timelineEvents: evts } = buildClientOperationalSummary({
      saldo_pendiente: data.cuenta.saldo_pendiente_total,
      overdue_debt: data.overdue_uyu + data.overdue_usd,
      overdue_uyu: data.overdue_uyu,
      overdue_usd: data.overdue_usd,
      receipts_count: data.receipts.length,
      receipts_last_date: data.last_receipt_date,
      contacts_count: data.contacts.length,
      risk: riskLabel,
      has_mixed_currency: hasMixedCurrency,
      invoices_count: data.invoices.length,
      last_sync_at: data.last_sync_at,
      invoices: data.invoices.map((inv) => ({
        id: inv.id,
        issue_date: inv.issue_date,
        serie_numero: inv.serie_numero,
        importe: inv.importe,
        balance: Number(inv.saldo.replace(/\./g, "").replace(",", ".")) || 0,
      })),
      receipts: data.receipts.map((r) => ({
        id: r.id,
        receipt_date: r.receipt_date,
        importe: r.importe,
        medio: r.medio,
      })),
      sync_rows: data.zeta_sync_rows.map((z) => ({
        resource_flow: z.resource_flow,
        label: z.label,
        last_success_at: z.last_success_at,
      })),
    });
    return evts;
  }, [data, riskLabel, hasMixedCurrency]);

  const debtStatus = data ? debtStatusLabel(data) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        surfaceId="copilot.clientes"
        title="Ficha de cliente"
        description="Estado de cuenta, facturas, cobros y contactos del cliente."
      />

      {/* Breadcrumb */}
      <div className="border-b border-[var(--copilot-border)] bg-[var(--copilot-card)] px-6 py-3">
        <nav className="flex items-center gap-2 text-sm" aria-label="Ruta">
          <CopilotGhostLink
            href="/copilot/clientes"
            className="inline-flex items-center gap-1 text-sm font-medium"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Clientes
          </CopilotGhostLink>
          <ChevronRight className="h-3.5 w-3.5 text-[var(--copilot-ink-muted)]" aria-hidden />
          <span className="font-medium text-[var(--copilot-ink)]">
            {loading ? "Cargando…" : (data?.summary.nombre_visible ?? "Ficha")}
          </span>
        </nav>
      </div>

      {/* Header */}
      {!loading && !error && data ? (
        <div className="border-b border-[var(--copilot-border)] bg-[var(--copilot-card)] px-6 py-5">
          {/* Identity row */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--copilot-accent-soft)] text-lg font-bold text-[var(--copilot-accent)]">
                {data.summary.nombre_visible.charAt(0).toUpperCase()}
              </span>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-[var(--copilot-ink)]">
                  {data.summary.nombre_visible}
                </h1>
                {data.summary.razon_social &&
                  data.summary.razon_social !== data.summary.nombre_visible ? (
                  <p className="text-sm text-[var(--copilot-ink-muted)]">
                    {data.summary.razon_social}
                  </p>
                ) : null}
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[var(--copilot-ink-muted)]">
                  {data.summary.rut_documento ? (
                    <span>RUT {data.summary.rut_documento}</span>
                  ) : null}
                  {data.summary.codigo ? (
                    <span>Codigo {data.summary.codigo}</span>
                  ) : null}
                  {data.summary.industry ? (
                    <span className="flex items-center gap-0.5">
                      <Building2 className="h-3 w-3" aria-hidden />
                      {data.summary.industry}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            <QuickActions contactEmail={data.contacts[0]?.email} />
          </div>

          {/* Status badges */}
          <div className="mt-4 flex flex-wrap gap-2">
            {debtStatus ? (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${debtStatus.cls}`}
              >
                {debtStatus.label}
              </span>
            ) : null}

            {(() => {
              const tone = riskTone(riskLabel);
              return (
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${tone.bg} ${tone.text} ${tone.border}`}
                >
                  Riesgo {riskLabel}
                </span>
              );
            })()}

            {data.insights.map((i) =>
              i.active && i.id === "sin_recibos_recientes" ? (
                <span
                  key={i.id}
                  className="inline-flex items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-900"
                >
                  Sin cobros recientes
                </span>
              ) : i.active && i.id === "actividad_reciente" ? (
                <span
                  key={i.id}
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-800"
                >
                  Con actividad reciente
                </span>
              ) : null
            )}

            {hasMixedCurrency ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-200/80 bg-sky-50/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                Multi-moneda
              </span>
            ) : null}

            {data.last_sync_at ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                <Clock className="h-3 w-3" aria-hidden />
                Datos {formatRelativeDays(data.last_sync_at.slice(0, 10))}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-slate-50/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                Sin datos recientes
              </span>
            )}
          </div>

          {/* KPI row — responsive grid */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            <KpiChip
              label="Deuda UYU"
              value={`$ ${data.debt_uyu.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
              sub={
                data.debt_uyu > 0 && data.overdue_uyu > 0
                  ? `${Math.round((data.overdue_uyu / data.debt_uyu) * 100)}% vencido`
                  : undefined
              }
              tone={data.debt_uyu > 0 ? "warning" : "neutral"}
            />
            <KpiChip
              label="Deuda USD"
              value={`U$S ${data.debt_usd.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
              sub={
                data.debt_usd > 0 && data.overdue_usd > 0
                  ? `${Math.round((data.overdue_usd / data.debt_usd) * 100)}% vencido`
                  : undefined
              }
              tone={data.debt_usd > 0 ? "warning" : "neutral"}
            />
            <KpiChip
              label="Vencido UYU"
              value={`$ ${data.overdue_uyu.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
              tone={data.overdue_uyu > 0 ? "danger" : "neutral"}
            />
            <KpiChip
              label="Vencido USD"
              value={`U$S ${data.overdue_usd.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
              tone={data.overdue_usd > 0 ? "danger" : "neutral"}
            />
            <KpiChip
              label="Facturas"
              value={String(data.cuenta.comprobantes_count)}
              sub="activas"
            />
            <KpiChip
              label="Cobros"
              value={String(data.cuenta.recibos_count)}
              sub="registrados"
            />
            <KpiChip
              label="Ultimo cobro"
              value={
                data.last_receipt_date
                  ? formatRelativeDays(data.last_receipt_date)
                  : "—"
              }
              tone={data.last_receipt_date ? "ok" : "warning"}
            />
            <KpiChip
              label="Datos actualizados"
              value={
                data.last_sync_at
                  ? formatRelativeDays(data.last_sync_at.slice(0, 10))
                  : "—"
              }
              tone={data.last_sync_at ? "ok" : "warning"}
            />
          </div>
        </div>
      ) : null}

      {/* Copilot block */}
      {!loading && !error && data ? (
        <div className="border-b border-[var(--copilot-border)] bg-[rgba(255,255,255,0.4)] px-6 py-4">
          <CopilotHintBlock data={data} />
        </div>
      ) : null}

      {/* Collection message assistant — solo cuando hay deuda */}
      {!loading && !error && data &&
        (data.debt_uyu > 0 || data.debt_usd > 0 || data.overdue_uyu > 0 || data.overdue_usd > 0) ? (
        <div className="border-b border-[var(--copilot-border)] bg-[rgba(255,255,255,0.4)] px-6 py-4">
          <CollectionMessageAssistant
            clientName={data.summary.nombre_visible}
            debtUyu={data.debt_uyu}
            debtUsd={data.debt_usd}
            overdueUyu={data.overdue_uyu}
            overdueUsd={data.overdue_usd}
            contactEmail={data.contacts.find((c) => c.email != null)?.email ?? null}
            phone={data.summary.phone}
          />
        </div>
      ) : null}

      {/* Gestión de cobranza */}
      {!loading && !error && data ? (
        <div className="border-b border-[var(--copilot-border)] bg-[rgba(255,255,255,0.4)] px-6 py-4">
          <CollectionFollowupForm companyId={data.summary.company_id} />
        </div>
      ) : null}

      {/* Tabs — horizontal scroll on mobile */}
      <div className="border-b border-[var(--copilot-border)] bg-[rgba(255,255,255,0.55)]">
        <nav
          className="flex overflow-x-auto px-6 py-2 gap-1 scrollbar-none"
          aria-label="Secciones ficha cliente"
        >
          {TABS.map((t) => {
            const count =
              t.id === "comprobantes"
                ? data?.invoices.length
                : t.id === "recibos"
                  ? data?.receipts.length
                  : t.id === "contactos"
                    ? data?.contacts.length
                    : null;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  tab === t.id
                    ? "bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)]"
                    : "text-[var(--copilot-ink-muted)] hover:bg-[rgba(44,40,37,0.06)]"
                }`}
              >
                {t.label}
                {count != null && count > 0 ? (
                  <span className="rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--copilot-ink)]">
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      <div className="flex-1 space-y-6 overflow-auto px-6 py-6">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--copilot-ink-muted)]">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            Cargando ficha…
          </div>
        ) : null}

        {error ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-950">
              {error}
            </div>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--copilot-accent)] hover:underline"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Reintentar
            </button>
          </div>
        ) : null}

        {!loading && !error && data ? (
          <>
            {/* ── RESUMEN ──────────────────────────────────────────────────── */}
            {tab === "resumen" ? (
              <div className="space-y-6">
                <CopilotCard>
                  <CopilotSectionTitle
                    title="Datos del cliente"
                    subtitle="Informacion comercial registrada para este cliente."
                  />
                  <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        Razon social
                      </dt>
                      <dd className="mt-1 text-sm text-[var(--copilot-ink)]">
                        {data.summary.razon_social || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        Nombre
                      </dt>
                      <dd className="mt-1 text-sm text-[var(--copilot-ink)]">
                        {data.summary.nombre_visible}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        Codigo en el sistema
                      </dt>
                      <dd className="mt-1 text-sm text-[var(--copilot-ink)]">
                        {data.summary.codigo ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        RUT
                      </dt>
                      <dd className="mt-1 text-sm text-[var(--copilot-ink)]">
                        {data.summary.rut_documento ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        Industria
                      </dt>
                      <dd className="mt-1 text-sm text-[var(--copilot-ink)]">
                        {data.summary.industry ?? "—"}
                      </dd>
                    </div>
                    {data.summary.commercial ? (
                      <>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                            Condicion de pago
                          </dt>
                          <dd className="mt-1 text-sm text-[var(--copilot-ink)]">
                            {data.summary.commercial.condicion_comercial ?? "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                            Categoria
                          </dt>
                          <dd className="mt-1 text-sm text-[var(--copilot-ink)]">
                            {data.summary.commercial.categoria ?? "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                            Moneda
                          </dt>
                          <dd className="mt-1 text-sm text-[var(--copilot-ink)]">
                            {data.summary.commercial.moneda_codigo ?? "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                            Estado comercial
                          </dt>
                          <dd className="mt-1 text-sm text-[var(--copilot-ink)]">
                            {data.summary.commercial.estado_comercial_activo === null
                              ? "—"
                              : data.summary.commercial.estado_comercial_activo
                                ? "Activo"
                                : "Inactivo"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                            Limite de credito
                          </dt>
                          <dd className="mt-1 text-sm text-[var(--copilot-ink)]">
                            {[
                              data.summary.commercial.limite_credito_monto,
                              data.summary.commercial.limite_credito_dias,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </dd>
                        </div>
                      </>
                    ) : (
                      <div className="sm:col-span-2 lg:col-span-3">
                        <p className="text-sm text-[var(--copilot-ink-muted)]">
                          Sin datos comerciales disponibles aun. Categoria, condicion de
                          pago y limite de credito aparecen tras la proxima actualizacion.
                        </p>
                      </div>
                    )}
                  </dl>
                </CopilotCard>

                <CopilotCard>
                  <CopilotSectionTitle
                    title="Actividad reciente"
                    subtitle="Facturas emitidas, cobros registrados y estado de actualizacion de datos."
                  />
                  <TimelineBlock events={timelineEvents} />
                </CopilotCard>
              </div>
            ) : null}

            {/* ── ESTADO DE CUENTA ─────────────────────────────────────────── */}
            {tab === "cuenta" ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-[var(--copilot-ink)]">
                    Deuda actual del cliente
                  </p>
                  <p className="mt-0.5 text-sm text-[var(--copilot-ink-muted)]">
                    Calculada con el saldo pendiente informado en las facturas. UYU y USD no se suman entre si.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <CopilotCard>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        Deuda en pesos (UYU)
                      </p>
                      {data.overdue_uyu > 0 ? (
                        <TrendingDown className="h-4 w-4 text-rose-500 shrink-0" aria-hidden />
                      ) : null}
                    </div>
                    <p className={`mt-2 text-2xl font-bold tabular-nums ${data.debt_uyu > 0 ? "text-amber-700" : "text-[var(--copilot-ink)]"}`}>
                      {`$ ${data.debt_uyu.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
                    </p>
                    {data.overdue_uyu > 0 ? (
                      <div className="mt-2 space-y-0.5">
                        <p className="text-xs font-medium text-rose-600">
                          {`$ ${data.overdue_uyu.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`} vencido
                          {data.debt_uyu > 0
                            ? ` (${Math.round((data.overdue_uyu / data.debt_uyu) * 100)}% del total)`
                            : ""}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">Sin deuda vencida</p>
                    )}
                    {data.last_receipt_date ? (
                      <p className="mt-3 text-xs text-[var(--copilot-ink-muted)]">
                        Ultimo cobro: {formatDateShort(data.last_receipt_date)}
                      </p>
                    ) : null}
                  </CopilotCard>

                  <CopilotCard>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        Deuda en dolares (USD)
                      </p>
                      {data.overdue_usd > 0 ? (
                        <TrendingDown className="h-4 w-4 text-rose-500 shrink-0" aria-hidden />
                      ) : null}
                    </div>
                    <p className={`mt-2 text-2xl font-bold tabular-nums ${data.debt_usd > 0 ? "text-amber-700" : "text-[var(--copilot-ink)]"}`}>
                      {`U$S ${data.debt_usd.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
                    </p>
                    {data.overdue_usd > 0 ? (
                      <p className="mt-1 text-xs font-medium text-rose-600">
                        {`U$S ${data.overdue_usd.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`} vencido
                        {data.debt_usd > 0
                          ? ` (${Math.round((data.overdue_usd / data.debt_usd) * 100)}% del total)`
                          : ""}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">Sin deuda vencida</p>
                    )}
                    {data.last_invoice_date ? (
                      <p className="mt-3 text-xs text-[var(--copilot-ink-muted)]">
                        Ultima factura: {formatDateShort(data.last_invoice_date)}
                      </p>
                    ) : null}
                  </CopilotCard>
                </div>

                <CopilotCard>
                  <CopilotSectionTitle
                    title="Estado de cuenta historico"
                    subtitle="Facturas y cobros sincronizados. Puede diferir de la deuda actual si hay notas de credito, imputaciones o ajustes pendientes de sincronizar."
                  />
                  {data.cuenta.ultimos_movimientos.length === 0 ? (
                    <p className="text-sm text-[var(--copilot-ink-muted)]">
                      Sin movimientos registrados.
                    </p>
                  ) : (
                    <ul className="divide-y divide-[var(--copilot-border)]">
                      {data.cuenta.ultimos_movimientos.map((m, idx) => (
                        <li
                          key={`${m.kind}-${m.fecha}-${idx}`}
                          className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            {m.kind === "factura" ? (
                              <FileText className="h-3.5 w-3.5 shrink-0 text-sky-500" aria-hidden />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
                            )}
                            <div>
                              <span className="font-medium text-[var(--copilot-ink)]">
                                {m.kind === "factura" ? "Factura" : "Cobro"}
                              </span>
                              <span className="text-[var(--copilot-ink-muted)]"> · {m.label}</span>
                            </div>
                          </div>
                          <div className="tabular-nums text-[var(--copilot-ink)]">
                            {`$ ${m.importe.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`} ·{" "}
                            {formatDateShort(m.fecha)}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CopilotCard>
              </div>
            ) : null}

            {/* ── FACTURAS ─────────────────────────────────────────────────── */}
            {tab === "comprobantes" ? (
              <CopilotCard className="overflow-hidden p-0">
                <div className="border-b border-[var(--copilot-border)] px-5 py-4">
                  <CopilotSectionTitle
                    title="Facturas"
                    subtitle="Comprobantes emitidos a este cliente y su estado actual."
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="bg-[rgba(255,255,255,0.65)] text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        <th className="px-5 py-3">Fecha</th>
                        <th className="px-5 py-3">Numero</th>
                        <th className="px-5 py-3">Tipo</th>
                        <th className="px-5 py-3">Importe</th>
                        <th className="px-5 py-3">Saldo</th>
                        <th className="px-5 py-3">Estado</th>
                        <th className="px-5 py-3">Referencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.invoices.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-5 py-8 text-[var(--copilot-ink-muted)]">
                            No hay facturas para este cliente.
                          </td>
                        </tr>
                      ) : (
                        data.invoices.map((inv, i) => (
                          <tr
                            key={inv.id}
                            className={i % 2 === 0 ? "bg-[var(--copilot-card)]" : "bg-[rgba(255,255,255,0.5)]"}
                          >
                            <td className="px-5 py-3">{formatDateShort(inv.issue_date)}</td>
                            <td className="px-5 py-3 font-medium">{inv.serie_numero}</td>
                            <td className="px-5 py-3 text-[var(--copilot-ink-muted)]">{inv.tipo}</td>
                            <td className="px-5 py-3 tabular-nums">
                              {`$ ${inv.importe.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
                            </td>
                            <td className="px-5 py-3 tabular-nums text-[var(--copilot-ink-muted)]">
                              {inv.saldo}
                            </td>
                            <td className="px-5 py-3">
                              <CopilotBadge tone={invoiceBadgeTone(inv.estado)}>
                                {translateInvoiceStatus(inv.estado)}
                              </CopilotBadge>
                            </td>
                            <td className="max-w-[220px] px-5 py-3 text-xs text-[var(--copilot-ink-muted)]">
                              <span className="line-clamp-2">{inv.referencia ?? "—"}</span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CopilotCard>
            ) : null}

            {/* ── COBROS ───────────────────────────────────────────────────── */}
            {tab === "recibos" ? (
              <CopilotCard className="overflow-hidden p-0">
                <div className="border-b border-[var(--copilot-border)] px-5 py-4">
                  <CopilotSectionTitle
                    title="Cobros"
                    subtitle="Pagos registrados de este cliente."
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="bg-[rgba(255,255,255,0.65)] text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        <th className="px-5 py-3">Fecha</th>
                        <th className="px-5 py-3">Importe</th>
                        <th className="px-5 py-3">Medio de pago</th>
                        <th className="px-5 py-3">Referencia</th>
                        <th className="px-5 py-3">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.receipts.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-5 py-8 text-[var(--copilot-ink-muted)]">
                            No hay cobros registrados para este cliente.
                          </td>
                        </tr>
                      ) : (
                        data.receipts.map((r, i) => (
                          <tr
                            key={r.id}
                            className={i % 2 === 0 ? "bg-[var(--copilot-card)]" : "bg-[rgba(255,255,255,0.5)]"}
                          >
                            <td className="px-5 py-3">{formatDateShort(r.receipt_date)}</td>
                            <td className="px-5 py-3 tabular-nums font-medium">
                              {`$ ${r.importe.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
                            </td>
                            <td className="px-5 py-3 text-[var(--copilot-ink-muted)]">
                              {r.medio ?? "—"}
                            </td>
                            <td className="px-5 py-3 text-[var(--copilot-ink-muted)]">
                              {r.referencia ?? "—"}
                            </td>
                            <td className="px-5 py-3">
                              <CopilotBadge
                                tone={r.estado === "paid" ? "success" : "neutral"}
                              >
                                {translateReceiptStatus(r.estado)}
                              </CopilotBadge>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CopilotCard>
            ) : null}

            {/* ── CONTACTOS ────────────────────────────────────────────────── */}
            {tab === "contactos" ? (
              <div className="space-y-4">
                <CopilotSectionTitle
                  title="Contactos"
                  subtitle="Personas disponibles para gestion de cobranza y contacto comercial."
                />
                <ContactsTab contacts={data.contacts} companyPhone={data.summary.phone} />
              </div>
            ) : null}

            {/* ── ACTUALIZACION DE DATOS ───────────────────────────────────── */}
            {tab === "zeta" ? (
              <div className="space-y-4">
                <CopilotCard>
                  <CopilotSectionTitle
                    title="Estado de actualizacion"
                    subtitle="Cuando se actualizaron por ultima vez los datos de este cliente."
                  />
                  <ZetaSyncStatusCard rows={data.zeta_sync_rows} />
                </CopilotCard>

                <CopilotCard>
                  <button
                    type="button"
                    onClick={() => setShowRawJson((v) => !v)}
                    className="flex w-full items-center justify-between gap-2 text-left"
                  >
                    <span className="text-sm font-semibold text-[var(--copilot-ink)]">
                      Ver detalle tecnico
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 text-[var(--copilot-ink-muted)] transition-transform ${showRawJson ? "rotate-180" : ""}`}
                      aria-hidden
                    />
                  </button>
                  {showRawJson ? (
                    <pre className="mt-4 max-h-[420px] overflow-auto rounded-xl bg-[rgba(44,40,37,0.04)] p-4 text-xs leading-relaxed text-[var(--copilot-ink)]">
                      {safeJsonPreview(data.zeta_metadata)}
                    </pre>
                  ) : null}
                </CopilotCard>
              </div>
            ) : null}
          </>
        ) : null}

        {!loading && !error && !data ? (
          <p className="text-sm text-[var(--copilot-ink-muted)]">Sin datos.</p>
        ) : null}
      </div>
    </div>
  );
}
