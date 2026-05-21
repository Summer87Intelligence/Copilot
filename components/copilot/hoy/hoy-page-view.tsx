"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Info,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  X,
  XCircle,
} from "lucide-react";

import { CopilotCard } from "@/components/copilot/copilot-ui";
import type { ClientPortfolioLoad } from "@/lib/copilot-clients-portfolio";
import type { FinancialSnapshotApiV1 } from "@/lib/copilot-financial-engine";
import type { CarteraCurrencyTotals } from "@/lib/copilot-cartera-aging-totals";
import {
  buildTodayBusinessPulse,
  type BusinessPulseGate,
  type KeyIndicator,
  type PendingItem,
  type PriorityCollection,
  type PulseStatus,
  type PulseTone,
  type RecommendedAction,
  type SummaryItem,
} from "@/lib/copilot-today-business-pulse";

// ─── Props ────────────────────────────────────────────────────────────────────

type HoyPageViewProps = {
  loading: boolean;
  snapshot: FinancialSnapshotApiV1 | null;
  portfolioRows: ClientPortfolioLoad["rows"] | null;
  gate: BusinessPulseGate;
  carteraAgingOverdue?: CarteraCurrencyTotals;
  carteraOpeningByCurrency?: CarteraCurrencyTotals;
  error: string | null;
  onRefresh: () => void;
};

// ─── Drawer state ─────────────────────────────────────────────────────────────

type DrawerContent = {
  title: string;
  body: string;
  deepLink: string;
  deepLinkLabel: string;
};

// ─── Status styles ────────────────────────────────────────────────────────────

type StatusStyle = { dot: string; bg: string; border: string; label: string; labelClass: string };

function statusStyle(s: PulseStatus): StatusStyle {
  if (s === "critical")
    return {
      dot: "bg-rose-500",
      bg: "bg-rose-50/60",
      border: "border-rose-200/70",
      label: "Crítico",
      labelClass: "text-rose-700",
    };
  if (s === "attention")
    return {
      dot: "bg-amber-400",
      bg: "bg-amber-50/60",
      border: "border-amber-200/70",
      label: "Requiere atención",
      labelClass: "text-amber-700",
    };
  return {
    dot: "bg-emerald-500",
    bg: "bg-emerald-50/40",
    border: "border-emerald-200/60",
    label: "Saludable",
    labelClass: "text-emerald-700",
  };
}

function toneClass(t: PulseTone): string {
  if (t === "ok") return "text-emerald-700";
  if (t === "warning") return "text-amber-700";
  if (t === "critical") return "text-rose-700";
  return "text-[var(--copilot-ink)]";
}

function toneBorderBg(t: PulseTone): string {
  if (t === "critical") return "border-rose-200/70 bg-rose-50/50";
  if (t === "warning") return "border-amber-200/70 bg-white/60";
  if (t === "ok") return "border-emerald-200/70 bg-white/60";
  return "border-[var(--copilot-border)] bg-[var(--copilot-card)]";
}

function urgencyBadge(u: PendingItem["urgency"]) {
  if (u === "alta")
    return (
      <span className="inline-flex items-center rounded-md bg-rose-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-rose-700">
        Urgente
      </span>
    );
  if (u === "media")
    return (
      <span className="inline-flex items-center rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700">
        Esta semana
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-600">
      Cuando puedas
    </span>
  );
}

function riskBadge(r: "Bajo" | "Medio" | "Alto") {
  if (r === "Alto")
    return <span className="inline-flex rounded-md bg-rose-100 px-1.5 py-0.5 text-[9px] font-semibold text-rose-700">Alto</span>;
  if (r === "Medio")
    return <span className="inline-flex rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">Medio</span>;
  return <span className="inline-flex rounded-md bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">Bajo</span>;
}

