"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  XCircle,
  Zap,
} from "lucide-react";

import { useCopilotNotifications } from "@/hooks/use-copilot-notifications";
import type { CopilotNotification } from "@/lib/copilot-notifications/notification-types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return "ahora";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 172800) return "ayer";
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
  const yesterday = fmt(new Date(Date.now() - 86_400_000));
  if (item === yesterday) return "ayer";
  return "anterior";
}

const BUCKET_LABELS: Record<"hoy" | "ayer" | "anterior", string> = {
  hoy: "Hoy",
  ayer: "Ayer",
  anterior: "Anteriores",
};

/**
 * Returns a one-line cash-impact note for collection_received notifications
 * when receipt_date and treasury_baseline_date are present in metadata.
 * Returns null when the data is missing (legacy notifications, no baseline configured).
 */
function collectionCashImpactLine(metadata: Record<string, unknown>): string | null {
  const receiptDate =
    typeof metadata.receipt_date === "string" ? metadata.receipt_date : null;
  const baseline =
    typeof metadata.treasury_baseline_date === "string"
      ? metadata.treasury_baseline_date
      : null;

  if (!receiptDate || !baseline) return null;

  const fmt = (ymd: string) => {
    const parts = ymd.split("-");
    return parts.length === 3 ? `${parts[2]}/${parts[1]}` : ymd;
  };

  if (receiptDate >= baseline) {
    return "Sumado a Caja disponible.";
  }
  return `Pago del ${fmt(receiptDate)}. Ya incluido en el saldo cargado el ${fmt(baseline)}.`;
}

/** Smart CTA label derived from action_href. */
function actionLabel(href: string): string {
  if (href.includes("clientes-criticos")) return "Ver clientes críticos";
  if (href.includes("/clientes/")) return "Ver cliente";
  if (href.includes("/cartera")) return "Ver cartera";
  if (href.includes("/tesoreria")) return "Ver pagos";
  if (href.includes("/hoy")) return "Ver hoy";
  if (href.includes("/rutas")) return "Ver ruta";
  return "Ver";
}

// ─── Icon bubble ──────────────────────────────────────────────────────────────

type IconConfig = { bg: string; icon: React.ReactNode };

function getIconConfig(type: string, severity: string): IconConfig {
  const sz = "h-[15px] w-[15px] shrink-0";

  if (type === "collection_received")
    return { bg: "bg-emerald-50", icon: <TrendingUp className={`${sz} text-emerald-600`} aria-hidden /> };
  if (type === "new_debtor")
    return { bg: "bg-amber-50", icon: <Users className={`${sz} text-amber-600`} aria-hidden /> };
  if (type === "client_overdue")
    return { bg: "bg-rose-50", icon: <TrendingDown className={`${sz} text-rose-600`} aria-hidden /> };
  if (type === "treasury_payment_due")
    return {
      bg: severity === "critical" ? "bg-rose-50" : "bg-amber-50",
      icon: <Wallet className={`${sz} ${severity === "critical" ? "text-rose-600" : "text-amber-600"}`} aria-hidden />,
    };
  if (type === "treasury_payment_overdue")
    return { bg: "bg-rose-50", icon: <AlertTriangle className={`${sz} text-rose-600`} aria-hidden /> };
  if (type === "sync_changes_detected")
    return { bg: "bg-blue-50", icon: <Zap className={`${sz} text-blue-500`} aria-hidden /> };
  if (type === "sync_failed")
    return { bg: "bg-rose-50", icon: <XCircle className={`${sz} text-rose-500`} aria-hidden /> };
  if (type === "cash_risk_detected")
    return { bg: "bg-amber-50", icon: <AlertTriangle className={`${sz} text-amber-600`} aria-hidden /> };
  if (type === "debt_followup_summary")
    return { bg: "bg-rose-50", icon: <Users className={`${sz} text-rose-500`} aria-hidden /> };
  if (type === "notification_digest")
    return { bg: "bg-blue-50", icon: <Bell className={`${sz} text-blue-500`} aria-hidden /> };

  return { bg: "bg-[var(--copilot-surface-muted)]", icon: <Bell className={`${sz} text-[var(--copilot-ink-muted)]`} aria-hidden /> };
}

// ─── Single notification row ──────────────────────────────────────────────────

