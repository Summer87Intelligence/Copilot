"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Landmark } from "lucide-react";

import {
  copilotCaptionClass,
  copilotCardStandardClass,
  copilotSectionTitleClass,
} from "@/components/copilot/ui/copilot-visual-system";
import { EmptyState as DsEmptyState } from "@/components/copilot/ui/empty-state";
import { TablePagination } from "@/components/copilot/ui/table-pagination";
import { formatDate } from "@/components/copilot/bank-movements/canonical-evidence-ui";
import {
  collapseZeroNewImportRetries,
  resolveImportHistoryStats,
} from "@/lib/bank-movements/bank-import-history-display";
import type { BankStatementImport } from "@/lib/bank-movements/bank-movements-types";
import { movementDateInInclusiveRange } from "@/lib/bank-movements/bank-period";
import { keyedPageAt, resolveKeyedPage, type KeyedPageState } from "@/lib/ui/keyed-pagination";

const CLIENTS_PER_PAGE = 15;
const IMPORTS_PER_PAGE = 15;

/**
 * FASE BANK-RECONCILIATION-SIMPLE-UNIFIED-WORKSPACE-001 — Historial agrupado
 * por cliente/lote (una fila por cliente, no N eventos repetidos). Reutiliza
 * los mismos endpoints de lectura ya existentes. Reversión financiera sigue
 * explícitamente fuera de alcance.
 *
 * descriptionMasked (API legada): ahora es la descripción Santander canónica
 * con enmascarado selectivo solo de cuentas/tokens (≥8 dígitos). El concepto y
 * el pagador permanecen legibles e iguales a Movimientos/Conciliación.
 */
export function BankHistoryPanel({
  imports,
  loading,
  searchQuery = "",
  dateFrom,
  dateTo,
  periodLabel,
}: {
  imports: BankStatementImport[];
  loading: boolean;
  searchQuery?: string;
  dateFrom?: string;
  dateTo?: string;
  periodLabel?: string;
}) {
  // Key incluye datos + filtros: al cambiar período/búsqueda, página efectiva = 1 (sin useEffect).
  const importsKey = [
    imports.map((item) => item.id).join(","),
    searchQuery,
    dateFrom ?? "",
    dateTo ?? "",
  ].join("\0");
  const [importsPageState, setImportsPageState] = useState<KeyedPageState>(() =>
    keyedPageAt(importsKey, 1)
  );
  const importsPage = resolveKeyedPage(importsPageState, importsKey);
  const setImportsPage = (next: number) => setImportsPageState(keyedPageAt(importsKey, next));
  const displayImports = useMemo(() => collapseZeroNewImportRetries(imports), [imports]);
  const importTotalPages = Math.max(1, Math.ceil(displayImports.length / IMPORTS_PER_PAGE));
  const currentImportsPage = Math.min(importsPage, importTotalPages);
  const paginatedImports = displayImports.slice(
    (currentImportsPage - 1) * IMPORTS_PER_PAGE,
    currentImportsPage * IMPORTS_PER_PAGE
  );

  return (
    <div className="space-y-4" data-testid="bank-history-panel">
      {periodLabel ? (
        <p className={copilotCaptionClass}>
          Mostrando historial para {periodLabel}
          {searchQuery.trim() ? ` · búsqueda: ${searchQuery.trim()}` : ""}
        </p>
      ) : null}

      <GroupedIdentifications searchQuery={searchQuery} dateFrom={dateFrom} dateTo={dateTo} />

      <section className={copilotCardStandardClass}>
        <h2 className={copilotSectionTitleClass}>Importaciones</h2>
        <p className={`${copilotCaptionClass} mt-1`}>
          Fecha, archivo, leídos, nuevos, ya existentes, errores y actor.
        </p>
        {displayImports.length === 0 ? (
          <div className="mt-3">
            <DsEmptyState
              variant="compact"
              title={loading ? "Cargando historial" : "Todavía no hay importaciones"}
              description={
                loading
                  ? "Estamos preparando el historial de extractos."
                  : "Acá vas a ver cada extracto importado cuando la importación automática esté disponible."
              }
            />
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {paginatedImports.map((item) => {
              const stats = resolveImportHistoryStats(item);
              return (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--copilot-border)] px-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Landmark className="h-4 w-4 shrink-0 text-[var(--copilot-muted)]" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate text-[var(--copilot-text)]">
                        {item.file_name?.trim() || item.bank_name || "Importación bancaria"}
                      </span>
                      <span className={copilotCaptionClass}>
                        {stats.read} leídos · {stats.inserted} nuevos · {stats.alreadyExists} ya existentes
                        {stats.errors > 0 ? ` · ${stats.errors} errores` : ""}
                        {stats.actor ? ` · ${stats.actor}` : ""}
                        {stats.retryCount > 1 ? ` · ${stats.retryCount} reintentos sin nuevos` : ""}
                      </span>
                    </span>
                  </span>
                  <span className={`${copilotCaptionClass} whitespace-nowrap`}>{formatDate(item.imported_at)}</span>
                </li>
              );
            })}
          </ul>
        )}
        {displayImports.length > IMPORTS_PER_PAGE ? (
          <TablePagination
            className="mt-3"
            page={currentImportsPage}
            totalPages={importTotalPages}
            from={(currentImportsPage - 1) * IMPORTS_PER_PAGE + 1}
            to={Math.min(currentImportsPage * IMPORTS_PER_PAGE, displayImports.length)}
            total={displayImports.length}
            itemLabel="importaciones"
            onPageChange={setImportsPage}
          />
        ) : null}
      </section>
    </div>
  );
}