function trendIcon(t: "up" | "down" | "neutral") {
  if (t === "up") return <TrendingUp className="h-3.5 w-3.5 text-emerald-500" aria-hidden />;
  if (t === "down") return <TrendingDown className="h-3.5 w-3.5 text-rose-500" aria-hidden />;
  return null;
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-[rgba(44,40,37,0.07)] ${className}`} />;
}

function LoadingSkeleton() {
  return (
    <div className="flex-1 space-y-5 overflow-auto px-6 py-6">
      <Skeleton className="h-32 w-full" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-52 w-full" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
      </div>
    </div>
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────────────

function Drawer({ content, onClose }: { content: DrawerContent | null; onClose: () => void }) {
  useEffect(() => {
    if (!content) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [content, onClose]);

  return (
    <>
      {/* Overlay */}
      {content ? (
        <div
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[1px]"
          onClick={onClose}
          aria-hidden
        />
      ) : null}

      {/* Panel */}
      <aside
        className={`fixed inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col border-l border-[var(--copilot-border)] bg-white shadow-2xl transition-transform duration-300 ease-out ${
          content ? "translate-x-0" : "translate-x-full"
        }`}
        aria-label="Detalle del indicador"
      >
        {content ? (
          <>
            <div className="flex items-center justify-between border-b border-[var(--copilot-border)] px-5 py-4">
              <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">{content.title}</h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1 text-[var(--copilot-ink-muted)] hover:bg-[rgba(44,40,37,0.06)]"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto px-5 py-5">
              <p className="text-sm leading-relaxed text-[var(--copilot-ink-muted)]">{content.body}</p>
            </div>
            <div className="border-t border-[var(--copilot-border)] px-5 py-4">
              <Link
                href={content.deepLink}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--copilot-accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
              >
                {content.deepLinkLabel}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </>
        ) : null}
      </aside>
    </>
  );
}

// ─── Hero section ─────────────────────────────────────────────────────────────

function PulseHero({
  status,
  headline,
  bullets,
  dataWarning,
  onRefresh,
}: {
  status: PulseStatus;
  headline: string;
  bullets: string[];
  dataWarning: string | null;
  onRefresh: () => void;
}) {
  const s = statusStyle(status);
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${s.bg} ${s.border}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`mt-0.5 h-3 w-3 shrink-0 rounded-full shadow-sm ring-4 ring-white/60 ${s.dot}`} aria-hidden />
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wide ${s.labelClass}`}>{s.label}</p>
            <h1 className="mt-0.5 text-base font-semibold leading-snug text-[var(--copilot-ink)] sm:text-lg">
              {headline}
            </h1>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          title="Actualizar datos"
          className="flex items-center gap-1.5 rounded-xl border border-[var(--copilot-border)] bg-white/60 px-3 py-1.5 text-xs font-medium text-[var(--copilot-ink-muted)] shadow-sm transition hover:bg-white"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Actualizar
        </button>
      </div>

      {bullets.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-center gap-1.5 text-xs text-[var(--copilot-ink-muted)]">
              <span className="h-1 w-1 rounded-full bg-[var(--copilot-ink-muted)]/40" aria-hidden />
              {b}
            </li>
          ))}
        </ul>
      ) : null}

      {dataWarning ? (
        <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {dataWarning}
        </div>
      ) : null}
    </div>
  );
}

// ─── Indicator card ───────────────────────────────────────────────────────────

