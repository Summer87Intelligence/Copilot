"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, UserCheck } from "lucide-react";

import type { CobranzaClientRow, OwnershipEntry } from "@/lib/copilot-cobranza-summary";
import {
  applyResponsableFilter,
  type ResponsableFilter,
} from "@/lib/cobranza/cobranza-ownership";
import { useDisplayCurrency } from "@/components/copilot/display-currency-provider";
import { convertToUsdEquivalent, formatUsdEquivalent } from "@/lib/currency-display-mode";
import { formatMoneyCurrency } from "@/lib/copilot-format-money";
import {
  COLLECTION_STATUS_LABELS,
  COLLECTION_ACTION_TYPE_LABELS,
} from "@/lib/copilot-collection-types";
import {
  actionCardClass,
  copilotMetricLabelClass,
  metricValueClass,
} from "@/components/copilot/ui/copilot-visual-system";
import { AsignarResponsableModal } from "./asignar-responsable-modal";

// ── Types ────────────────────────────────────────────────────────────────────

type ClientFilter = "all" | "withDebt" | "overdue" | "noAction";

type AssignModalState = {
  companyId: string;
  companyName: string;
  currentOwnerUserId: string | null;
};

type Toast = { message: string; ok: boolean };

// ── Helpers ──────────────────────────────────────────────────────────────────

const FILTER_LABELS: { id: ClientFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "withDebt", label: "Con deuda" },
  { id: "overdue", label: "Atrasados" },
  { id: "noAction", label: "Sin gestión" },
];

const RESP_FILTER_LABELS: { id: ResponsableFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "me", label: "Mis clientes" },
  { id: "unassigned", label: "Sin asignar" },
];

function applyClientFilter(rows: CobranzaClientRow[], filter: ClientFilter): CobranzaClientRow[] {
  switch (filter) {
    case "withDebt":
      return rows.filter((r) => r.hasDebt);
    case "overdue":
      return rows.filter((r) => r.isOverdue);
    case "noAction":
      return rows.filter((r) => r.hasDebt && !r.hasActiveAction);
    default:
      return rows;
  }
}

function formatClientDebt(
  debtUyu: number,
  debtUsd: number,
  mode: "native" | "usd_equivalent",
  fxRate: number
): string {
  if (mode === "usd_equivalent") {
    const total = convertToUsdEquivalent({ uyu: debtUyu, usd: debtUsd }, fxRate);
    return formatUsdEquivalent(total);
  }
  const parts: string[] = [];
  if (debtUyu > 0) parts.push(formatMoneyCurrency(debtUyu, "UYU"));
  if (debtUsd > 0) parts.push(formatMoneyCurrency(debtUsd, "USD"));
  return parts.join(" · ") || "—";
}

function canAssign(role: string | null | undefined): boolean {
  if (!role) return false;
  const r = role.toLowerCase();
  return r === "superadmin" || r === "cobranza";
}

function responsableLabel(row: CobranzaClientRow): string {
  return row.assignedUserName ?? row.assignedUserEmail ?? "Sin asignar";
}

// ── Sub-components ───────────────────────────────────────────────────────────

function OverdueDaysBadge({ days }: { days: number | null }) {
  if (days == null || days <= 0) return null;
  const cls =
    days > 60
      ? "bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)] border-[var(--copilot-danger-border)]"
      : days > 30
        ? "bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)] border-[var(--copilot-warning-border)]"
        : "bg-[var(--copilot-tone-neutral-bg)] text-[var(--copilot-ink-muted)] border-[var(--copilot-border)]";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {days}d atraso
    </span>
  );
}

