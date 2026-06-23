"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { copilotApiFetch } from "@/lib/copilot-fetch";
import {
  filterHistoryByCliente,
  uniqueClientesFromHistory,
  HISTORY_PAGE_SIZE,
  HISTORY_API_PATH,
  type CobranzaHistoryApiResponse,
  type CobranzaHistoryPeriod,
  type CobranzaHistoryRow,
} from "@/lib/copilot-cobranza-history";

const PERIOD_LABELS: Record<CobranzaHistoryPeriod, string> = {
  "30d": "Últimos 30 días",
  month: "Este mes",
  all: "Todo",
};

export function HistorialCobrosList() {
  const [items, setItems] = useState<CobranzaHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<CobranzaHistoryPeriod>("30d");
  const [currency, setCurrency] = useState<string>("");
  const [selectedCliente, setSelectedCliente] = useState<string>("");
  const [displayCount, setDisplayCount] = useState(HISTORY_PAGE_SIZE);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (p: CobranzaHistoryPeriod, c: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);
    setDisplayCount(HISTORY_PAGE_SIZE);

    try {
      const qs = new URLSearchParams({ period: p });
      if (c === "UYU" || c === "USD") qs.set("currency", c);
      const res = await copilotApiFetch(`${HISTORY_API_PATH}?${qs}`, {
        signal: ctrl.signal,
      });
      if (!res.ok) {
        setError("Error al cargar el historial.");
        return;
      }
      const json = (await res.json()) as CobranzaHistoryApiResponse;
      if (!ctrl.signal.aborted) {
        setItems(json.items ?? []);
        setSelectedCliente("");
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError("Error al cargar el historial.");
      }
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(period, currency);
    return () => {
      abortRef.current?.abort();
    };
  }, [load, period, currency]);

  const clientes = useMemo(() => uniqueClientesFromHistory(items), [items]);

  const filtered = useMemo(
    () => filterHistoryByCliente(items, selectedCliente),
    [items, selectedCliente]
  );

  const displayed = filtered.slice(0, displayCount);
  const hasMore = displayCount < filtered.length;

  return (
    <section aria-labelledby="historial-cobros-heading">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2
              id="historial-cobros-heading"
              className="text-sm font-semibold text-[var(--copilot-ink)]"
            >
              Historial de cobros
            </h2>
            {!loading && items.length > 0 && (
              <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
                {filtered.length} registro{filtered.length !== 1 ? "s" : ""}
                {selectedCliente ? ` · ${selectedCliente}` : ""}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Period */}
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as CobranzaHistoryPeriod)}
              aria-label="Período"
              className={filterSelectCls}
            >
              {(["30d", "month", "all"] as const).map((p) => (
                <option key={p} value={p}>
                  {PERIOD_LABELS[p]}
                </option>
              ))}
            </select>

            {/* Currency */}
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              aria-label="Moneda"
              className={filterSelectCls}
            >
              <option value="">Todas las monedas</option>
              <option value="UYU">UYU</option>
              <option value="USD">USD</option>
            </select>

            {/* Cliente */}
            <select
              value={selectedCliente}
              onChange={(e) => {
                setSelectedCliente(e.target.value);
                setDisplayCount(HISTORY_PAGE_SIZE);
              }}
              aria-label="Cliente"
              disabled={clientes.length === 0}
              className={filterSelectCls}
            >
              <option value="">Todos los clientes</option>
              {clientes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <HistorialSkeleton />
        ) : error ? (
          <p
            role="alert"
            className="rounded-xl border border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] px-4 py-3 text-sm text-[var(--copilot-danger-text-strong)]"
          >
            {error}
          </p>
        ) : displayed.length === 0 ? (
          <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-panel-bg)] px-4 py-8 text-center text-sm text-[var(--copilot-ink-muted)]">
            Sin cobros registrados para este período.
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto rounded-xl border border-[var(--copilot-border)] sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--copilot-border)] bg-[var(--copilot-panel-bg)]">
                    {["Fecha", "Cliente", "Monto", "Moneda", "Origen", "Referencia", "Registrado"].map(
                      (h) => (
                        <th
                          key={h}
                          scope="col"
                          className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--copilot-ink-muted)]"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--copilot-border)] bg-[var(--copilot-card)]">
                  {displayed.map((row) => (
                    <tr key={row.id} className="hover:bg-[var(--copilot-panel-bg)]/40">
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-[var(--copilot-ink-muted)]">
                        {formatFecha(row.fecha)}
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-3 text-sm font-medium text-[var(--copilot-ink)]">
                        {row.clienteNombre}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-[var(--copilot-ink)]">
                        {formatMonto(row.monto)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-[var(--copilot-ink-muted)]">
                        {row.moneda}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <OrigenBadge origen={row.origen} />
                      </td>
                      <td className="max-w-[140px] truncate px-4 py-3 text-sm text-[var(--copilot-ink-muted)]">
                        {row.referencia ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-[var(--copilot-ink-muted)]">
                        {row.registradoPor}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="space-y-2 sm:hidden">
              {displayed.map((row) => (
                <li
                  key={row.id}
                  className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card)] px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--copilot-ink)]">
                      {row.clienteNombre}
                    </span>
                    <OrigenBadge origen={row.origen} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--copilot-ink-muted)]">
                    <span className="font-semibold text-[var(--copilot-ink)]">
                      {formatMonto(row.monto)}{" "}
                      <span className="font-normal">{row.moneda}</span>
                    </span>
                    <span>{formatFecha(row.fecha)}</span>
                    {row.referencia ? <span>{row.referencia}</span> : null}
                  </div>
                </li>
              ))}
            </ul>

            {hasMore && (
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => setDisplayCount((n) => n + HISTORY_PAGE_SIZE)}
                  className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-5 py-2 text-sm font-medium text-[var(--copilot-ink)] transition hover:bg-[var(--copilot-panel-bg)]"
                >
                  Cargar más ({filtered.length - displayCount} restantes)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function OrigenBadge({ origen }: { origen: "Manual" | "Zeta" }) {
  if (origen === "Manual") {
    return (
      <span className="inline-flex items-center rounded-md border border-[var(--copilot-accent)]/30 bg-[var(--copilot-accent)]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-accent)]">
        Manual
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md border border-[var(--copilot-border)] bg-[var(--copilot-panel-bg)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
      Zeta
    </span>
  );
}

function HistorialSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-11 animate-pulse rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-panel-bg)]"
        />
      ))}
    </div>
  );
}

function formatFecha(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

function formatMonto(n: number): string {
  return n.toLocaleString("es-UY", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

const filterSelectCls =
  "rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-2.5 py-1.5 text-xs text-[var(--copilot-ink)] shadow-sm focus:border-[var(--copilot-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--copilot-accent)]/20 disabled:opacity-50";
