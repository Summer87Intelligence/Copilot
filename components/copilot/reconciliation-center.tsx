"use client";

/**
 * ReconciliationCenter
 * --------------------
 * Panel de salud financiera del sistema (Vercel observability-style).
 * Render-only: solo lee del `report` y deriva ratios sobre subtotales que el
 * backend ya calculó.
 *
 * Estructura:
 *  1. Tiles superiores (4): reconciliation rate, stale ratio, unknown
 *     currency ratio, period exclusion ratio.
 *  2. Sync health: 1 fila por `resource_flow` con status, edad, bootstrap.
 *  3. Checks: lista de validaciones binarias (✓/⚠) con count y descripción.
 */

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock,
  Hourglass,
  ServerCog,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getZetaSyncResourceFlowLabel } from "@/lib/integrations/zeta/zeta-sync-resource-keys";

import {
  formatCarteraInteger,
  formatCarteraPercent,
  formatRelativeAgeHours,
} from "@/lib/copilot-cartera-format";
import type {
  FinancialConsistencyReport,
  StalenessStatus,
  SyncStateSummary,
} from "@/lib/copilot-financial-reconciliation";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type CheckStatus = "ok" | "warn" | "critical" | "pending";

type ReconCheck = {
  id: string;
  label: string;
  description: string;
  status: CheckStatus;
  count?: number;
  icon: LucideIcon;
};

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function ReconciliationCenter({
  report,
  generatedAt,
  isPreSync = false,
}: {
  report: FinancialConsistencyReport;
  /** Sobre-escribe `report.generatedAt` (útil al refrescar manualmente). */
  generatedAt?: string;
  /** Si true, el período incluye facturas pre-2026 — muestra checks históricos. */
  isPreSync?: boolean;
}) {
  const checks = useMemo<ReconCheck[]>(() => buildChecks(report, isPreSync), [report, isPreSync]);
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);

  const criticalCount = checks.filter((c) => c.status === "critical").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;

  return (
    <motion.section
      aria-label="Centro de reconciliación"
      className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card)] shadow-[var(--copilot-shadow)]"
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut", delay: reduce ? 0 : 0.08 }}
    >
      <header
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((v) => !v); }
        }}
        className={[
          "flex flex-wrap items-center justify-between gap-3 px-5 py-4 cursor-pointer select-none transition-colors hover:bg-[rgba(44,40,37,0.02)]",
          open ? "border-b border-[var(--copilot-border)] rounded-t-2xl" : "rounded-2xl",
        ].join(" ")}
      >
        <div>
          <h3 className="text-base font-semibold tracking-tight text-[var(--copilot-ink)]">
            Centro de reconciliación
          </h3>
          <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
            Salud del pipeline financiero · ratios derivados de subtotales del backend.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-[11px] uppercase tracking-[0.08em]">
            {criticalCount > 0 ? (
              <span className="font-semibold text-[var(--copilot-danger-text-strong)]">
                {criticalCount} crítico{criticalCount === 1 ? "" : "s"}
              </span>
            ) : warnCount > 0 ? (
              <span className="text-[var(--copilot-warning-text-strong)]">{warnCount} warn</span>
            ) : (
              <span className="text-[var(--copilot-ink-muted)]">
                generado {formatGeneratedAt(generatedAt ?? report.generatedAt)}
              </span>
            )}
          </p>
          <ChevronDown
            className={`h-3.5 w-3.5 text-[var(--copilot-ink-muted)] transition-transform duration-200 ${open ? "rotate-0" : "-rotate-90"}`}
            aria-hidden
          />
        </div>
      </header>

      {open && (
        <motion.div
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          <div className="grid gap-px bg-[var(--copilot-border)]/70 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div className="space-y-5 bg-[var(--copilot-card)] p-5">
              <MetricsTiles report={report} />
              <SyncHealth syncStates={report.syncStates} />
            </div>
            <div className="space-y-3 bg-[var(--copilot-card)] p-5">
              <SubsectionHeader
                title="Checks"
                subtitle="Validaciones determinísticas sobre el reporte actual."
              />
              <ChecksList checks={checks} />
            </div>
          </div>
        </motion.div>
      )}
    </motion.section>
  );
}

// ---------------------------------------------------------------------------
// Metrics tiles
// ---------------------------------------------------------------------------

