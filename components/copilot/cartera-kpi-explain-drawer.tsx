"use client";

/**
 * Drawer lateral genérico para explicar de dónde sale el número de un KPI
 * de Cartera: título, período, moneda, fórmula, total y desglose top N
 * (facturas o clientes). No recalcula nada; consume el mismo reporte que
 * las cards.
 */

import { useEffect } from "react";
import Link from "next/link";
import { X } from "lucide-react";

import {
  formatCarteraInteger,
  formatCarteraMoney,
} from "@/lib/copilot-cartera-format";
import type {
  ReconciliationCurrencyCode,
} from "@/lib/copilot-financial-reconciliation";

export type CarteraKpiBreakdownRowKind = "invoice" | "client" | "credit_note";

export type CarteraKpiBreakdownRow = {
  kind: CarteraKpiBreakdownRowKind;
  label: string;
  secondary?: string | null;
  amount: number;
  /** YYYY-MM-DD opcional para mostrar fecha. */
  date?: string | null;
  /** Estado/aging opcional. */
  state?: string | null;
  /** Link opcional a Cliente 360. */
  href?: string | null;
  /** Solo filas NC: factura asociada si Zeta la expone. */
  associatedInvoice?: string | null;
};

export type CarteraKpiExplain = {
  title: string;
  currency: ReconciliationCurrencyCode;
  periodLabel: string | null;
  formula: string;
  /** Detalles incluye/no incluye, frases cortas. */
  notes: string[];
  total: number;
  /** Cantidad de facturas que contribuyen. */
  invoiceCount?: number | null;
  /** Cantidad de clientes que contribuyen. */
  clientCount?: number | null;
  rows: CarteraKpiBreakdownRow[];
  /** Cuando hay más filas que las visibles → CTA. */
  moreHref?: string | null;
  moreLabel?: string | null;
  /** Mensaje cuando `rows` está vacío (p. ej. NC sin detalle en fuente). */
  emptyDetailMessage?: string | null;
};

export type CarteraKpiExplainDrawerProps = {
  explain: CarteraKpiExplain | null;
  open: boolean;
  onClose: () => void;
};

export function CarteraKpiExplainDrawer({
  explain,
  open,
  onClose,
}: CarteraKpiExplainDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !explain) return null;

  const fractionDigits = explain.currency === "UYU" ? 0 : 2;
  const totalLabel = formatCarteraMoney(explain.currency, explain.total, {
    fractionDigits,
  });

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar panel"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${explain.title} ${explain.currency}`}
        className="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-none flex-col border-l border-[var(--copilot-border)] bg-[var(--copilot-card)] shadow-2xl md:w-[min(520px,100vw)] md:min-w-[420px]"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--copilot-border)] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--copilot-ink-muted)]">
              {explain.title} · {explain.currency}
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--copilot-ink)]">
              {totalLabel}
            </p>
            {explain.periodLabel ? (
              <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
                Período: {explain.periodLabel}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 transition hover:bg-[var(--copilot-panel-bg)]"
          >
            <X className="h-4 w-4 text-[var(--copilot-ink-muted)]" aria-hidden />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <section className="border-b border-[var(--copilot-border)] px-5 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Fórmula
            </p>
            <p className="mt-1 text-xs text-[var(--copilot-ink)]">{explain.formula}</p>
            {explain.notes.length > 0 ? (
              <ul className="mt-2 space-y-0.5 text-[11px] text-[var(--copilot-ink-muted)]">
                {explain.notes.map((n) => (
                  <li key={n}>· {n}</li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="grid grid-cols-2 gap-3 border-b border-[var(--copilot-border)] px-5 py-3 text-xs">
            {explain.invoiceCount != null ? (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                  Facturas
                </p>
                <p className="mt-1 tabular-nums text-[var(--copilot-ink)]">
                  {formatCarteraInteger(explain.invoiceCount)}
                </p>
              </div>
            ) : null}
            {explain.clientCount != null ? (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                  Clientes
                </p>
                <p className="mt-1 tabular-nums text-[var(--copilot-ink)]">
                  {formatCarteraInteger(explain.clientCount)}
                </p>
              </div>
            ) : null}
          </section>

          <section className="px-5 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Desglose top
            </p>
            {explain.rows.length === 0 ? (
              <p className="mt-2 text-xs text-[var(--copilot-ink-muted)]">
                {explain.emptyDetailMessage ??
                  "No hay detalle disponible para este indicador."}
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-[var(--copilot-border)]/60">
                {explain.rows.map((row, idx) => (
                  <li
                    key={`${row.kind}-${idx}-${row.label}`}
                    className="py-2 text-xs"
                  >
                    {row.kind === "credit_note" ? (
                      <div className="space-y-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            {row.href ? (
                              <Link
                                href={row.href}
                                className="block truncate font-medium text-[var(--copilot-accent)] hover:underline"
                              >
                                Cliente: {row.label}
                              </Link>
                            ) : (
                              <p className="truncate font-medium text-[var(--copilot-ink)]">
                                Cliente: {row.label}
                              </p>
                            )}
                          </div>
                          <p className="shrink-0 tabular-nums font-semibold text-[var(--copilot-danger-text-strong)]">
                            {formatCarteraMoney(explain.currency, row.amount, {
                              fractionDigits,
                            })}
                          </p>
                        </div>
                        <p className="text-[10px] text-[var(--copilot-ink-muted)]">
                          Nota crédito: {row.secondary ?? "—"}
                          {row.date ? ` · Fecha: ${row.date}` : ""}
                        </p>
                        <p className="text-[10px] text-[var(--copilot-ink-muted)]">
                          Factura asociada: {row.associatedInvoice ?? "—"}
                          {row.state ? ` · Estado: ${row.state}` : ""}
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          {row.href ? (
                            <Link
                              href={row.href}
                              className="block truncate font-medium text-[var(--copilot-accent)] hover:underline"
                            >
                              {row.label}
                            </Link>
                          ) : (
                            <p className="truncate font-medium text-[var(--copilot-ink)]">
                              {row.label}
                            </p>
                          )}
                          <p className="truncate text-[10px] text-[var(--copilot-ink-muted)]">
                            {[row.secondary, row.date, row.state]
                              .filter((s) => s && s.length > 0)
                              .join(" · ")}
                          </p>
                        </div>
                        <p className="shrink-0 tabular-nums font-semibold text-[var(--copilot-danger-text-strong)]">
                          {formatCarteraMoney(explain.currency, row.amount, {
                            fractionDigits,
                          })}
                        </p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {explain.moreHref ? (
              <Link
                href={explain.moreHref}
                className="mt-3 inline-flex text-xs font-semibold text-[var(--copilot-accent)] hover:underline"
                onClick={onClose}
              >
                {explain.moreLabel ?? "Ver todos"} →
              </Link>
            ) : null}
          </section>
        </div>
      </aside>
    </>
  );
}
