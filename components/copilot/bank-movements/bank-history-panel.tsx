"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Landmark } from "lucide-react";

import {
  copilotCaptionClass,
  copilotCardStandardClass,
  copilotSectionTitleClass,
} from "@/components/copilot/ui/copilot-visual-system";
import { EmptyState as DsEmptyState } from "@/components/copilot/ui/empty-state";
import { formatDate, money, type EvidenceItem } from "@/components/copilot/bank-movements/canonical-evidence-ui";
import type { BankStatementImport } from "@/lib/bank-movements/bank-movements-types";
import { BANK_MOVEMENT_DESCRIPTION_CLASS } from "@/lib/bank-movements/bank-movement-display";

const CLIENTS_PER_PAGE = 15;

/**
 * FASE BANK-RECONCILIATION-SIMPLE-UNIFIED-WORKSPACE-001 — Historial agrupado
 * por cliente/lote (una fila por cliente, no N eventos repetidos). Reutiliza
 * los mismos endpoints de lectura ya existentes. Reversión financiera sigue
 * explícitamente fuera de alcance (botón deshabilitado).
 *
 * descriptionMasked (API legada): ahora es la descripción Santander canónica
 * con enmascarado selectivo solo de cuentas/tokens (≥8 dígitos). El concepto y
 * el pagador permanecen legibles e iguales a Movimientos/Conciliación.
 */