function MetricsTiles({ report }: { report: FinancialConsistencyReport }) {
  const m = report.metrics;
  // Reconciliation rate = 1 - unknown_currency_ratio (ratio de facturas con
  // moneda válida sobre las consideradas).
  const reconRate =
    m.unknown_currency_ratio == null ? null : Math.max(0, 1 - m.unknown_currency_ratio);

  return (
    <section aria-label="Métricas de reconciliación" className="space-y-2">
      <SubsectionHeader
        title="Métricas"
        subtitle="Ratios sobre las facturas consideradas en el reporte."
      />
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <MetricTile
          label="Reconciliation"
          value={reconRate}
          tone={
            reconRate == null
              ? "neutral"
              : reconRate >= 0.99
                ? "positive"
                : reconRate >= 0.95
                  ? "info"
                  : "warning"
          }
          hint="Facturas con moneda reconocida"
        />
        <MetricTile
          label="Stale"
          value={m.stale_ratio}
          tone={
            m.stale_ratio == null
              ? "neutral"
              : m.stale_ratio === 0
                ? "positive"
                : m.stale_ratio < 0.1
                  ? "info"
                  : "warning"
          }
          hint="Clientes con datos atrasados"
        />
        <MetricTile
          label="Unknown CCY"
          value={m.unknown_currency_ratio}
          tone={
            m.unknown_currency_ratio == null
              ? "neutral"
              : m.unknown_currency_ratio === 0
                ? "positive"
                : "warning"
          }
          hint="Facturas sin moneda válida"
        />
        <MetricTile
          label="Period excl."
          value={m.period_exclusion_ratio}
          tone={m.period_exclusion_ratio == null ? "neutral" : "info"}
          hint="Excluidas por filtro de período"
        />
      </div>
    </section>
  );
}

type Tone = "positive" | "info" | "warning" | "neutral";

const TILE_TONE: Record<Tone, string> = {
  positive: "border-[var(--copilot-success-border)]/70 bg-[var(--copilot-tone-positive-bg)]/40 text-[var(--copilot-success-text-strong)]",
  info: "border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/65 text-[var(--copilot-ink)]",
  warning: "border-[var(--copilot-warning-border)]/70 bg-[var(--copilot-tone-warning-bg)]/55 text-[var(--copilot-warning-text-strong)]",
  neutral: "border-dashed border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/40 text-[var(--copilot-ink-muted)]",
};

function MetricTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | null;
  hint: string;
  tone: Tone;
}) {
  return (
    <div className={`rounded-xl border p-3 ${TILE_TONE[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] opacity-80">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold leading-tight tabular-nums">
        {formatCarteraPercent(value)}
      </p>
      <p className="mt-0.5 text-[11px] opacity-75">{hint}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sync health
// ---------------------------------------------------------------------------

function SyncHealth({ syncStates }: { syncStates: readonly SyncStateSummary[] }) {
  return (
    <section aria-label="Sync health" className="space-y-2">
      <SubsectionHeader
        title="Sync health"
        subtitle="Última corrida exitosa de cada flujo Zeta."
      />
      {syncStates.length === 0 ? (
        <EmptyRow icon={ServerCog} text="Sin estados de sincronización registrados." />
      ) : (
        <ul className="divide-y divide-[var(--copilot-border)] overflow-hidden rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/55">
          {syncStates.map((s) => (
            <SyncRow key={s.resource_flow} state={s} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SyncRow({ state }: { state: SyncStateSummary }) {
  const label = getZetaSyncResourceFlowLabel(state.resource_flow);
  return (
    <li className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5">
      <SyncStatusDot status={state.status} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[var(--copilot-ink)]">
          {label}
        </p>
        <p className="truncate text-[11px] text-[var(--copilot-ink-muted)]">
          {state.resource_flow} · {formatRelativeAgeHours(state.ageHours)} ·{" "}
          {state.bootstrap_completed ? "bootstrap completo" : "bootstrap pendiente"}
        </p>
      </div>
      <SyncStatusBadge status={state.status} />
    </li>
  );
}

function SyncStatusDot({ status }: { status: StalenessStatus }) {
  const cls =
    status === "ok"
      ? "bg-[var(--copilot-success-text)]"
      : status === "warning"
        ? "bg-[var(--copilot-warning-text)]"
        : status === "critical"
          ? "bg-[var(--copilot-danger-text)]"
          : "bg-[var(--copilot-ink-muted)]";
  return <span className={`block h-2 w-2 rounded-full ${cls}`} aria-hidden />;
}

const STATUS_LABEL: Record<StalenessStatus, string> = {
  ok: "OK",
  warning: "WARN",
  critical: "CRIT",
  never_synced: "—",
};

const STATUS_BADGE_CLASS: Record<StalenessStatus, string> = {
  ok: "border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]",
  warning: "border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)]",
  critical: "border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)]",
  never_synced:
    "border-[var(--copilot-border)] bg-[rgba(44,40,37,0.04)] text-[var(--copilot-ink-muted)]",
};

function SyncStatusBadge({ status }: { status: StalenessStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${STATUS_BADGE_CLASS[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function buildChecks(report: FinancialConsistencyReport, isPreSync: boolean): ReconCheck[] {
  const orphans = report.orphanSummary.warned;
  const orphanAutoClose = report.orphanSummary.pending_auto_close;
  const orphanStaleMeta = report.orphanSummary.stale_metadata ?? 0;
  const unknownCcy = report.totalInvoicesWithoutCurrency;
  const stale =
    report.staleSummary.warning + report.staleSummary.critical + report.staleSummary.never_synced;
  const bootstrapPending = report.syncStates.filter((s) => !s.bootstrap_completed).length;

  const result: ReconCheck[] = [
    {
      id: "orphans",
      label: "Orphan invoices",
      description:
        orphans === 0
          ? orphanStaleMeta > 0
            ? `Sin huérfanas activas; ${formatCarteraInteger(orphanStaleMeta)} metadata obsoleta (cron repair).`
            : "Sin facturas huérfanas activas."
          : orphanAutoClose > 0
            ? `${formatCarteraInteger(orphanAutoClose)} pendiente${orphanAutoClose === 1 ? "" : "s"} de cierre automático.`
            : `${formatCarteraInteger(orphans)} factura${orphans === 1 ? "" : "s"} con deuda abierta.`,
      status: orphans === 0 ? "ok" : orphanAutoClose > 0 ? "critical" : "warn",
      count: orphans,
      icon: AlertTriangle,
    },
    {
      id: "unknown-ccy",
      label: "Unknown currency",
      description:
        unknownCcy === 0
          ? "Todas las facturas tienen moneda reconocida (USD/UYU)."
          : `${formatCarteraInteger(unknownCcy)} factura${unknownCcy === 1 ? "" : "s"} sin currency_code válido.`,
      status: unknownCcy === 0 ? "ok" : "warn",
      count: unknownCcy,
      icon: CircleHelp,
    },
    {
      id: "stale-clients",
      label: "Stale clients",
      description:
        stale === 0
          ? `${formatCarteraInteger(report.staleSummary.ok)} clientes al día.`
          : describeStale(report),
      status:
        stale === 0
          ? "ok"
          : report.staleSummary.critical > 0 || report.staleSummary.never_synced > 0
            ? "critical"
            : "warn",
      count: stale,
      icon: Clock,
    },
    {
      id: "bootstrap",
      label: "Bootstrap sync",
      description:
        bootstrapPending === 0
          ? `Bootstrap completo en ${formatCarteraInteger(report.syncStates.length)} flujo${report.syncStates.length === 1 ? "" : "s"}.`
          : `${formatCarteraInteger(bootstrapPending)} flujo${bootstrapPending === 1 ? "" : "s"} con bootstrap incompleto.`,
      status: bootstrapPending === 0 ? "ok" : "warn",
      count: bootstrapPending,
      icon: ServerCog,
    },
  ];

  // Pre-2026 check: visible cuando el período incluye fechas históricas (isPreSync)
  if (isPreSync) {
    result.push({
      id: "pre-2026",
      label: "Pre-2026 invoices",
      description:
        "Filtro MIN_FINANCIAL_DATE activo: facturas y recibos anteriores a 2026-01-01 excluidos a nivel de query en backend. No afectan totales ni consumen cuota.",
      status: "ok",
      icon: Hourglass,
    });
  }

  return result;
}

function describeStale(report: FinancialConsistencyReport): string {
  const s = report.staleSummary;
  const parts: string[] = [];
  if (s.warning > 0) parts.push(`${formatCarteraInteger(s.warning)} warning`);
  if (s.critical > 0) parts.push(`${formatCarteraInteger(s.critical)} critical`);
  if (s.never_synced > 0) parts.push(`${formatCarteraInteger(s.never_synced)} sin sync`);
  return parts.join(" · ") || "Clientes al día.";
}

const CHECK_ICON_CLASS: Record<CheckStatus, string> = {
  ok: "text-[var(--copilot-success-text)]",
  warn: "text-[var(--copilot-warning-text-strong)]",
  critical: "text-[var(--copilot-danger-text-strong)]",
  pending: "text-[var(--copilot-ink-muted)]",
};

const CHECK_BADGE_CLASS: Record<CheckStatus, string> = {
  ok: "border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]",
  warn: "border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)]",
  critical: "border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)]",
  pending:
    "border-dashed border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/60 text-[var(--copilot-ink-muted)]",
};

const CHECK_BADGE_LABEL: Record<CheckStatus, string> = {
  ok: "✓",
  warn: "⚠",
  critical: "⚠",
  pending: "···",
};

function StatusGlyph({ status }: { status: CheckStatus }) {
  const cls = CHECK_ICON_CLASS[status];
  if (status === "ok") return <CheckCircle2 className={`h-4 w-4 ${cls}`} aria-hidden />;
  if (status === "critical") return <XCircle className={`h-4 w-4 ${cls}`} aria-hidden />;
  if (status === "warn") return <AlertTriangle className={`h-4 w-4 ${cls}`} aria-hidden />;
  return <Activity className={`h-4 w-4 ${cls}`} aria-hidden />;
}

function ChecksList({ checks }: { checks: ReconCheck[] }) {
  const reduce = useReducedMotion();
  return (
    <motion.ul
      className="space-y-1.5"
      initial={reduce ? false : "hidden"}
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.04 } },
      }}
    >
      {checks.map((c) => (
        <CheckItem key={c.id} check={c} />
      ))}
    </motion.ul>
  );
}

function CheckItem({ check }: { check: ReconCheck }) {
  const Icon = check.icon;
  return (
    <motion.li
      variants={{
        hidden: { opacity: 0, x: 4 },
        visible: { opacity: 1, x: 0, transition: { duration: 0.2, ease: "easeOut" } },
      }}
      className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-3 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/55 px-3 py-2.5"
    >
      <span className="mt-0.5">
        <StatusGlyph status={check.status} />
      </span>
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium text-[var(--copilot-ink)]">
          <Icon className="h-3.5 w-3.5 text-[var(--copilot-ink-muted)]" aria-hidden />
          {check.label}
        </p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--copilot-ink-muted)]">
          {check.description}
        </p>
      </div>
      <span
        className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] tabular-nums ${CHECK_BADGE_CLASS[check.status]}`}
        aria-label={`status ${check.status}`}
      >
        {CHECK_BADGE_LABEL[check.status]}
        {check.count != null && check.count > 0 ? (
          <span className="ml-1">{formatCarteraInteger(check.count)}</span>
        ) : null}
      </span>
    </motion.li>
  );
}