type IdentificationEvent = {
  id: string;
  eventLabel: string;
  status: string;
  clientName: string;
  date: string | null;
  amountLabel: string | null;
  referenceMasked: string | null;
  actor: string | null;
  reason: string | null;
  eventAt: string | null;
};

type ClientIdentificationGroup = {
  clientName: string;
  events: IdentificationEvent[];
  lastEventAt: string | null;
  lastMovementDate: string | null;
  statusSummary: string;
  eventCountLabel: string;
  amountSummary: string | null;
};

function normalizeHistorySearch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function movementDateMatchesHistoryRange(
  movementDate: string | null,
  dateFrom?: string,
  dateTo?: string
): boolean {
  if (!dateFrom || !dateTo) return true;
  if (!movementDate) return false;
  return movementDateInInclusiveRange(movementDate, dateFrom, dateTo);
}

function historySearchMatches(haystackParts: Array<string | null | undefined>, searchQuery: string): boolean {
  const query = normalizeHistorySearch(searchQuery);
  if (!query) return true;
  const haystack = normalizeHistorySearch(haystackParts.filter(Boolean).join(" "));
  return haystack.includes(query);
}

function filterIdentificationEvents(
  events: IdentificationEvent[],
  searchQuery: string,
  dateFrom?: string,
  dateTo?: string
): IdentificationEvent[] {
  return events.filter((event) => {
    if (!movementDateMatchesHistoryRange(event.date, dateFrom, dateTo)) return false;
    return historySearchMatches(
      [
        event.clientName,
        event.actor,
        event.eventLabel,
        event.referenceMasked,
        event.reason,
        event.amountLabel,
      ],
      searchQuery
    );
  });
}

function groupIdentificationsByClient(events: IdentificationEvent[]): ClientIdentificationGroup[] {
  const byClient = new Map<string, IdentificationEvent[]>();
  for (const ev of events) {
    const key = ev.clientName || "Cliente";
    const list = byClient.get(key) ?? [];
    list.push(ev);
    byClient.set(key, list);
  }

  const groups: ClientIdentificationGroup[] = [];
  for (const [clientName, list] of byClient) {
    const sorted = [...list].sort((a, b) => String(b.eventAt ?? b.date ?? "").localeCompare(String(a.eventAt ?? a.date ?? "")));
    const corrections = list.filter((e) => e.status === "revoked" || e.reason).length;
    const identified = list.filter((e) => e.status === "identified" || e.status === "shared_account" || e.status === "third_party").length;
    let statusSummary = `${identified} movimiento${identified === 1 ? "" : "s"} asociado${identified === 1 ? "" : "s"}`;
    if (corrections > 0) statusSummary += ` · ${corrections} corrección${corrections === 1 ? "" : "es"}`;
    groups.push({
      clientName,
      events: sorted,
      lastEventAt: sorted[0]?.eventAt ?? null,
      lastMovementDate: sorted[0]?.date ?? null,
      statusSummary,
      eventCountLabel: `${list.length} evento${list.length === 1 ? "" : "s"}`,
      amountSummary: summarizeIdentificationAmounts(list),
    });
  }

  return groups.sort((a, b) => String(b.lastEventAt ?? b.lastMovementDate ?? "").localeCompare(String(a.lastEventAt ?? a.lastMovementDate ?? "")));
}

function parseAmountLabel(amountLabel: string | null): { currency: "UYU" | "USD"; amount: number } | null {
  if (!amountLabel) return null;
  const match = amountLabel.match(/\b(UYU|USD)\b\s*([+-]?[0-9.,\s]+)/i);
  if (!match) return null;
  const currency = match[1]?.toUpperCase();
  const rawAmount = match[2]?.replace(/\s+/g, "") ?? "";
  if (currency !== "UYU" && currency !== "USD") return null;
  if (!rawAmount) return null;

  let normalized = rawAmount;
  if (normalized.includes(".") && normalized.includes(",")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }

  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return null;
  return { currency, amount };
}