function ClientMobileCard({
  row,
  mode,
  fxRate,
  canWrite,
  onAssign,
}: {
  row: CobranzaClientRow;
  mode: "native" | "usd_equivalent";
  fxRate: number;
  canWrite: boolean;
  onAssign: (state: AssignModalState) => void;
}) {
  const debtLabel = formatClientDebt(row.debtUyu, row.debtUsd, mode, fxRate);
  const overdueLabel = formatClientDebt(row.overdueUyu, row.overdueUsd, mode, fxRate);
  const maxOverdueDays = Math.max(row.overdueDaysUyu ?? 0, row.overdueDaysUsd ?? 0) || null;

  return (
    <div className={`${actionCardClass} px-4 py-3.5`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--copilot-ink)] leading-tight">
          {row.name}
        </p>
        {row.isOverdue ? (
          <OverdueDaysBadge days={maxOverdueDays} />
        ) : row.hasDebt ? (
          <span className="rounded-full border border-[var(--copilot-border)] bg-[var(--copilot-tone-neutral-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--copilot-ink-muted)]">
            Al día
          </span>
        ) : null}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        <div>
          <p className={`${copilotMetricLabelClass} text-[9px]`}>Pendiente</p>
          <p className={`${metricValueClass} text-sm`}>{debtLabel}</p>
        </div>
        {row.isOverdue ? (
          <div>
            <p className={`${copilotMetricLabelClass} text-[9px]`}>Vencido</p>
            <p className={`${metricValueClass} text-sm text-[var(--copilot-danger-text-strong)]`}>
              {overdueLabel}
            </p>
          </div>
        ) : null}
      </div>

      {row.activePromise ? (
        <p className="mt-1.5 text-[11px] text-[var(--copilot-ink-muted)]">
          Promesa de pago:{" "}
          <span className="font-medium text-[var(--copilot-ink)]">{row.activePromise.date}</span>
        </p>
      ) : row.latestActionStatus ? (
        <p className="mt-1.5 text-[11px] text-[var(--copilot-ink-muted)]">
          Último estado:{" "}
          <span className="font-medium text-[var(--copilot-ink)]">
            {COLLECTION_STATUS_LABELS[row.latestActionStatus as keyof typeof COLLECTION_STATUS_LABELS] ??
              row.latestActionStatus}
          </span>
          {row.latestActionType ? (
            <span>
              {" "}·{" "}
              {COLLECTION_ACTION_TYPE_LABELS[
                row.latestActionType as keyof typeof COLLECTION_ACTION_TYPE_LABELS
              ] ?? row.latestActionType}
            </span>
          ) : null}
        </p>
      ) : (
        <p className="mt-1.5 text-[11px] text-[var(--copilot-ink-muted)]">Sin gestión registrada</p>
      )}

      <p className="mt-1 text-[11px] text-[var(--copilot-ink-muted)]">
        Responsable:{" "}
        <span
          className={
            row.assignedUserName || row.assignedUserEmail
              ? "font-medium text-[var(--copilot-ink)]"
              : "italic"
          }
        >
          {responsableLabel(row)}
        </span>
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={`/copilot/clientes/${row.companyId}`}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[var(--copilot-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
        >
          Ver cliente
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
        <Link
          href={`/copilot/clientes/${row.companyId}#gestion-cobranza`}
          className="inline-flex shrink-0 items-center rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-2.5 py-1.5 text-xs font-medium text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-panel-bg)]"
        >
          Gestionar
        </Link>
        {canWrite ? (
          <button
            type="button"
            onClick={() =>
              onAssign({
                companyId: row.companyId,
                companyName: row.name,
                currentOwnerUserId: row.assignedUserId,
              })
            }
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-2.5 py-1.5 text-xs font-medium text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-panel-bg)]"
          >
            <UserCheck className="h-3.5 w-3.5" aria-hidden />
            Asignar
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ClientDesktopRow({
  row,
  mode,
  fxRate,
  canWrite,
  onAssign,
}: {
  row: CobranzaClientRow;
  mode: "native" | "usd_equivalent";
  fxRate: number;
  canWrite: boolean;
  onAssign: (state: AssignModalState) => void;
}) {
  const debtLabel = formatClientDebt(row.debtUyu, row.debtUsd, mode, fxRate);
  const overdueLabel = row.isOverdue
    ? formatClientDebt(row.overdueUyu, row.overdueUsd, mode, fxRate)
    : "—";
  const maxOverdueDays = Math.max(row.overdueDaysUyu ?? 0, row.overdueDaysUsd ?? 0) || null;

  const statusLabel = row.latestActionStatus
    ? (COLLECTION_STATUS_LABELS[
        row.latestActionStatus as keyof typeof COLLECTION_STATUS_LABELS
      ] ?? row.latestActionStatus)
    : "Sin gestión";

  return (
    <tr className="border-t border-[var(--copilot-border)] text-sm text-[var(--copilot-ink)]">
      <td className="py-2.5 pl-4 pr-3 font-medium">
        <Link
          href={`/copilot/clientes/${row.companyId}`}
          className="hover:text-[var(--copilot-accent)] hover:underline"
        >
          {row.name}
        </Link>
      </td>
      <td className="px-3 py-2.5 tabular-nums">{debtLabel}</td>
      <td className="px-3 py-2.5 tabular-nums">
        {row.isOverdue ? (
          <span className="text-[var(--copilot-danger-text-strong)]">{overdueLabel}</span>
        ) : (
          "—"
        )}
      </td>
      <td className="px-3 py-2.5">
        {row.isOverdue ? (
          <OverdueDaysBadge days={maxOverdueDays} />
        ) : row.hasDebt ? (
          <span className="text-[var(--copilot-ink-muted)] text-xs">Al día</span>
        ) : (
          <span className="text-[var(--copilot-ink-muted)] text-xs">Sin deuda</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-xs text-[var(--copilot-ink-muted)]">{statusLabel}</td>
      <td className="px-3 py-2.5 text-xs">
        <span
          className={
            row.assignedUserName || row.assignedUserEmail
              ? "text-[var(--copilot-ink)]"
              : "italic text-[var(--copilot-ink-muted)]"
          }
        >
          {responsableLabel(row)}
        </span>
      </td>
      <td className="py-2.5 pl-3 pr-4">
        <div className="flex flex-wrap gap-1.5">
          <Link
            href={`/copilot/clientes/${row.companyId}`}
            className="inline-flex items-center rounded-lg bg-[var(--copilot-accent)] px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90"
          >
            Ver
          </Link>
          <Link
            href={`/copilot/clientes/${row.companyId}#gestion-cobranza`}
            className="inline-flex items-center rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-2.5 py-1 text-xs font-medium text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-panel-bg)]"
          >
            Gestionar
          </Link>
          {canWrite ? (
            <button
              type="button"
              onClick={() =>
                onAssign({
                  companyId: row.companyId,
                  companyName: row.name,
                  currentOwnerUserId: row.assignedUserId,
                })
              }
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-2.5 py-1 text-xs font-medium text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-panel-bg)]"
            >
              <UserCheck className="h-3 w-3" aria-hidden />
              Asignar
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ClientesAGestionarList({
  rows,
  loading,
  currentUserId = null,
  currentUserRole = null,
  onOwnershipUpdate,
}: {
  rows: CobranzaClientRow[];
  loading: boolean;
  currentUserId?: string | null;
  currentUserRole?: string | null;
  onOwnershipUpdate?: (companyId: string, entry: OwnershipEntry | null) => void;
}) {
  const { mode, fxRate } = useDisplayCurrency();
  const [filter, setFilter] = useState<ClientFilter>("withDebt");
  const [respFilter, setRespFilter] = useState<ResponsableFilter>("all");
  const [search, setSearch] = useState("");
  const [assignModalFor, setAssignModalFor] = useState<AssignModalState | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, ok = true) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, ok });
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const handleAssignSuccess = useCallback(
    (companyId: string, entry: OwnershipEntry | null) => {
      onOwnershipUpdate?.(companyId, entry);
      showToast(entry ? "Responsable actualizado." : "Responsable quitado.");
      setAssignModalFor(null);
    },
    [onOwnershipUpdate, showToast]
  );

  const canWrite = canAssign(currentUserRole);

  const filtered = useMemo(() => {
    const byStatus = applyClientFilter(rows, filter);
    const byResp = applyResponsableFilter(byStatus, respFilter, currentUserId);
    const q = search.trim().toLocaleLowerCase("es");
    if (!q) return byResp;
    return byResp.filter((r) => r.name.toLocaleLowerCase("es").includes(q));
  }, [rows, filter, respFilter, search, currentUserId]);

  return (
    <>
      <div className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-4 py-4 shadow-sm sm:px-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">
              Clientes a gestionar
            </h2>
            <p className="text-xs text-[var(--copilot-ink-muted)]">
              Ordenados por vencimiento · sin paginación
            </p>
          </div>
        </div>

        {/* Toast */}
        {toast ? (
          <div
            role="status"
            aria-live="polite"
            className={`mb-3 rounded-lg border px-3 py-2 text-xs font-medium ${
              toast.ok
                ? "border-[var(--copilot-accent-soft)] bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)]"
                : "border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)]"
            }`}
          >
            {toast.message}
          </div>
        ) : null}

        {/* Filters */}
        <div className="mb-3 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-[72px] shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Estado
            </span>
            {FILTER_LABELS.map((f) => {
              const active = filter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    active
                      ? "bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)] ring-1 ring-[rgba(31,107,74,0.25)]"
                      : "bg-[var(--copilot-card-bg)]/70 text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)] hover:bg-[var(--copilot-panel-bg)]"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-[72px] shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Responsable
            </span>
            {RESP_FILTER_LABELS.map((f) => {
              const active = respFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setRespFilter(f.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    active
                      ? "bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)] ring-1 ring-[rgba(31,107,74,0.25)]"
                      : "bg-[var(--copilot-card-bg)]/70 text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)] hover:bg-[var(--copilot-panel-bg)]"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente…"
              aria-label="Buscar cliente"
              className="h-7 min-w-0 w-full rounded-full border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-3 text-xs text-[var(--copilot-ink)] placeholder:text-[var(--copilot-ink-muted)] focus:border-[var(--copilot-accent)] focus:outline-none sm:ml-auto sm:max-w-[200px] sm:flex-none"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-[var(--copilot-ink-muted)]">
            Cargando clientes…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-panel-bg)] px-4 py-6 text-center">
            <p className="text-sm font-medium text-[var(--copilot-ink)]">
              {search
                ? "No hay clientes que coincidan con la búsqueda."
                : "No hay clientes en esta categoría."}
            </p>
            <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">
              {filter === "noAction"
                ? "Todos los clientes con deuda ya tienen al menos una gestión registrada."
                : respFilter === "me"
                  ? "No tenés clientes asignados con este estado."
                  : respFilter === "unassigned"
                    ? "Todos los clientes tienen responsable asignado."
                    : "Cambiá el filtro o revisá que los datos estén sincronizados."}
            </p>
          </div>
        ) : (
          <>
            {filtered.length !== rows.length || search ? (
              <p className="mb-2 text-[11px] text-[var(--copilot-ink-muted)]">
                {filtered.length} cliente{filtered.length !== 1 ? "s" : ""}
              </p>
            ) : null}

            {/* Mobile: vertical cards */}
            <ul className="space-y-2 sm:hidden">
              {filtered.map((row) => (
                <li key={row.companyId}>
                  <ClientMobileCard
                    row={row}
                    mode={mode}
                    fxRate={fxRate}
                    canWrite={canWrite}
                    onAssign={setAssignModalFor}
                  />
                </li>
              ))}
            </ul>

            {/* Desktop: table */}
            <div className="hidden sm:block overflow-x-auto rounded-xl border border-[var(--copilot-border)]">
              <table className="w-full min-w-[720px]">
                <thead className="bg-[var(--copilot-panel-bg)]">
                  <tr className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    <th className="py-2.5 pl-4 pr-3 text-left">Cliente</th>
                    <th className="px-3 py-2.5 text-left">Pendiente</th>
                    <th className="px-3 py-2.5 text-left">Vencido</th>
                    <th className="px-3 py-2.5 text-left">Estado</th>
                    <th className="px-3 py-2.5 text-left">Gestión</th>
                    <th className="px-3 py-2.5 text-left">Responsable</th>
                    <th className="py-2.5 pl-3 pr-4 text-left">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <ClientDesktopRow
                      key={row.companyId}
                      row={row}
                      mode={mode}
                      fxRate={fxRate}
                      canWrite={canWrite}
                      onAssign={setAssignModalFor}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {assignModalFor ? (
        <AsignarResponsableModal
          companyId={assignModalFor.companyId}
          companyName={assignModalFor.companyName}
          currentOwnerUserId={assignModalFor.currentOwnerUserId}
          onClose={() => setAssignModalFor(null)}
          onSuccess={handleAssignSuccess}
        />
      ) : null}
    </>
  );
}