function NotifItem({
  n,
  onRead,
}: {
  n: CopilotNotification;
  onRead: (id: string) => void;
}) {
  const unread = !n.read_at;
  const { bg, icon } = getIconConfig(n.type, n.severity);
  const cashImpactLine =
    n.type === "collection_received"
      ? collectionCashImpactLine(n.metadata)
      : null;

  return (
    <div
      role="article"
      className={`cursor-default px-4 py-3.5 transition-colors hover:bg-[var(--copilot-soft-bg)] ${
        unread ? "bg-[rgba(31,107,74,0.035)]" : ""
      }`}
      onClick={() => { if (unread) onRead(n.id); }}
    >
      <div className="flex items-start gap-3">
        {/* Icon bubble */}
        <div
          className={`mt-[1px] flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${bg}`}
        >
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          {/* Title + unread dot */}
          <div className="flex items-start justify-between gap-2">
            <p className="text-[13px] font-semibold leading-snug text-[var(--copilot-ink)]">
              {n.title}
            </p>
            {unread ? (
              <span
                className="mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--copilot-accent)] opacity-80"
                aria-label="No leída"
              />
            ) : null}
          </div>

          {/* Body */}
          {n.body ? (
            <p className="mt-[3px] line-clamp-2 text-[12.5px] leading-relaxed text-[var(--copilot-ink-muted)]">
              {n.body}
            </p>
          ) : null}

          {/* Cash impact context (collection_received only) */}
          {cashImpactLine ? (
            <p className="mt-1 text-[11px] italic leading-snug text-[var(--copilot-ink-muted)]/70">
              {cashImpactLine}
            </p>
          ) : null}

          {/* Footer: time + action */}
          <div className="mt-2 flex items-center gap-2.5">
            <span className="text-[11px] tabular-nums text-[var(--copilot-ink-muted)]/70">
              {relativeTime(n.created_at)}
            </span>
            {n.action_href ? (
              <Link
                href={n.action_href}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-0.5 text-[11px] font-semibold text-[var(--copilot-accent)] transition-opacity hover:opacity-80"
              >
                {actionLabel(n.action_href)}
                <ChevronRight className="h-3 w-3" aria-hidden />
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function NotifSkeleton() {
  return (
    <div className="space-y-px">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3 px-4 py-3.5">
          <div className="h-7 w-7 animate-pulse rounded-full bg-[var(--copilot-border)]" />
          <div className="flex-1 space-y-2 pt-0.5">
            <div className="h-3 w-3/5 animate-pulse rounded-full bg-[var(--copilot-border)]" />
            <div className="h-2.5 w-4/5 animate-pulse rounded-full bg-[var(--copilot-border)]/70" />
            <div className="h-2.5 w-2/5 animate-pulse rounded-full bg-[var(--copilot-border)]/50" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main bell component ──────────────────────────────────────────────────────

export function CopilotNotificationBell() {
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } =
    useCopilotNotifications();

  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      const t = e.target as Node;
      if (
        panelRef.current && !panelRef.current.contains(t) &&
        triggerRef.current && !triggerRef.current.contains(t)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const groups = (["hoy", "ayer", "anterior"] as const)
    .map((bucket) => ({
      key: bucket,
      label: BUCKET_LABELS[bucket],
      items: notifications.filter((n) => dateBucket(n.created_at) === bucket),
    }))
    .filter((g) => g.items.length > 0);

  const badge = Math.min(unreadCount, 99);

  return (
    <div ref={triggerRef} className="relative">
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={
          unreadCount > 0
            ? `Notificaciones · ${unreadCount} sin leer`
            : "Notificaciones"
        }
        aria-expanded={open}
        className="relative flex h-8 w-8 items-center justify-center rounded-full text-[var(--copilot-ink-muted)] transition hover:bg-[var(--copilot-hover-bg)] hover:text-[var(--copilot-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--copilot-accent)]"
      >
        <Bell className="h-[17px] w-[17px]" aria-hidden />
        {badge > 0 ? (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white"
            aria-hidden
          >
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </button>

      {/* Dropdown panel */}
      {open ? (
        <div
          ref={panelRef}
          className="absolute right-0 top-full z-[80] mt-2 flex w-[420px] max-w-[calc(100vw-20px)] flex-col overflow-hidden rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-dropdown-bg)] shadow-2xl"
          style={{ maxHeight: "min(560px, calc(100vh - 80px))" }}
        >
          {/* Header */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-[var(--copilot-border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-semibold text-[var(--copilot-ink)]">
                Notificaciones
              </h2>
              {unreadCount > 0 ? (
                <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--copilot-accent)] px-1.5 text-[10px] font-bold leading-none text-white">
                  {unreadCount}
                </span>
              ) : null}
            </div>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={() => markAllAsRead()}
                className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[11.5px] font-medium text-[var(--copilot-accent)] transition-opacity hover:opacity-70"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                Marcar todas como leídas
              </button>
            ) : null}
          </div>

          {/* Body */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {loading && notifications.length === 0 ? (
              <NotifSkeleton />
            ) : groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--copilot-surface-muted)]">
                  <Bell className="h-5 w-5 text-slate-300" aria-hidden />
                </div>
                <p className="text-[13px] font-semibold text-[var(--copilot-ink)]">
                  Sin novedades por ahora.
                </p>
                <p className="max-w-[220px] text-[12px] leading-relaxed text-[var(--copilot-ink-muted)]">
                  Copilot te avisará cuando haya cobros, vencimientos o cambios relevantes.
                </p>
              </div>
            ) : (
              <div>
                {groups.map((group, gi) => (
                  <div key={group.key} className={gi > 0 ? "border-t border-[var(--copilot-border)]/60" : ""}>
                    {/* Sticky section header */}
                    <div className="sticky top-0 z-10 bg-[var(--copilot-sticky-bg)] px-4 pb-1.5 pt-2.5 backdrop-blur-sm">
                      <p className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]/60">
                        {group.label}
                      </p>
                    </div>
                    {/* Items with subtle dividers */}
                    <div className="divide-y divide-[var(--copilot-border)]/40">
                      {group.items.map((n) => (
                        <NotifItem key={n.id} n={n} onRead={markAsRead} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-[var(--copilot-border)] px-4 py-2.5">
            <Link
              href="/copilot/alertas"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1 text-[11.5px] font-medium text-[var(--copilot-ink-muted)] transition-colors hover:text-[var(--copilot-accent)]"
            >
              Ver todas
              <ChevronRight className="h-3 w-3" aria-hidden />
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
