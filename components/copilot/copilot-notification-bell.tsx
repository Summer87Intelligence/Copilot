"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  ExternalLink,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  XCircle,
  Zap,
} from "lucide-react";

import { useCopilotNotifications } from "@/hooks/use-copilot-notifications";
import type { CopilotNotification } from "@/lib/copilot-notifications/notification-types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Icon by type ────────────────────────────────────────────────────────────

function NotifIcon({ type, severity }: { type: string; severity: string }) {
  const base = "h-3.5 w-3.5 shrink-0";
  if (type === "collection_received")
    return <TrendingUp className={`${base} text-emerald-600`} aria-hidden />;
  if (type === "new_debtor")
    return <Users className={`${base} text-amber-600`} aria-hidden />;
  if (type === "client_overdue")
    return <TrendingDown className={`${base} text-rose-600`} aria-hidden />;
  if (type === "treasury_payment_due")
    return (
      <Wallet
        className={`${base} ${severity === "critical" ? "text-rose-600" : "text-amber-600"}`}
        aria-hidden
      />
    );
  if (type === "treasury_payment_overdue")
    return <AlertTriangle className={`${base} text-rose-600`} aria-hidden />;
  if (type === "sync_changes_detected")
    return <Zap className={`${base} text-blue-500`} aria-hidden />;
  if (type === "sync_failed")
    return <XCircle className={`${base} text-rose-500`} aria-hidden />;
  if (type === "cash_risk_detected")
    return <AlertTriangle className={`${base} text-amber-600`} aria-hidden />;
  if (type === "notification_digest")
    return <Bell className={`${base} text-blue-500`} aria-hidden />;
  return <Bell className={`${base} text-[var(--copilot-ink-muted)]`} aria-hidden />;
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

  return (
    <div
      className={`cursor-default px-4 py-3 transition-colors hover:bg-slate-50 ${
        unread ? "bg-[rgba(31,107,74,0.03)]" : ""
      }`}
      onClick={() => { if (unread) onRead(n.id); }}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[rgba(44,40,37,0.07)]">
          <NotifIcon type={n.type} severity={n.severity} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p
              className={`text-[13px] leading-snug ${
                unread
                  ? "font-semibold text-[var(--copilot-ink)]"
                  : "font-medium text-[var(--copilot-ink)]"
              }`}
            >
              {n.title}
            </p>
            {unread ? (
              <span
                className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--copilot-accent)]"
                aria-label="No leída"
              />
            ) : null}
          </div>

          {n.body ? (
            <p className="mt-0.5 text-xs leading-snug text-[var(--copilot-ink-muted)]">
              {n.body}
            </p>
          ) : null}

          <div className="mt-1.5 flex items-center gap-3">
            <span className="text-[11px] text-[var(--copilot-ink-muted)]">
              {relativeTime(n.created_at)}
            </span>
            {n.action_href ? (
              <Link
                href={n.action_href}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 text-[11px] font-semibold text-[var(--copilot-accent)] hover:underline"
              >
                <ExternalLink className="h-2.5 w-2.5" aria-hidden />
                Ver
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
    <div className="space-y-3 p-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3">
          <div className="h-6 w-6 animate-pulse rounded-full bg-[var(--copilot-border)]" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-3/4 animate-pulse rounded bg-[var(--copilot-border)]" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--copilot-border)]" />
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

  // Group notifications by date bucket
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
        className="relative flex h-8 w-8 items-center justify-center rounded-full text-[var(--copilot-ink-muted)] transition hover:bg-[rgba(44,40,37,0.08)] hover:text-[var(--copilot-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--copilot-accent)]"
      >
        <Bell className="h-4 w-4" aria-hidden />
        {badge > 0 ? (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white"
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
          className="absolute right-0 top-full z-[80] mt-2 flex w-[360px] flex-col overflow-hidden rounded-2xl border border-[var(--copilot-border)] bg-white shadow-xl"
          style={{ maxHeight: "min(520px, calc(100vh - 80px))" }}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--copilot-border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">
                Notificaciones
              </h2>
              {unreadCount > 0 ? (
                <span className="rounded-full bg-[var(--copilot-accent)] px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                  {unreadCount}
                </span>
              ) : null}
            </div>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={() => markAllAsRead()}
                className="flex items-center gap-1 text-xs font-medium text-[var(--copilot-accent)] transition hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                Marcar todas como leídas
              </button>
            ) : null}
          </div>

          {/* Body */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <NotifSkeleton />
            ) : groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                <Bell className="h-8 w-8 text-[var(--copilot-border)]" aria-hidden />
                <p className="text-sm font-medium text-[var(--copilot-ink)]">
                  Sin novedades por ahora.
                </p>
                <p className="text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
                  Copilot te avisará cuando haya cobros, vencimientos o cambios
                  relevantes.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--copilot-border)]/60">
                {groups.map((group) => (
                  <div key={group.key}>
                    <div className="sticky top-0 bg-[rgba(255,255,255,0.96)] px-4 py-1.5 backdrop-blur-sm">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        {group.label}
                      </p>
                    </div>
                    {group.items.map((n) => (
                      <NotifItem key={n.id} n={n} onRead={markAsRead} />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
