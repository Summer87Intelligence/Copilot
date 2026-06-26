"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  ChevronRight,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  XCircle,
  Zap,
} from "lucide-react";

import { useCopilotNotifications } from "@/hooks/use-copilot-notifications";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { copilotPageMainClass } from "@/components/copilot/copilot-ui";
import type { CopilotNotification } from "@/lib/copilot-notifications/notification-types";
import { isAutoResolvedCashRisk } from "@/lib/copilot-notifications/notification-display";
import { useDisplayCurrency } from "@/components/copilot/display-currency-provider";
import { convertToUsdEquivalent, formatUsdEquivalent } from "@/lib/currency-display-mode";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return "ahora";
  if (diff < 3_600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86_400) return `hace ${Math.floor(diff / 3_600)} h`;
  if (diff < 172_800) return "ayer";
  return new Date(isoString).toLocaleDateString("es-UY", {
    day: "numeric",
    month: "short",
    timeZone: "America/Montevideo",
  });
}

function dateBucket(isoString: string): "hoy" | "ayer" | "anterior" {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-CA", { timeZone: "America/Montevideo" });
  const item = fmt(new Date(isoString));
  const today = fmt(new Date());
  if (item === today) return "hoy";
  if (item === fmt(new Date(Date.now() - 86_400_000))) return "ayer";
  return "anterior";
}

function effectiveBucketFor(n: CopilotNotification): "hoy" | "ayer" | "anterior" {
  if (isAutoResolvedCashRisk(n)) return "anterior";
  return dateBucket(n.created_at);
}

function actionLabel(href: string): string {
  if (href.includes("clientes-criticos")) return "Ver principales deudores";
  if (href.includes("/clientes/")) return "Ver cliente";
  if (href.includes("filter=overdue")) return "Ver clientes atrasados";
  if (href.includes("/cartera")) return "Ver cartera";
  if (href.includes("section=pagos")) return "Ver pagos";
  if (href.includes("/tesoreria")) return "Ver Tesorería";
  if (href.includes("/alertas")) return "Ver alertas";
  if (href.includes("/acciones")) return "Ver acciones";
  if (href.includes("/hoy")) return "Ver hoy";
  return "Ver detalle";
}

// ─── Icon bubbles ─────────────────────────────────────────────────────────────

type IconConfig = { bg: string; icon: React.ReactNode };

function getIconConfig(type: string, severity: string): IconConfig {
  const sz = "h-4 w-4 shrink-0";
  if (type === "collection_received")
    return {
      bg: "bg-[var(--copilot-badge-success-bg)]",
      icon: <TrendingUp className={`${sz} text-[var(--copilot-success-text)]`} aria-hidden />,
    };
  if (type === "new_debtor")
    return {
      bg: "bg-[var(--copilot-badge-warning-bg)]",
      icon: <Users className={`${sz} text-[var(--copilot-warning-text)]`} aria-hidden />,
    };
  if (type === "client_overdue")
    return {
      bg: "bg-[var(--copilot-badge-danger-bg)]",
      icon: <TrendingDown className={`${sz} text-[var(--copilot-danger-text)]`} aria-hidden />,
    };
  if (type === "treasury_payment_due")
    return {
      bg: severity === "critical" ? "bg-[var(--copilot-badge-danger-bg)]" : "bg-[var(--copilot-badge-warning-bg)]",
      icon: (
        <Wallet
          className={`${sz} ${severity === "critical" ? "text-[var(--copilot-danger-text)]" : "text-[var(--copilot-warning-text)]"}`}
          aria-hidden
        />
      ),
    };
  if (type === "treasury_payment_overdue")
    return {
      bg: "bg-[var(--copilot-badge-danger-bg)]",
      icon: <AlertTriangle className={`${sz} text-[var(--copilot-danger-text)]`} aria-hidden />,
    };
  if (type === "sync_changes_detected")
    return {
      bg: "bg-[var(--copilot-badge-neutral-bg)]",
      icon: <Zap className={`${sz} text-[var(--copilot-accent)]`} aria-hidden />,
    };
  if (type === "sync_failed")
    return {
      bg: "bg-[var(--copilot-badge-danger-bg)]",
      icon: <XCircle className={`${sz} text-[var(--copilot-danger-text)]`} aria-hidden />,
    };
  if (type === "cash_risk_detected")
    return {
      bg: "bg-[var(--copilot-badge-warning-bg)]",
      icon: <AlertTriangle className={`${sz} text-[var(--copilot-warning-text)]`} aria-hidden />,
    };
  return {
    bg: "bg-[var(--copilot-soft-bg)]",
    icon: <Bell className={`${sz} text-[var(--copilot-subtle)]`} aria-hidden />,
  };
}