function IndicatorCard({
  indicator,
  onClick,
}: {
  indicator: KeyIndicator;
  onClick: (ind: KeyIndicator) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(indicator)}
      className={`group flex w-full flex-col gap-1.5 rounded-2xl border p-4 text-left shadow-sm transition hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--copilot-accent)] ${toneBorderBg(indicator.tone)}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        {indicator.label}
      </p>
      {indicator.currencyValues && indicator.currencyValues.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          {indicator.currencyValues.map((m) => (
            <p key={m.currency} className={`text-base font-bold tabular-nums leading-tight ${toneClass(indicator.tone)}`}>
              {m.formatted}
            </p>
          ))}
        </div>
      ) : (
        <p className={`text-xl font-bold tabular-nums leading-tight ${toneClass(indicator.tone)}`}>
          {indicator.value}
        </p>
      )}
      {indicator.subValue ? (
        <p className="text-[11px] text-[var(--copilot-ink-muted)]">{indicator.subValue}</p>
      ) : null}
      <p className="mt-auto text-[11px] text-[var(--copilot-ink-muted)] opacity-80">{indicator.helperText}</p>
      <span className="mt-1 flex items-center gap-1 text-[10px] font-medium text-[var(--copilot-accent)] opacity-0 transition-opacity group-hover:opacity-100">
        Ver detalle <ChevronRight className="h-3 w-3" aria-hidden />
      </span>
    </button>
  );
}

// ─── Priority collections ─────────────────────────────────────────────────────

function CollectionsSection({
  collections,
  onClientClick,
}: {
  collections: PriorityCollection[];
  onClientClick: (c: PriorityCollection) => void;
}) {
  if (collections.length === 0) {
    return (
      <CopilotCard>
        <div className="flex items-center gap-2 text-sm text-[var(--copilot-ink-muted)]">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" aria-hidden />
          No hay clientes con deuda pendiente — todo al día.
        </div>
      </CopilotCard>
    );
  }

  return (
    <CopilotCard className="overflow-hidden p-0">
      <div className="border-b border-[var(--copilot-border)] px-5 py-4">
        <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">Cobranza prioritaria</h2>
        <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
          Clientes con mayor deuda o vencimiento — hacer foco acá.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--copilot-border)] text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              <th className="px-5 py-3">Cliente</th>
              <th className="px-5 py-3">Deuda</th>
              <th className="px-5 py-3">Vencido</th>
              <th className="px-5 py-3">Comportamiento</th>
              <th className="px-5 py-3">Acción sugerida</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--copilot-border)]">
            {collections.map((c) => (
              <tr
                key={c.company_id}
                className="cursor-pointer transition hover:bg-[rgba(44,40,37,0.03)]"
                onClick={() => onClientClick(c)}
              >
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--copilot-accent-soft)] text-xs font-bold text-[var(--copilot-accent)]">
                      {c.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="font-medium text-[var(--copilot-ink)]">{c.name}</span>
                  </div>
                </td>
                <td className="px-5 py-3 tabular-nums text-[var(--copilot-ink)]">
                  {c.deuda_breakdown.length > 0 ? (
                    <div className="flex flex-col gap-0.5">
                      {c.deuda_breakdown.map((m) => (
                        <span key={m.currency} className="text-xs">{m.formatted}</span>
                      ))}
                    </div>
                  ) : <span className="text-[var(--copilot-ink-muted)]">—</span>}
                </td>
                <td className="px-5 py-3 tabular-nums">
                  {c.vencido_breakdown.length > 0 ? (
                    <div className="flex flex-col gap-0.5">
                      {c.vencido_breakdown.map((m) => (
                        <span key={m.currency} className="text-xs font-semibold text-rose-700">{m.formatted}</span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-emerald-600">Al día</span>
                  )}
                </td>
                <td className="px-5 py-3">{riskBadge(c.riesgo)}</td>
                <td className="px-5 py-3">
                  <span className="text-xs text-[var(--copilot-ink-muted)]">{c.accion}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CopilotCard>
  );
}

// ─── 30 days summary ──────────────────────────────────────────────────────────

function SummaryGrid({ items }: { items: SummaryItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-[var(--copilot-ink-muted)]">
        <Info className="h-4 w-4 shrink-0" aria-hidden />
        Sin datos del período para mostrar.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-1 rounded-xl border border-[var(--copilot-border)] bg-white/50 px-4 py-3">
          <div className="flex items-center gap-1.5">
            {trendIcon(item.trend)}
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              {item.label}
            </p>
          </div>
          <p className="text-lg font-bold tabular-nums text-[var(--copilot-ink)]">{item.value}</p>
          <p className="text-[11px] text-[var(--copilot-ink-muted)]">{item.description}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Pending items ────────────────────────────────────────────────────────────

function PendingList({ items, onItemClick }: { items: PendingItem[]; onItemClick: (item: PendingItem) => void }) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-[var(--copilot-ink-muted)]">
        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" aria-hidden />
        Sin pendientes importantes por ahora.
      </div>
    );
  }
  return (
    <ol className="space-y-2.5">
      {items.map((item) => (
        <li
          key={item.id}
          className="group flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--copilot-border)] bg-white/50 px-4 py-3 transition hover:bg-white hover:shadow-sm"
          onClick={() => onItemClick(item)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter") onItemClick(item); }}
        >
          <div className="mt-0.5 shrink-0">{urgencyBadge(item.urgency)}</div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[var(--copilot-ink)]">{item.title}</p>
            <p className="text-xs text-[var(--copilot-ink-muted)]">
              <span className="font-medium">{item.impacto}</span> · {item.accion}
            </p>
          </div>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--copilot-ink-muted)] opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
        </li>
      ))}
    </ol>
  );
}

// ─── Recommended actions bar ──────────────────────────────────────────────────

function ActionsBar({ actions }: { actions: RecommendedAction[] }) {
  if (actions.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((a) => (
        <Link
          key={a.id}
          href={a.deepLink}
          className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold shadow-sm transition hover:shadow-md ${
            a.tone === "critical"
              ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
              : a.tone === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                : "border-[var(--copilot-border)] bg-white/70 text-[var(--copilot-ink)] hover:bg-white"
          }`}
        >
          {a.label}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      ))}
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function HoyPageView({
  loading,
  snapshot,
  portfolioRows,
  gate,
  carteraAgingOverdue,
  carteraOpeningByCurrency,
  error,
  onRefresh,
}: HoyPageViewProps) {
  const [drawer, setDrawer] = useState<DrawerContent | null>(null);

  const pulse = useMemo(
    () =>
      buildTodayBusinessPulse({
        snapshot,
        portfolioRows: portfolioRows ?? [],
        gate,
        carteraAgingOverdue,
        carteraOpeningByCurrency,
      }),
    [snapshot, portfolioRows, gate, carteraAgingOverdue, carteraOpeningByCurrency]
  );

  function openIndicatorDrawer(ind: KeyIndicator) {
    setDrawer({
      title: ind.detailTitle,
      body: ind.detailBody,
      deepLink: ind.deepLink,
      deepLinkLabel: ind.id === "data_status"
        ? "Ver estado operacional"
        : ind.id === "clients"
          ? "Ver todos los clientes"
          : "Ver estado financiero",
    });
  }

  function openClientDrawer(c: PriorityCollection) {
    const deudaStr = c.deuda_breakdown.length > 0
      ? c.deuda_breakdown.map((m) => m.formatted).join(" · ")
      : `$ ${c.deuda.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
    const vencidoStr = c.vencido_breakdown.length > 0
      ? c.vencido_breakdown.map((m) => m.formatted).join(" · ")
      : c.vencido > 0
        ? `$ ${c.vencido.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`
        : null;
    setDrawer({
      title: c.name,
      body: [
        `Deuda total: ${deudaStr}`,
        vencidoStr ? `Deuda vencida: ${vencidoStr}` : "Sin deuda vencida.",
        `Comportamiento de cobro: ${c.riesgo === "Alto" ? "Lento — requiere seguimiento especial" : c.riesgo === "Medio" ? "Moderado" : "Puntual"}`,
        `Acción sugerida: ${c.accion}`,
      ].join("\n\n"),
      deepLink: c.deepLink,
      deepLinkLabel: "Abrir ficha del cliente",
    });
  }

  function openPendingDrawer(item: PendingItem) {
    setDrawer({
      title: item.title,
      body: `Impacto: ${item.impacto}\n\nQué hacer: ${item.accion}`,
      deepLink: item.deepLink,
      deepLinkLabel: item.deepLink.includes("clientes") ? "Abrir ficha del cliente" : "Ver más detalles",
    });
  }

  if (loading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="flex-1 px-6 py-6">
        <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-950">
          <XCircle className="h-4 w-4 shrink-0 text-rose-500" aria-hidden />
          {error}
          <button
            type="button"
            onClick={onRefresh}
            className="ml-auto flex items-center gap-1 rounded-lg border border-rose-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-white"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 space-y-5 overflow-auto px-6 py-6">

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <PulseHero
          status={pulse.overallStatus}
          headline={pulse.headline}
          bullets={pulse.summaryBullets}
          dataWarning={pulse.dataWarning}
          onRefresh={onRefresh}
        />

        {/* ── 6 indicator cards ────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {pulse.keyIndicators.map((ind) => (
            <IndicatorCard key={ind.id} indicator={ind} onClick={openIndicatorDrawer} />
          ))}
        </div>

        {/* ── Priority collections ──────────────────────────────────────── */}
        <CollectionsSection collections={pulse.priorityCollections} onClientClick={openClientDrawer} />

        {/* ── Bottom grid: 30 days + pending ───────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-2">
          <CopilotCard>
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">Situación financiera</h2>
              <p className="mt-0.5 text-[11px] text-[var(--copilot-ink-muted)]">
                Saldos al día de hoy · Netos acumulados desde el inicio
              </p>
            </div>
            <SummaryGrid items={pulse.last30DaysSummary} />
          </CopilotCard>

          <CopilotCard>
            <h2 className="mb-3 text-sm font-semibold text-[var(--copilot-ink)]">
              Pendientes importantes
            </h2>
            <PendingList items={pulse.importantPendingItems} onItemClick={openPendingDrawer} />
          </CopilotCard>
        </div>

        {/* ── Recommended actions ──────────────────────────────────────── */}
        {pulse.recommendedActions.length > 0 ? (
          <div className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card)] px-5 py-4 shadow-sm">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Acciones recomendadas
            </h2>
            <ActionsBar actions={pulse.recommendedActions} />
          </div>
        ) : null}

      </div>

      <Drawer content={drawer} onClose={() => setDrawer(null)} />
    </>
  );
}