function summarizeIdentificationAmounts(events: IdentificationEvent[]): string | null {
  const totals: Record<"UYU" | "USD", number> = { UYU: 0, USD: 0 };
  let hasAnyAmount = false;

  for (const event of events) {
    const parsed = parseAmountLabel(event.amountLabel);
    if (!parsed) continue;
    totals[parsed.currency] += parsed.amount;
    hasAnyAmount = true;
  }

  if (!hasAnyAmount) return null;

  return (["UYU", "USD"] as const)
    .filter((currency) => totals[currency] !== 0)
    .map((currency) => `${currency} ${totals[currency].toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
    .join(" · ");
}

function ClientAvatar({ name }: { name: string }) {
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--copilot-soft-bg)] text-sm font-semibold text-[var(--copilot-text)]"
      aria-hidden
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </div>
  );
}

/**
 * Eventos de identificación de cliente — SEPARADOS visualmente de las
 * conciliaciones financieras. Nunca dice "conciliado" para una mera identificación.
 */
function GroupedIdentifications({
  searchQuery,
  dateFrom,
  dateTo,
}: {
  searchQuery: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const [events, setEvents] = useState<IdentificationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const filterKey = `${searchQuery}\0${dateFrom ?? ""}\0${dateTo ?? ""}`;
  const [pageState, setPageState] = useState<KeyedPageState>(() => keyedPageAt(filterKey, 1));
  const page = resolveKeyedPage(pageState, filterKey);
  const setPage = (next: number) => setPageState(keyedPageAt(filterKey, next));
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    // Pedimos más eventos para poder agrupar por cliente sin N+1; el tope del API es 50.
    fetch("/api/copilot/bank-reconciliation/client-identifications/recent?limit=50")
      .then((r) => r.json())
      .then((json: { ok?: boolean; data?: IdentificationEvent[] }) => {
        if (!cancelled && json.ok) setEvents(json.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredEvents = useMemo(
    () => filterIdentificationEvents(events, searchQuery, dateFrom, dateTo),
    [dateFrom, dateTo, events, searchQuery]
  );
  const groups = useMemo(() => groupIdentificationsByClient(filteredEvents), [filteredEvents]);
  const totalPages = Math.max(1, Math.ceil(groups.length / CLIENTS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageGroups = groups.slice(
    (currentPage - 1) * CLIENTS_PER_PAGE,
    currentPage * CLIENTS_PER_PAGE
  );

  if (!loading && events.length === 0 && !searchQuery.trim() && !dateFrom && !dateTo) return null;

  return (
    <section className={copilotCardStandardClass}>
      <h2 className={copilotSectionTitleClass}>Identificaciones por cliente</h2>
      <p className={`${copilotCaptionClass} mt-1`}>
        Movimientos bancarios asociados a cada cliente y correcciones realizadas.
      </p>

      {loading ? (
        <p className={`${copilotCaptionClass} mt-3`}>Cargando identificaciones…</p>
      ) : groups.length === 0 ? (
        <div className="mt-3">
          <DsEmptyState
            variant="compact"
            title={
              searchQuery.trim()
                ? "No hay resultados para esta búsqueda"
                : "No hay identificaciones en este período"
            }
            description="Probá con otro período o quitá la búsqueda para ver más movimientos."
          />
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {pageGroups.map((group) => {
            const open = Boolean(expanded[group.clientName]);
            return (
              <li key={group.clientName} className="rounded-xl border border-[var(--copilot-border)]">
                <button
                  type="button"
                  className="flex w-full items-start gap-3 px-3 py-2.5 text-left"
                  aria-expanded={open}
                  onClick={() => setExpanded((prev) => ({ ...prev, [group.clientName]: !open }))}
                >
                  <ClientAvatar name={group.clientName} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--copilot-text)]">{group.clientName}</p>
                    <p className={copilotCaptionClass}>{group.statusSummary}</p>
                    <p className={copilotCaptionClass}>
                      {group.eventCountLabel}
                      {group.amountSummary ? ` · Totales asociados: ${group.amountSummary}` : ""}
                    </p>
                    <p className={copilotCaptionClass}>
                      Último movimiento: {formatDate(group.lastMovementDate)}
                      {group.lastEventAt ? ` · Última actualización: ${formatDate(group.lastEventAt)}` : ""}
                    </p>
                  </div>
                  <span className="mt-1 shrink-0 text-[var(--copilot-muted)]">
                    {open ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                    <span className="sr-only">Ver detalle</span>
                  </span>
                </button>
                {open ? (
                  <ul className="space-y-2 border-t border-[var(--copilot-border)] px-3 py-2">
                    {group.events.map((ev) => (
                      <li key={ev.id} className="rounded-lg bg-[var(--copilot-soft-bg)] px-3 py-2 text-xs text-[var(--copilot-text)]">
                        <p className="font-medium">
                          {ev.eventLabel}
                          {ev.amountLabel ? ` · ${ev.amountLabel}` : ""}
                        </p>
                        <p className={copilotCaptionClass}>
                          {formatDate(ev.date)}
                          {ev.referenceMasked ? ` · ${ev.referenceMasked}` : ""}
                          {ev.actor ? ` · Quién: ${ev.actor}` : ""}
                          {ev.eventAt ? ` · ${formatDate(ev.eventAt)}` : ""}
                          {ev.reason ? ` · Motivo: ${ev.reason}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {groups.length > CLIENTS_PER_PAGE ? (
        <TablePagination
          className="mt-3"
          page={currentPage}
          totalPages={totalPages}
          from={(currentPage - 1) * CLIENTS_PER_PAGE + 1}
          to={Math.min(currentPage * CLIENTS_PER_PAGE, groups.length)}
          total={groups.length}
          itemLabel="clientes"
          onPageChange={setPage}
        />
      ) : null}
    </section>
  );
}
