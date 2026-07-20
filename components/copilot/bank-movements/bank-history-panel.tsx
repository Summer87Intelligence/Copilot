"use client";

import { useEffect, useState } from "react";
import { Landmark } from "lucide-react";

import {
  copilotCaptionClass,
  copilotCardStandardClass,
  copilotSectionTitleClass,
} from "@/components/copilot/ui/copilot-visual-system";
import { EmptyState as DsEmptyState } from "@/components/copilot/ui/empty-state";
import { formatDate, money, type EvidenceItem } from "@/components/copilot/bank-movements/canonical-evidence-ui";
import type { BankStatementImport } from "@/lib/bank-movements/bank-movements-types";

/**
 * FASE BANK-UNIFIED-INCOME-RECONCILIATION-WORKSPACE-001 — Historial ahora
 * también muestra decisiones terminales (conciliaciones confirmadas y
 * sugerencias rechazadas), además de las importaciones de extractos ya
 * existentes. 100% lectura — reversión sigue explícitamente fuera de alcance
 * (botón deshabilitado/ausente hasta una fase futura dedicada).
 */
export function BankHistoryPanel({ imports, loading }: { imports: BankStatementImport[]; loading: boolean }) {
  return (
    <div className="space-y-4">
      <RecentDecisions />

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

const STATUS_LABEL: Record<string, string> = {
  confirmed: "Conciliado",
  rejected: "Rechazado",
};

const STATUS_STYLE: Record<string, string> = {
  confirmed: "border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]",
  rejected: "border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)]",
};

function RecentDecisions() {
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/copilot/bank-movements/canonical-suggestions?workspace=history&limit=20")
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

  return (
    <section className={copilotCardStandardClass}>
      <h2 className={copilotSectionTitleClass}>Conciliaciones y decisiones recientes</h2>
      <p className={`${copilotCaptionClass} mt-1`}>
        Conciliaciones confirmadas y sugerencias rechazadas del motor canónico. Reversión: no disponible todavía.
      </p>

      {loading ? (
        <p className={`${copilotCaptionClass} mt-3`}>Cargando decisiones recientes…</p>
      ) : items.length === 0 ? (
        <p className={`${copilotCaptionClass} mt-3`}>Todavía no hay conciliaciones confirmadas ni sugerencias rechazadas.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.suggestionId} className="rounded-xl border border-[var(--copilot-border)] px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-[var(--copilot-text)]">
                  {item.client ? item.client.name : "Cliente sin identificar"} · {money(item.movement.currency, item.movement.amount)}
                </p>
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLE[item.status] ?? ""}`}>
                  {STATUS_LABEL[item.status] ?? item.status}
                </span>
              </div>
              <p className={copilotCaptionClass}>
                {formatDate(item.movement.date)} · {item.movement.descriptionMasked}
                {item.receipt ? ` · Recibo ${money(item.receipt.currency, item.receipt.amount)}` : ""}
              </p>
              {item.candidateInvoices.length > 0 ? (
                <p className={copilotCaptionClass}>
                  Facturas: {item.candidateInvoices.map((inv) => money(inv.currencyCode, inv.balanceAmount)).join(", ")}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

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
