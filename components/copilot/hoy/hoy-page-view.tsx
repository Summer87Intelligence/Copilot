"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw, XCircle } from "lucide-react";

import { CopilotCard } from "@/components/copilot/copilot-ui";
import type { ClientPortfolioLoad } from "@/lib/copilot-clients-portfolio";
import type { FinancialSnapshotApiV1 } from "@/lib/copilot-financial-engine";
import type { CarteraCurrencyTotals } from "@/lib/copilot-cartera-aging-totals";
import {
  buildTodayBusinessPulse,
  type AttentionClientsSummary,
  type BusinessPulseGate,
  type CarteraPeriodMetrics,
  type DebtorCollectionRow,
  type PendingItem,
} from "@/lib/copilot-today-business-pulse";

import { AttentionClientsDrawer } from "./hoy-attention-clients-drawer";
import { CurrencyExecutiveCard } from "./hoy-currency-executive-card";
import { HoyDrawer } from "./hoy-drawer";
import { HOY_COPY } from "@/lib/copilot-hoy-ui-contract";
import { AttentionFollowUpStrip, PulseHero } from "./hoy-pulse-hero";
import { DebtorsReviewTable } from "./hoy-priority-collections-table";

// ─── Props ────────────────────────────────────────────────────────────────────

type HoyPageViewProps = {
  loading: boolean;
  snapshot: FinancialSnapshotApiV1 | null;
  portfolioRows: ClientPortfolioLoad["rows"] | null;
  gate: BusinessPulseGate;
  carteraAgingOverdue?: CarteraCurrencyTotals;
  carteraAgingCurrent?: CarteraCurrencyTotals;
  carteraOpeningByCurrency?: CarteraCurrencyTotals;
  carteraPeriodMetrics?: CarteraPeriodMetrics;
  error: string | null;
  onRefresh: () => void;
};

type DrawerState =
  | { kind: "closed" }
  | { kind: "attention"; data: AttentionClientsSummary }
  | { kind: "debtors"; rows: DebtorCollectionRow[] }
  | { kind: "client"; row: DebtorCollectionRow }
  | { kind: "pending"; item: PendingItem };