// ---------------------------------------------------------------------------
// Helpers UI
// ---------------------------------------------------------------------------

function SubsectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--copilot-ink-muted)]">
        {title}
      </h4>
      <p className="mt-0.5 text-[12px] text-[var(--copilot-ink-muted)]/85">{subtitle}</p>
    </div>
  );
}

function EmptyRow({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/40 px-3 py-2.5 text-sm text-[var(--copilot-ink-muted)]">
      <Icon className="h-4 w-4" aria-hidden />
      {text}
    </div>
  );
}

function formatGeneratedAt(iso: string | null | undefined): string {
  if (!iso) return "sin timestamp";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "sin timestamp";
  const ageH = Math.max(0, (Date.now() - ms) / (1000 * 60 * 60));
  return formatRelativeAgeHours(ageH);
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function ReconciliationCenterSkeleton() {
  const reduce = useReducedMotion();
  return (
    <motion.section
      aria-hidden
      role="presentation"
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut", delay: reduce ? 0 : 0.08 }}
      className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card)]/85 shadow-[var(--copilot-shadow)]"
    >
      <header className="flex items-end justify-between gap-3 border-b border-[var(--copilot-border)] px-5 py-4">
        <div className="space-y-1.5">
          <SkBar className="h-3 w-44" />
          <SkBar className="h-2.5 w-64" />
        </div>
        <SkBar className="h-2.5 w-24" />
      </header>
      <div className="grid gap-px bg-[var(--copilot-border)]/70 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="space-y-5 bg-[var(--copilot-card)] p-5">
          <div className="space-y-2">
            <SkBar className="h-2.5 w-20" />
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/55 p-3"
                >
                  <SkBar className="h-2 w-14" />
                  <SkBar className="mt-2 h-5 w-16" />
                  <SkBar className="mt-1 h-2 w-20" />
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <SkBar className="h-2.5 w-24" />
            <div className="overflow-hidden rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/55">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--copilot-border)] px-4 py-2.5 last:border-b-0"
                >
                  <div className="h-2 w-2 rounded-full bg-[rgba(44,40,37,0.08)]" />
                  <div className="space-y-1.5">
                    <SkBar className="h-3 w-44" />
                    <SkBar className="h-2 w-32" />
                  </div>
                  <SkBar className="h-4 w-10 rounded-md" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-3 bg-[var(--copilot-card)] p-5">
          <SkBar className="h-2.5 w-16" />
          <div className="space-y-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-3 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/55 px-3 py-2.5"
              >
                <div className="mt-0.5 h-4 w-4 rounded-sm bg-[rgba(44,40,37,0.08)]" />
                <div className="space-y-1.5">
                  <SkBar className="h-3 w-32" />
                  <SkBar className="h-2 w-48" />
                </div>
                <SkBar className="h-4 w-10 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.section>
  );
}

function SkBar({ className = "" }: { className?: string }) {
  const reduce = useReducedMotion();
  return (
    <div className={`relative overflow-hidden rounded-md bg-[rgba(44,40,37,0.06)] ${className}`}>
      {reduce ? null : (
        <motion.div
          className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/55 to-transparent"
          animate={{ x: ["-100%", "100%"] }}
          transition={{ duration: 1.4, ease: "linear", repeat: Infinity }}
        />
      )}
    </div>
  );
}
