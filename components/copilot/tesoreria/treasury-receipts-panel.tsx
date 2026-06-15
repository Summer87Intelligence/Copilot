"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { CopilotSectionTitle } from "@/components/copilot/copilot-ui";
import { CopilotButton, copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import { CopilotEmptyPanel } from "@/components/copilot/copilot-empty-panel";
import { CopilotPagination } from "@/components/copilot/ui/copilot-pagination";
import {
  TESORERIA_FIELD_CLASS,
  TESORERIA_FILTER_CHIP_ACTIVE,
  TESORERIA_FILTER_CHIP_IDLE,
  TESORERIA_PAGE_SIZE,
} from "@/components/copilot/tesoreria/tesoreria-ui";
import {
  CopilotResponsiveTable,
  type CopilotResponsiveTableColumn,
} from "@/components/copilot/ui/copilot-responsive-table";
import { copilotApiFetch } from "@/lib/copilot-fetch";

type Receipt = {
  id: string;
  companyId: string | null;
  clientName: string | null;
  currencyCode: string | null;
  amount: number;
  receiptDate: string | null;
  receiptNumber: string | null;
  reference: string | null;
  status: string | null;
};

type Totals = { UYU: number; USD: number };

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function fmtMoney(n: number, currency: string): string {
  const prefix = currency === "USD" ? "U$S " : "$ ";
  return `${prefix}${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getFirstDayOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TreasuryReceiptsPanel() {
  const [from, setFrom] = useState(getFirstDayOfMonth);
  const [to, setTo] = useState(getToday);
  const [currency, setCurrency] = useState<"all" | "UYU" | "USD">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [totals, setTotals] = useState<Totals>({ UYU: 0, USD: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from, to, limit: "500" });
      if (currency !== "all") params.set("currency", currency);
      const res = await copilotApiFetch(`/api/copilot/treasury/receipts?${params}`);
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        receipts?: Receipt[];
        totals?: Totals;
      } | null;
      if (!res.ok || !json?.ok) {
        setError("No se pudo cargar la cobranza del mes.");
      } else {
        setReceipts(json.receipts ?? []);
        setTotals(json.totals ?? { UYU: 0, USD: 0 });
        setPage(0);
      }
    } catch {
      setError("Error al cargar cobranza.");
    } finally {
      setLoading(false);
    }
  }, [from, to, currency]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return receipts.filter((r) => {
      if (!q) return true;
      return (
        (r.clientName ?? "").toLowerCase().includes(q) ||
        (r.receiptNumber ?? "").toLowerCase().includes(q) ||
        (r.reference ?? "").toLowerCase().includes(q)
      );
    });
  }, [receipts, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / TESORERIA_PAGE_SIZE));
  const pageItems = filtered.slice(page * TESORERIA_PAGE_SIZE, (page + 1) * TESORERIA_PAGE_SIZE);

  return (
    <section className="space-y-4">
      <CopilotSectionTitle
        title="Cobranza del mes"
        subtitle="Recibos registrados en Zeta por período. Solo lectura."
        action={
          <CopilotButton type="button" variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refrescar
          </CopilotButton>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm text-[var(--copilot-ink-muted)]">
          Desde
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => { setFrom(e.target.value); setPage(0); }}
            className={`${TESORERIA_FIELD_CLASS} w-auto`}
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-[var(--copilot-ink-muted)]">
          Hasta
          <input
            type="date"
            value={to}
            min={from}
            max={getToday()}
            onChange={(e) => { setTo(e.target.value); setPage(0); }}
            className={`${TESORERIA_FIELD_CLASS} w-auto`}
          />
        </label>
        {(["all", "UYU", "USD"] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => { setCurrency(c); setPage(0); }}
            className={`${copilotButtonClassName({ variant: "ghost", size: "sm" })} !rounded-full ${
              currency === c ? TESORERIA_FILTER_CHIP_ACTIVE : TESORERIA_FILTER_CHIP_IDLE
            }`}
          >
            {c === "all" ? "Todas" : c}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          placeholder="Buscar cliente, recibo o referencia"
          className={`${TESORERIA_FIELD_CLASS} max-w-xs`}
        />
      </div>

      {/* Totals */}
      {!loading && (totals.UYU > 0 || totals.USD > 0) && (
        <div className="flex flex-wrap gap-4 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-panel-bg)] px-4 py-2.5">
          <span className="text-xs text-[var(--copilot-ink-muted)]">
            Total cobrado en período:
          </span>
          {totals.UYU > 0 && (
            <span className="text-sm font-semibold text-[var(--copilot-ink)] tabular-nums">
              {fmtMoney(totals.UYU, "UYU")} <span className="text-xs font-normal text-[var(--copilot-ink-muted)]">UYU</span>
            </span>
          )}
          {totals.USD > 0 && (
            <span className="text-sm font-semibold text-[var(--copilot-ink)] tabular-nums">
              {fmtMoney(totals.USD, "USD")} <span className="text-xs font-normal text-[var(--copilot-ink-muted)]">USD</span>
            </span>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] px-3 py-2 text-sm text-[var(--copilot-danger-text)]">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--copilot-ink-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando recibos…
        </div>
      ) : filtered.length === 0 ? (
        <CopilotEmptyPanel
          title="Sin recibos en el período"
          paragraphs={["No hay recibos registrados en Zeta para el rango y filtros seleccionados."]}
        />
      ) : (
        <>
          <CopilotResponsiveTable<Receipt>
            rows={pageItems}
            getRowKey={(r) => r.id}
            minWidth="720px"
            ariaLabel="Recibos del período"
            stickyHeader
            columns={[
              {
                key: "fecha",
                header: "Fecha",
                render: (r) => fmtDate(r.receiptDate),
              },
              {
                key: "cliente",
                header: "Cliente",
                render: (r) =>
                  r.clientName ?? (
                    <span className="text-[var(--copilot-ink-muted)]">Sin cliente</span>
                  ),
              },
              {
                key: "recibo",
                header: "Recibo",
                render: (r) => r.receiptNumber ?? "—",
              },
              {
                key: "referencia",
                header: "Referencia",
                render: (r) => r.reference ?? "—",
              },
              {
                key: "moneda",
                header: "Moneda",
                cellClassName: "font-semibold uppercase",
                render: (r) => r.currencyCode ?? "—",
              },
              {
                key: "importe",
                header: "Importe",
                cellClassName: "tabular-nums",
                render: (r) =>
                  r.currencyCode ? fmtMoney(r.amount, r.currencyCode) : r.amount.toFixed(2),
              },
            ] satisfies CopilotResponsiveTableColumn<Receipt>[]}
            mobileCard={(r) => (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--copilot-ink)]">
                      {r.clientName ?? (
                        <span className="text-[var(--copilot-ink-muted)]">Sin cliente</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--copilot-ink-muted)]">
                      {fmtDate(r.receiptDate)}
                      {r.receiptNumber ? ` · ${r.receiptNumber}` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 text-right tabular-nums text-sm font-semibold text-[var(--copilot-ink)]">
                    {r.currencyCode ? fmtMoney(r.amount, r.currencyCode) : r.amount.toFixed(2)}
                    {r.currencyCode ? (
                      <span className="ml-1 text-[10px] font-normal text-[var(--copilot-ink-muted)]">
                        {r.currencyCode}
                      </span>
                    ) : null}
                  </p>
                </div>
                {r.reference ? (
                  <p className="mt-2 text-[11px] text-[var(--copilot-ink-muted)]">
                    Ref. {r.reference}
                  </p>
                ) : null}
              </>
            )}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--copilot-ink-muted)]">
              {filtered.length} recibo{filtered.length !== 1 ? "s" : ""}
              {pageCount > 1 && ` · Página ${page + 1} de ${pageCount}`}
            </span>
            <CopilotPagination page={page} pageCount={pageCount} onPageChange={setPage} />
          </div>
        </>
      )}
    </section>
  );
}