type DebtorFilter = "all" | "UYU" | "USD" | "overdue" | "critical30" | "slow";

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-[rgba(44,40,37,0.07)] ${className}`} />;
}

function LoadingSkeleton() {
  return (
    <div className="flex-1 space-y-5 overflow-auto px-6 py-6">
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

function urgencyBadge(u: PendingItem["urgency"]) {
  if (u === "alta")
    return (
      <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-rose-700">
        Urgente
      </span>
    );
  if (u === "media")
    return (
      <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-700">
        Esta semana
      </span>
    );
  return (
    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-slate-600">
      Cuando puedas
    </span>
  );
}

function DebtorsDrawer({
  rows,
  debtorClients,
  onClose,
  onOpenClient,
}: {
  rows: DebtorCollectionRow[];
  debtorClients: number;
  onClose: () => void;
  onOpenClient: (row: DebtorCollectionRow) => void;
}) {
  const [filter, setFilter] = useState<DebtorFilter>("all");

  const totals = useMemo(() => {
    let pendingUyu = 0;
    let pendingUsd = 0;
    let vencidoUyu = 0;
    let vencidoUsd = 0;
    for (const r of rows) {
      if (r.currency === "UYU") {
        pendingUyu += r.deuda.amount;
        vencidoUyu += r.vencido?.amount ?? 0;
      } else {
        pendingUsd += r.deuda.amount;
        vencidoUsd += r.vencido?.amount ?? 0;
      }
    }
    return { pendingUyu, pendingUsd, vencidoUyu, vencidoUsd };
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === "UYU") return r.currency === "UYU";
      if (filter === "USD") return r.currency === "USD";
      if (filter === "overdue") return r.flags.hasOverdue;
      if (filter === "critical30") return r.flags.critical30Share;
      if (filter === "slow") return r.flags.slowCollection;
      return true;
    });
  }, [rows, filter]);

  const filters: { id: DebtorFilter; label: string }[] = [
    { id: "all", label: "Todos" },
    { id: "UYU", label: "UYU" },
    { id: "USD", label: "USD" },
    { id: "overdue", label: "Vencidos" },
    { id: "critical30", label: "+30 días" },
    { id: "slow", label: "Cobro lento" },
  ];

  return (
    <HoyDrawer
      title="Todos los deudores"
      onClose={onClose}
      footer={
        <Link
          href="/copilot/cartera"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--copilot-accent)] px-4 py-2.5 text-sm font-semibold text-white"
        >
          Ver cartera completa
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      }
    >
      <p className="mb-2 text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
        Clientes con saldo pendiente, separados por moneda. {debtorClients}{" "}
        {debtorClients === 1 ? "cliente" : "clientes"} · {rows.length} filas · {filtered.length}{" "}
        visibles con el filtro.
      </p>
      <div className="mb-4 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg border border-[var(--copilot-border)] px-2.5 py-2">
          <span className="text-[var(--copilot-ink-muted)]">Por cobrar UYU </span>
          <span className="font-semibold text-amber-800">
            {totals.pendingUyu > 0
              ? `UYU $ ${totals.pendingUyu.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`
              : "—"}
          </span>
        </div>
        <div className="rounded-lg border border-[var(--copilot-border)] px-2.5 py-2">
          <span className="text-[var(--copilot-ink-muted)]">Por cobrar USD </span>
          <span className="font-semibold text-amber-800">
            {totals.pendingUsd > 0
              ? `USD U$S ${totals.pendingUsd.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`
              : "—"}
          </span>
        </div>
        <div className="rounded-lg border border-rose-100/80 bg-rose-50/30 px-2.5 py-2">
          <span className="text-[var(--copilot-ink-muted)]">Vencido UYU </span>
          <span className="font-semibold text-rose-800">
            {totals.vencidoUyu > 0
              ? `UYU $ ${totals.vencidoUyu.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`
              : "—"}
          </span>
        </div>
        <div className="rounded-lg border border-rose-100/80 bg-rose-50/30 px-2.5 py-2">
          <span className="text-[var(--copilot-ink-muted)]">Vencido USD </span>
          <span className="font-semibold text-rose-800">
            {totals.vencidoUsd > 0
              ? `USD U$S ${totals.vencidoUsd.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`
              : "—"}
          </span>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition ${
              filter === f.id
                ? "bg-[var(--copilot-accent)] text-white"
                : "border border-[var(--copilot-border)] bg-white text-[var(--copilot-ink-muted)]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <ul className="space-y-2">
        {filtered.map((row) => (
          <li
            key={row.row_id}
            className="cursor-pointer rounded-xl border border-[var(--copilot-border)] px-3 py-2.5 hover:bg-[rgba(44,40,37,0.03)]"
            onClick={() => onOpenClient(row)}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-[var(--copilot-ink)]">{row.name}</span>
              <span className="text-[10px] font-semibold text-[var(--copilot-ink-muted)]">{row.currency}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums">
              <span className="text-amber-700">Por cobrar {row.deuda.formatted}</span>
              {row.vencido ? (
                <span className="font-semibold text-rose-700">Vencido {row.vencido.formatted}</span>
              ) : (
                <span className="text-emerald-700">Al día</span>
              )}
            </div>
            <p className="mt-1 text-[10px] font-medium text-amber-800">{row.motivo}</p>
            <p className="mt-0.5 text-[11px] text-[var(--copilot-ink-muted)]">
              {row.antiguedad} · {row.accion}
            </p>
          </li>
        ))}
      </ul>
    </HoyDrawer>
  );
}

function PendingList({
  items,
  onItemClick,
}: {
  items: PendingItem[];
  onItemClick: (item: PendingItem) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--copilot-ink-muted)]">Sin pendientes importantes por ahora.</p>
    );
  }
  return (
    <ol className="space-y-2">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--copilot-border)] bg-white px-4 py-3 hover:bg-[rgba(44,40,37,0.03)]"
          onClick={() => onItemClick(item)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter") onItemClick(item);
          }}
        >
          {urgencyBadge(item.urgency)}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[var(--copilot-ink)]">{item.title}</p>
            <p className="text-xs text-[var(--copilot-ink-muted)]">{item.accion}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function HoyPageView({
  loading,
  snapshot,
  portfolioRows,
  gate,
  carteraAgingOverdue,
  carteraAgingCurrent,
  carteraOpeningByCurrency,
  carteraPeriodMetrics,
  error,
  onRefresh,
}: HoyPageViewProps) {
  const [drawer, setDrawer] = useState<DrawerState>({ kind: "closed" });

  const pulse = useMemo(
    () =>
      buildTodayBusinessPulse({
        snapshot,
        portfolioRows: portfolioRows ?? [],
        gate,
        carteraAgingOverdue,
        carteraAgingCurrent,
        carteraOpeningByCurrency,
        carteraPeriodMetrics,
      }),
    [
      snapshot,
      portfolioRows,
      gate,
      carteraAgingOverdue,
      carteraAgingCurrent,
      carteraOpeningByCurrency,
      carteraPeriodMetrics,
    ]
  );

  const topDebtorRows = useMemo(() => pulse.allDebtorRows.slice(0, 8), [pulse.allDebtorRows]);
  const pendingTop = useMemo(() => pulse.importantPendingItems.slice(0, 3), [pulse.importantPendingItems]);

  const dataNotice = pulse.dataWarning ?? null;

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
            className="ml-auto flex items-center gap-1 rounded-lg border border-rose-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-rose-700"
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
        <PulseHero
          status={pulse.overallStatus}
          headline={pulse.headline}
          subline={pulse.heroSubline}
          dataNotice={dataNotice}
          onRefresh={onRefresh}
        />

        {pulse.currencyBlocks.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {pulse.currencyBlocks.map((block) => (
              <CurrencyExecutiveCard key={block.currency} block={block} />
            ))}
          </div>
        ) : (
          <CopilotCard>
            <p className="text-sm text-[var(--copilot-ink-muted)]">
              Sin actividad financiera por moneda para mostrar.
            </p>
          </CopilotCard>
        )}

        {pulse.attentionClients.total > 0 ? (
          <AttentionFollowUpStrip
            count={pulse.attentionClients.total}
            onClick={() => setDrawer({ kind: "attention", data: pulse.attentionClients })}
          />
        ) : null}

        <CopilotCard>
          <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">
            {HOY_COPY.debtorsSectionTitle}
          </h2>
          <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
            Clientes con saldo pendiente, ordenados por vencimiento y monto.
          </p>
          <div className="mt-4">
            <DebtorsReviewTable
              rows={topDebtorRows}
              allRows={pulse.allDebtorRows}
              counts={pulse.clientCounts}
              onViewAll={() => setDrawer({ kind: "debtors", rows: pulse.allDebtorRows })}
              onRowClick={(row) => setDrawer({ kind: "client", row })}
            />
          </div>
        </CopilotCard>

        <CopilotCard>
          <h2 className="mb-3 text-sm font-semibold text-[var(--copilot-ink)]">
            {HOY_COPY.pendingSectionTitle}
          </h2>
          <PendingList
            items={pendingTop}
            onItemClick={(item) => setDrawer({ kind: "pending", item })}
          />
        </CopilotCard>
      </div>

      {drawer.kind === "attention" ? (
        <AttentionClientsDrawer
          data={drawer.data}
          onClose={() => setDrawer({ kind: "closed" })}
          onViewAllDebtors={() =>
            setDrawer({ kind: "debtors", rows: pulse.allDebtorRows })
          }
        />
      ) : null}
      {drawer.kind === "debtors" ? (
        <DebtorsDrawer
          rows={drawer.rows}
          debtorClients={pulse.clientCounts.debtorClients}
          onClose={() => setDrawer({ kind: "closed" })}
          onOpenClient={(row) => setDrawer({ kind: "client", row })}
        />
      ) : null}
      {drawer.kind === "client" ? (
        <HoyDrawer
          title={drawer.row.name}
          onClose={() => setDrawer({ kind: "closed" })}
          footer={
            <Link
              href={drawer.row.deepLink}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--copilot-accent)] px-4 py-2.5 text-sm font-semibold text-white"
            >
              Abrir ficha 360
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          }
        >
          <div className="space-y-3 text-sm">
            <p>
              <span className="text-[var(--copilot-ink-muted)]">Moneda:</span> {drawer.row.currency}
            </p>
            <p>
              <span className="text-[var(--copilot-ink-muted)]">Por cobrar:</span>{" "}
              <span className="font-semibold text-amber-700">{drawer.row.deuda.formatted}</span>
            </p>
            <p>
              <span className="text-[var(--copilot-ink-muted)]">Vencido:</span>{" "}
              {drawer.row.vencido ? (
                <span className="font-semibold text-rose-700">{drawer.row.vencido.formatted}</span>
              ) : (
                <span className="font-semibold text-emerald-700">Al día</span>
              )}
            </p>
            <p>
              <span className="text-[var(--copilot-ink-muted)]">Antigüedad:</span> {drawer.row.antiguedad}
            </p>
            <p>
              <span className="text-[var(--copilot-ink-muted)]">Motivo:</span> {drawer.row.motivo}
            </p>
            <p>
              <span className="text-[var(--copilot-ink-muted)]">Acción:</span> {drawer.row.accion}
            </p>
          </div>
        </HoyDrawer>
      ) : null}
      {drawer.kind === "pending" ? (
        <HoyDrawer
          title={drawer.item.title}
          onClose={() => setDrawer({ kind: "closed" })}
          footer={
            <Link
              href={drawer.item.deepLink}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--copilot-accent)] px-4 py-2.5 text-sm font-semibold text-white"
            >
              Ver detalle
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          }
        >
          <p className="text-sm text-[var(--copilot-ink-muted)]">
            <strong>Impacto:</strong> {drawer.item.impacto}
          </p>
          <p className="mt-3 text-sm text-[var(--copilot-ink-muted)]">
            <strong>Qué hacer:</strong> {drawer.item.accion}
          </p>
        </HoyDrawer>
      ) : null}
    </>
  );
}