// ─── Severity pill ────────────────────────────────────────────────────────────

const SEVERITY_CFG = {
  critical: { label: "Crítica", cls: "bg-[var(--copilot-badge-danger-bg)] text-[var(--copilot-danger-text)]" },
  warning: { label: "Alerta", cls: "bg-[var(--copilot-badge-warning-bg)] text-[var(--copilot-warning-text)]" },
  info: { label: "Info", cls: "bg-[var(--copilot-badge-neutral-bg)] text-[var(--copilot-ink-muted)]" },
} as const;

function SeverityPill({ severity }: { severity: string }) {
  const cfg =
    SEVERITY_CFG[severity as keyof typeof SEVERITY_CFG] ?? {
      label: severity,
      cls: "bg-[var(--copilot-soft-bg)] text-[var(--copilot-muted)]",
    };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────

type AlertFilter =
  | "all"
  | "unread"
  | "critical"
  | "cobros"
  | "clientes"
  | "tesoreria"
  | "sistema";

const FILTER_TABS: Array<{ id: AlertFilter; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "unread", label: "No leídas" },
  { id: "critical", label: "Críticas" },
  { id: "cobros", label: "Cobros" },
  { id: "clientes", label: "Clientes" },
  { id: "tesoreria", label: "Tesorería" },
  { id: "sistema", label: "Sistema" },
];

function matchesFilter(n: CopilotNotification, filter: AlertFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "unread":
      return !n.read_at;
    case "critical":
      return n.severity === "critical" && !isAutoResolvedCashRisk(n);
    case "cobros":
      return n.type === "collection_received";
    case "clientes":
      return n.type === "client_overdue" || n.type === "new_debtor";
    case "tesoreria":
      return (
        n.type === "treasury_payment_due" || n.type === "treasury_payment_overdue"
      );
    case "sistema":
      return (
        n.type === "sync_changes_detected" ||
        n.type === "sync_failed" ||
        n.type === "cash_risk_detected" ||
        n.type === "copilot_action_suggested" ||
        n.type === "notification_digest"
      );
    default:
      return true;
  }
}

// ─── Metric card ──────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: number;
  sub: string;
  tone?: "critical" | "warning" | "positive" | "neutral";
}) {
  const cfg = {
    critical: {
      border: "border-[var(--copilot-danger-border)]",
      bg: "bg-[var(--copilot-card-bg)]/70",
      label: "text-[var(--copilot-ink-muted)]",
      value: "text-[var(--copilot-danger-text-strong)]",
    },
    warning: {
      border: "border-[var(--copilot-warning-border)]",
      bg: "bg-[var(--copilot-card-bg)]/70",
      label: "text-[var(--copilot-ink-muted)]",
      value: "text-[var(--copilot-warning-text-strong)]",
    },
    positive: {
      border: "border-[var(--copilot-success-border)]",
      bg: "bg-[var(--copilot-card-bg)]/70",
      label: "text-[var(--copilot-ink-muted)]",
      value: "text-[var(--copilot-success-text-strong)]",
    },
    neutral: {
      border: "border-[var(--copilot-border)]",
      bg: "bg-[var(--copilot-card-bg)]/70",
      label: "text-[var(--copilot-ink-muted)]",
      value: "text-[var(--copilot-ink)]",
    },
  }[tone];

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} px-4 py-3`}>
      <p
        className={`text-[10px] font-semibold uppercase tracking-wide ${cfg.label}`}
      >
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${cfg.value}`}>
        {value}
      </p>
      <p className={`mt-0.5 text-[11px] ${cfg.label}`}>{sub}</p>
    </div>
  );
}