export function BankHistoryPanel({ imports, loading }: { imports: BankStatementImport[]; loading: boolean }) {
  return (
    <div className="space-y-4">
      <GroupedIdentifications />
      <GroupedDecisions />

      <section className={copilotCardStandardClass}>
        <h2 className={copilotSectionTitleClass}>Importaciones realizadas</h2>
        {imports.length === 0 ? (
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
            {imports.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--copilot-border)] px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <Landmark className="h-4 w-4 shrink-0 text-[var(--copilot-muted)]" aria-hidden />
                  <span className="truncate">
                    {item.file_name ?? item.bank_name} · {item.row_count} movimientos
                  </span>
                </span>
                <span className={`${copilotCaptionClass} whitespace-nowrap`}>{formatDate(item.imported_at)}</span>
              </li>
            ))}
          </ul>
        )}
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
};

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
    let statusSummary = `${identified} movimiento${identified === 1 ? "" : "s"} identificado${identified === 1 ? "" : "s"}`;
    if (corrections > 0) statusSummary += ` · ${corrections} corrección${corrections === 1 ? "" : "es"}`;
    groups.push({
      clientName,
      events: sorted,
      lastEventAt: sorted[0]?.eventAt ?? null,
      lastMovementDate: sorted[0]?.date ?? null,
      statusSummary,
    });
  }

  return groups.sort((a, b) => String(b.lastEventAt ?? b.lastMovementDate ?? "").localeCompare(String(a.lastEventAt ?? a.lastMovementDate ?? "")));
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
function GroupedIdentifications() {
  const [events, setEvents] = useState<IdentificationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
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

  const groups = useMemo(() => groupIdentificationsByClient(events), [events]);
  const totalPages = Math.max(1, Math.ceil(groups.length / CLIENTS_PER_PAGE));
  const pageGroups = groups.slice((page - 1) * CLIENTS_PER_PAGE, page * CLIENTS_PER_PAGE);

  if (!loading && events.length === 0) return null;

  return (
    <section className={copilotCardStandardClass}>
      <h2 className={copilotSectionTitleClass}>Identificaciones por cliente</h2>
      <p className={`${copilotCaptionClass} mt-1`}>
        Una fila por cliente. Expandí para ver movimientos, referencias, actor y correcciones. Identificar cliente no implica recibo ni factura pagada.
      </p>

      {loading ? (
        <p className={`${copilotCaptionClass} mt-3`}>Cargando identificaciones…</p>
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
                      Último movimiento: {formatDate(group.lastMovementDate)}
                      {group.lastEventAt ? ` · Decisión: ${formatDate(group.lastEventAt)}` : ""}
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
        <nav className="mt-3 flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-[var(--copilot-border)] px-3 py-1 text-xs font-semibold text-[var(--copilot-text)] disabled:opacity-50"
          >
            Anterior
          </button>
          <span className={copilotCaptionClass}>
            Página {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-lg border border-[var(--copilot-border)] px-3 py-1 text-xs font-semibold text-[var(--copilot-text)] disabled:opacity-50"
          >
            Siguiente
          </button>
        </nav>
      ) : null}
    </section>
  );
}

const STATUS_LABEL: Record<string, string> = {
  confirmed: "Conciliado con recibo",
  rejected: "Rechazado",
};

const RECONCILIATION_LEVEL_LABEL: Record<"reconciled_with_receipt" | "full_reconciliation", string> = {
  reconciled_with_receipt: "Conciliado con recibo",
  full_reconciliation: "Conciliación completa",
};

const STATUS_STYLE: Record<string, string> = {
  confirmed: "border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]",
  rejected: "border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)]",
};

type DecisionGroup = {
  clientName: string;
  items: EvidenceItem[];
  lastDate: string | null;
  statusSummary: string;
};

function groupDecisionsByClient(items: EvidenceItem[]): DecisionGroup[] {
  const byClient = new Map<string, EvidenceItem[]>();
  for (const item of items) {
    const key = item.client?.name ?? "Cliente sin identificar";
    const list = byClient.get(key) ?? [];
    list.push(item);
    byClient.set(key, list);
  }
  const groups: DecisionGroup[] = [];
  for (const [clientName, list] of byClient) {
    const sorted = [...list].sort((a, b) => b.movement.date.localeCompare(a.movement.date));
    const confirmed = list.filter((i) => i.status === "confirmed").length;
    const rejected = list.filter((i) => i.status === "rejected").length;
    const parts: string[] = [];
    if (confirmed > 0) parts.push(`${confirmed} conciliado${confirmed === 1 ? "" : "s"}`);
    if (rejected > 0) parts.push(`${rejected} rechazado${rejected === 1 ? "" : "s"}`);
    groups.push({
      clientName,
      items: sorted,
      lastDate: sorted[0]?.movement.date ?? null,
      statusSummary: parts.join(" · ") || `${list.length} decisión${list.length === 1 ? "" : "es"}`,
    });
  }
  return groups.sort((a, b) => String(b.lastDate ?? "").localeCompare(String(a.lastDate ?? "")));
}

function GroupedDecisions() {
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    fetch("/api/copilot/bank-movements/canonical-suggestions?workspace=history&limit=50")
      .then((r) => r.json())
      .then((json: { ok?: boolean; data?: EvidenceItem[] }) => {
        if (!cancelled && json.ok) setItems(json.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(() => groupDecisionsByClient(items), [items]);
  const totalPages = Math.max(1, Math.ceil(groups.length / CLIENTS_PER_PAGE));
  const pageGroups = groups.slice((page - 1) * CLIENTS_PER_PAGE, page * CLIENTS_PER_PAGE);

  return (
    <section className={copilotCardStandardClass}>
      <h2 className={copilotSectionTitleClass}>Conciliaciones por cliente</h2>
      <p className={`${copilotCaptionClass} mt-1`}>
        Decisiones ya tomadas (confirmadas o rechazadas), agrupadas por cliente. Revertir una conciliación financiera todavía no está disponible.
      </p>

      {loading ? (
        <p className={`${copilotCaptionClass} mt-3`}>Cargando conciliaciones…</p>
      ) : items.length === 0 ? (
        <p className={`${copilotCaptionClass} mt-3`}>Todavía no hay conciliaciones confirmadas ni rechazos.</p>
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
                    <p className={copilotCaptionClass}>Último movimiento: {formatDate(group.lastDate)}</p>
                  </div>
                  <span className="mt-1 shrink-0 text-[var(--copilot-muted)]">
                    {open ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                    <span className="sr-only">Ver detalle</span>
                  </span>
                </button>
                {open ? (
                  <ul className="space-y-2 border-t border-[var(--copilot-border)] px-3 py-2">
                    {group.items.map((item) => (
                      <li key={item.suggestionId} className="rounded-lg bg-[var(--copilot-soft-bg)] px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium text-[var(--copilot-text)]">
                            {money(item.movement.currency, item.movement.amount)}
                          </p>
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLE[item.status] ?? ""}`}
                          >
                            {item.status === "confirmed" && item.reconciliationLevel
                              ? RECONCILIATION_LEVEL_LABEL[item.reconciliationLevel]
                              : STATUS_LABEL[item.status] ?? item.status}
                          </span>
                        </div>
                        <p className={`${copilotCaptionClass} ${BANK_MOVEMENT_DESCRIPTION_CLASS}`}>
                          {formatDate(item.movement.date)} · {item.movement.descriptionMasked}
                          {item.receipt ? ` · Recibo ${money(item.receipt.currency, item.receipt.amount)}` : ""}
                        </p>
                        {item.status === "confirmed" && item.receipt ? (
                          item.appliedAllocations.length > 0 ? (
                            <p className={copilotCaptionClass}>
                              Facturas comprobadas:{" "}
                              {item.appliedAllocations
                                .map((a) => `${a.invoiceNumber ?? a.invoiceId} (${money(a.currencyCode, a.appliedAmount)})`)
                                .join(", ")}
                            </p>
                          ) : (
                            <p className={copilotCaptionClass}>
                              No encontramos una aplicación de este recibo a facturas en Zeta.
                            </p>
                          )
                        ) : null}
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
        <nav className="mt-3 flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-[var(--copilot-border)] px-3 py-1 text-xs font-semibold text-[var(--copilot-text)] disabled:opacity-50"
          >
            Anterior
          </button>
          <span className={copilotCaptionClass}>
            Página {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-lg border border-[var(--copilot-border)] px-3 py-1 text-xs font-semibold text-[var(--copilot-text)] disabled:opacity-50"
          >
            Siguiente
          </button>
        </nav>
      ) : null}

      <button
        type="button"
        disabled
        title="La reversión desde la UI todavía no está disponible (fase futura)"
        className="mt-3 inline-flex cursor-not-allowed items-center rounded-lg border border-[var(--copilot-border)] px-3 py-1.5 text-xs font-semibold text-[var(--copilot-muted)] opacity-60"
      >
        Revertir (próximamente)
      </button>
    </section>
  );
}