// ─── Notification card ────────────────────────────────────────────────────────

function NotificationCard({
  n,
  onRead,
}: {
  n: CopilotNotification;
  onRead: (id: string) => void;
}) {
  const unread = !n.read_at;
  const autoResolved = isAutoResolvedCashRisk(n);
  const displayTitle = autoResolved ? "Cobertura de caja mejorada" : n.title;
  const displaySeverity = autoResolved ? "info" : n.severity;
  const { bg, icon } = getIconConfig(n.type, autoResolved ? "info" : n.severity);
  const { mode, fxRate } = useDisplayCurrency();

  return (
    <article
      className={`rounded-xl border p-4 transition-colors ${
        unread
          ? "border-[rgba(31,107,74,0.22)] bg-[rgba(31,107,74,0.028)] shadow-sm"
          : "border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${bg}`}
        >
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          {/* Title row */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p
              className={`text-[13.5px] font-semibold leading-snug ${
                unread
                  ? "text-[var(--copilot-ink)]"
                  : "text-[var(--copilot-ink)]/80"
              }`}
            >
              {displayTitle}
            </p>
            <SeverityPill severity={displaySeverity} />
            {unread ? (
              <span
                className="ml-auto h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--copilot-accent)]"
                aria-label="No leída"
              />
            ) : null}
          </div>

          {/* Body */}
          {n.body ? (
            <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-[var(--copilot-ink-muted)]">
              {n.body}
            </p>
          ) : null}

          {/* Amount */}
          {n.amount != null && n.currency ? (
            <p className="mt-1.5 text-[13px] font-semibold tabular-nums text-[var(--copilot-ink)]">
              {mode === "usd_equivalent"
                ? formatUsdEquivalent(convertToUsdEquivalent({ uyu: n.currency === "UYU" ? n.amount : 0, usd: n.currency === "USD" ? n.amount : 0 }, fxRate))
                : `${n.currency} ${n.amount.toLocaleString("es-UY", { maximumFractionDigits: 0 })}`}
            </p>
          ) : null}

          {/* Footer */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-[11px] tabular-nums text-[var(--copilot-ink-muted)]/60">
              {relativeTime(n.created_at)}
            </span>

            {n.action_href ? (
              <Link
                href={n.action_href}
                onClick={() => {
                  if (unread) onRead(n.id);
                }}
                className="flex items-center gap-0.5 text-[11.5px] font-semibold text-[var(--copilot-accent)] transition-opacity hover:opacity-75"
              >
                {actionLabel(n.action_href)}
                <ChevronRight className="h-3 w-3" aria-hidden />
              </Link>
            ) : null}

            {unread ? (
              <button
                type="button"
                onClick={() => onRead(n.id)}
                className="ml-auto flex items-center gap-1 text-[11px] font-medium text-[var(--copilot-ink-muted)] transition-opacity hover:opacity-70"
              >
                <CheckCheck className="h-3 w-3" aria-hidden />
                Marcar leída
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function NotifSkeleton() {
  return (
    <div className="space-y-2.5">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex gap-3 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4"
        >
          <div className="h-9 w-9 animate-pulse rounded-xl bg-[var(--copilot-border)]" />
          <div className="flex-1 space-y-2.5 pt-1">
            <div className="flex gap-2">
              <div className="h-3 w-2/5 animate-pulse rounded-full bg-[var(--copilot-border)]" />
              <div className="h-3 w-12 animate-pulse rounded-full bg-[var(--copilot-border)]/70" />
            </div>
            <div className="h-2.5 w-4/5 animate-pulse rounded-full bg-[var(--copilot-border)]/60" />
            <div className="h-2.5 w-1/4 animate-pulse rounded-full bg-[var(--copilot-border)]/40" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const BUCKET_ORDER = ["hoy", "ayer", "anterior"] as const;
const BUCKET_LABELS: Record<"hoy" | "ayer" | "anterior", string> = {
  hoy: "Hoy",
  ayer: "Ayer",
  anterior: "Anteriores",
};

export default function CopilotAlertasPage() {
  const { notifications, unreadCount, loading, error, markAsRead, markAllAsRead, refetch } =
    useCopilotNotifications();

  const [activeFilter, setActiveFilter] = useState<AlertFilter>("all");

  const metrics = useMemo(() => {
    let unread = 0,
      critical = 0,
      vencimientos = 0,
      cobros = 0;
    for (const n of notifications) {
      if (!n.read_at) unread++;
      if (n.severity === "critical" && !isAutoResolvedCashRisk(n)) critical++;
      if (
        n.type === "treasury_payment_due" ||
        n.type === "treasury_payment_overdue"
      )
        vencimientos++;
      if (n.type === "collection_received") cobros++;
    }
    return { unread, critical, vencimientos, cobros };
  }, [notifications]);

  const tabCounts = useMemo(() => {
    const counts: Record<AlertFilter, number> = {
      all: 0,
      unread: 0,
      critical: 0,
      cobros: 0,
      clientes: 0,
      tesoreria: 0,
      sistema: 0,
    };
    for (const n of notifications) {
      counts.all++;
      if (!n.read_at) counts.unread++;
      if (n.severity === "critical" && !isAutoResolvedCashRisk(n)) counts.critical++;
      if (n.type === "collection_received") counts.cobros++;
      if (n.type === "client_overdue" || n.type === "new_debtor")
        counts.clientes++;
      if (
        n.type === "treasury_payment_due" ||
        n.type === "treasury_payment_overdue"
      )
        counts.tesoreria++;
      if (
        n.type === "sync_changes_detected" ||
        n.type === "sync_failed" ||
        n.type === "cash_risk_detected" ||
        n.type === "copilot_action_suggested" ||
        n.type === "notification_digest"
      )
        counts.sistema++;
    }
    return counts;
  }, [notifications]);

  const groups = useMemo(() => {
    const filtered = notifications.filter((n) =>
      matchesFilter(n, activeFilter)
    );
    // Dedupe alertas con misma señal visible: mismo tipo + entidad + moneda +
    // monto + cuerpo normalizado → una sola card.
    const seen = new Set<string>();
    const deduped = filtered.filter((n) => {
      const normalizedBody = (n.body ?? "")
        .toLocaleLowerCase("es")
        .replace(/\s+/g, " ")
        .trim();
      const amount = n.amount != null && Number.isFinite(n.amount)
        ? Math.round(n.amount * 100)
        : "";
      const key = [
        n.type,
        n.entity_id ?? "",
        n.currency ?? "",
        amount,
        normalizedBody,
      ].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return BUCKET_ORDER.map((bucket) => ({
      key: bucket,
      label: BUCKET_LABELS[bucket],
      items: deduped.filter((n) => effectiveBucketFor(n) === bucket),
    })).filter((g) => g.items.length > 0);
  }, [notifications, activeFilter]);

  const totalFiltered = groups.reduce((s, g) => s + g.items.length, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        surfaceId="copilot.alertas"
        title="Alertas"
        description="Cobros, vencimientos, pagos y eventos relevantes del negocio."
      />

      <div className={copilotPageMainClass}>
        {/* ── Metrics ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard
            label="No leídas"
            value={metrics.unread}
            sub="pendientes de revisar"
            tone={metrics.unread > 0 ? "warning" : "neutral"}
          />
          <MetricCard
            label="Críticas"
            value={metrics.critical}
            sub="requieren acción"
            tone={metrics.critical > 0 ? "critical" : "neutral"}
          />
          <MetricCard
            label="Vencimientos"
            value={metrics.vencimientos}
            sub="próximos y atrasados"
            tone={metrics.vencimientos > 0 ? "warning" : "neutral"}
          />
          <MetricCard
            label="Cobros recibidos"
            value={metrics.cobros}
            sub="últimas 72 h"
            tone={metrics.cobros > 0 ? "positive" : "neutral"}
          />
        </div>

        {/* ── Overdue clients CTA — shown when there are client_overdue alerts ── */}
        {tabCounts.clientes > 0 ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--copilot-warning-border)] bg-[var(--copilot-card-bg)]/70 px-4 py-2.5">
            <div>
              <p className="text-[13px] text-[var(--copilot-ink)]">
                <span className="font-semibold text-[var(--copilot-warning-text-strong)]">{tabCounts.clientes}</span>{" "}
                {tabCounts.clientes === 1
                  ? "evento generado por cliente atrasado"
                  : "eventos generados por clientes atrasados"}
              </p>
              <p className="text-[11px] text-[var(--copilot-ink-muted)]">
                Eventos históricos del motor de alertas · Ver Cartera para el estado actual
              </p>
            </div>
            <Link
              href="/copilot/cartera?filter=overdue"
              className="shrink-0 text-[12px] font-semibold text-[var(--copilot-accent)] hover:underline"
            >
              Ver clientes atrasados →
            </Link>
          </div>
        ) : null}

        {/* ── Filters ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          {/* Horizontal scroll on mobile */}
          <div className="-mx-6 min-w-0 flex-1 overflow-x-auto px-6 sm:mx-0 sm:overflow-x-visible sm:px-0">
            <div className="flex shrink-0 gap-2 pb-0.5">
              {FILTER_TABS.map(({ id, label }) => {
                const count = tabCounts[id];
                const active = activeFilter === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveFilter(id)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
                      active
                        ? "bg-[var(--copilot-ink)] text-white shadow-sm"
                        : "bg-[var(--copilot-card-bg)]/80 text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)] hover:bg-[var(--copilot-panel-bg)]"
                    }`}
                  >
                    {label}
                    {count > 0 ? (
                      <span
                        className={`rounded-full px-1.5 py-px text-[10px] font-bold leading-none ${
                          active
                            ? "bg-[var(--copilot-card-bg)]/20 text-white"
                            : "bg-[var(--copilot-border)] text-[var(--copilot-ink-muted)]"
                        }`}
                      >
                        {count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={markAllAsRead}
              className="flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-[var(--copilot-accent)] transition-opacity hover:opacity-70"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Marcar todas como leídas</span>
            </button>
          ) : null}
        </div>

        {/* ── List ────────────────────────────────────────────────────────── */}
        {error && notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--copilot-danger-border)] bg-[var(--copilot-card-bg)] px-6 py-10 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--copilot-tone-danger-bg)]">
              <XCircle className="h-5 w-5 text-[var(--copilot-danger-text)]" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="text-[15px] font-semibold text-[var(--copilot-ink)]">
                No se pudieron cargar las alertas.
              </p>
              <p className="max-w-sm text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
                Verificá tu conexión e intentá de nuevo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refetch()}
              className="flex items-center gap-1.5 rounded-xl bg-[var(--copilot-card-bg)] px-4 py-2 text-[13px] font-semibold text-[var(--copilot-ink)] ring-1 ring-[var(--copilot-border)] transition-opacity hover:opacity-70"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Reintentar
            </button>
          </div>
        ) : loading && notifications.length === 0 ? (
          <NotifSkeleton />
        ) : totalFiltered === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-6 py-12 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--copilot-soft-bg)]">
              <Bell className="h-5 w-5 text-[var(--copilot-subtle)]" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="text-[15px] font-semibold text-[var(--copilot-ink)]">
                {activeFilter === "all"
                  ? "Sin alertas por ahora."
                  : "Sin resultados para este filtro."}
              </p>
              <p className="max-w-sm text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
                {activeFilter === "all"
                  ? "Copilot te avisará cuando haya cobros, vencimientos o cambios relevantes."
                  : "Probá otro filtro para ver más notificaciones."}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.key}>
                <h2 className="mb-3 text-[10.5px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]/60">
                  {group.label}
                </h2>
                <div className="space-y-2.5">
                  {group.items.map((n) => (
                    <NotificationCard key={n.id} n={n} onRead={markAsRead} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
