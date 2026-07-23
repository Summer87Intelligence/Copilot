"use client";

import { useCallback, useEffect, useState } from "react";

import {
  copilotCaptionClass,
  copilotMetricLabelClass,
} from "@/components/copilot/ui/copilot-visual-system";
import { BANK_MOVEMENT_DESCRIPTION_CLASS } from "@/lib/bank-movements/bank-movement-display";
import {
  buildBankMovementConsultHref,
  type ClientBankingAssociationRow,
  type ClientBankingHowAppears,
  type ClientBankingSummary,
  type CorrectionsGroup,
  type HabitualPaymentPattern,
} from "@/lib/bank-movements/client-banking-history-view";

type ReconciledPaymentRow = {
  movementId: string;
  movementDate: string;
  movementAmount: number;
  currency: string;
  level: "reconciled_with_receipt" | "full_reconciliation";
  appliedInvoices: Array<{ invoiceId: string; invoiceNumber: string | null; appliedAmount: number }>;
  totalApplied: number;
};

const RECONCILIATION_LEVEL_LABEL: Record<ReconciledPaymentRow["level"], string> = {
  reconciled_with_receipt: "Conciliado con recibo",
  full_reconciliation: "Conciliación completa",
};

function formatMovementDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("es-UY", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-UY", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function bankConsultHref(companyId: string, movementId: string): string {
  return buildBankMovementConsultHref({
    movementId,
    clientReturnTo: `from=client360&clientId=${companyId}&tab=identificacion`,
  });
}

/**
 * FASE CLIENT-BANKING-IDENTIFICATION-CLARITY-AND-HISTORY-CLEANUP-001
 * Resumen activo primero; correcciones colapsadas; forma habitual sin revocadas.
 */
export function ClientPayerMemorySection({ companyId }: { companyId: string }) {
  const [summary, setSummary] = useState<ClientBankingSummary | null>(null);
  const [howAppears, setHowAppears] = useState<ClientBankingHowAppears | null>(null);
  const [habitual, setHabitual] = useState<HabitualPaymentPattern | null>(null);
  const [activeHistory, setActiveHistory] = useState<ClientBankingAssociationRow[]>([]);
  const [correctionsGrouped, setCorrectionsGrouped] = useState<CorrectionsGroup[]>([]);
  const [correctionsOpen, setCorrectionsOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({});
  const [reconciledPayments, setReconciledPayments] = useState<ReconciledPaymentRow[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/copilot/clients/${companyId}/payer-memory`);
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        summary?: ClientBankingSummary;
        howAppears?: ClientBankingHowAppears;
        habitualPayment?: HabitualPaymentPattern;
        activeHistory?: ClientBankingAssociationRow[];
        correctionsGrouped?: CorrectionsGroup[];
        reconciledPayments?: ReconciledPaymentRow[];
      };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "No se pudo cargar la memoria de pagos.");
        return;
      }
      setSummary(json.summary ?? null);
      setHowAppears(json.howAppears ?? null);
      setHabitual(json.habitualPayment ?? null);
      setActiveHistory(json.activeHistory ?? []);
      setCorrectionsGrouped(json.correctionsGrouped ?? []);
      setReconciledPayments(json.reconciledPayments ?? []);
    } catch {
      setError("No se pudo cargar la memoria de pagos.");
    } finally {
      setReady(true);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!ready) {
    return <p className={`${copilotCaptionClass} px-5 py-3`}>Cargando pagos bancarios…</p>;
  }

  if (error) {
    return (
      <p className="px-5 py-3 text-sm text-[var(--copilot-danger-text-strong)]">{error}</p>
    );
  }

  const correctionsCount = correctionsGrouped.reduce((n, g) => n + g.count, 0);
  const empty =
    (summary?.activeCount ?? 0) === 0 &&
    correctionsCount === 0 &&
    reconciledPayments.length === 0;

  if (empty) {
    return (
      <div className="px-5 py-4" data-client-banking-empty>
        <h3 className="text-sm font-semibold text-[var(--copilot-text)]">Resumen bancario</h3>
        <p className={`${copilotCaptionClass} mt-2`}>
          Todavía no hay movimientos bancarios asociados activamente a este cliente.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 px-5 py-4" data-client-banking-clarity>
      {/* 1. Resumen bancario */}
      {summary ? (
        <section data-client-banking-summary>
          <h3 className="text-sm font-semibold text-[var(--copilot-text)]">Resumen bancario</h3>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Metric label="Movimientos activos" value={String(summary.activeCount)} />
            <Metric
              label="Total UYU"
              value={summary.totalUyu > 0 ? summary.totalUyu.toLocaleString("es-UY") : "—"}
            />
            <Metric
              label="Total USD"
              value={summary.totalUsd > 0 ? summary.totalUsd.toLocaleString("es-UY") : "—"}
            />
            <Metric label="Primera transferencia" value={formatMovementDate(summary.firstTransferDate)} />
            <Metric label="Última transferencia" value={formatMovementDate(summary.lastTransferDate)} />
            <Metric
              label="Estado"
              value={summary.confidenceLabel}
            />
          </div>
          {summary.currencies.length > 0 ? (
            <p className={`${copilotCaptionClass} mt-2`}>
              Monedas utilizadas: {summary.currencies.join(" · ")}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* 2. Cómo aparece en Santander */}
      {howAppears && (howAppears.observedNames.length > 0 || howAppears.frequentDescription) ? (
        <section data-client-banking-how-appears>
          <h3 className="text-sm font-semibold text-[var(--copilot-text)]">Cómo aparece en Santander</h3>
          <dl className="mt-2 space-y-2 text-sm">
            {howAppears.observedNames.length > 0 ? (
              <div>
                <dt className={copilotMetricLabelClass}>Nombre observado</dt>
                <dd className="font-medium text-[var(--copilot-text)]">
                  {howAppears.observedNames.join(" / ")}
                </dd>
              </div>
            ) : null}
            {howAppears.frequentDescription ? (
              <div>
                <dt className={copilotMetricLabelClass}>Descripción frecuente</dt>
                <dd className={`text-[var(--copilot-text)] ${BANK_MOVEMENT_DESCRIPTION_CLASS}`}>
                  {howAppears.frequentDescription}
                </dd>
              </div>
            ) : null}
            {howAppears.maskedAccount ? (
              <div>
                <dt className={copilotMetricLabelClass}>Cuenta / referencia</dt>
                <dd className="text-[var(--copilot-text)]">{howAppears.maskedAccount}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      {/* 3. Forma habitual de pago — patrón, no eventos */}
      {habitual ? (
        <section data-client-banking-habitual>
          <h3 className="text-sm font-semibold text-[var(--copilot-text)]">Forma habitual de pago</h3>
          <p className={`${copilotCaptionClass} mt-1`}>
            Patrones derivados solo de asociaciones activas. Las revocaciones no cuentan acá.
          </p>
          <div className="mt-2 rounded-xl border border-[var(--copilot-border)] p-3">
            <div className="flex flex-wrap gap-4">
              <Metric label="Estado" value={habitual.statusLabel} />
              <Metric label="Movimientos observados" value={String(habitual.movementCount)} />
              {habitual.currency ? <Metric label="Moneda" value={habitual.currency} /> : null}
              {habitual.amountHint ? <Metric label="Importe" value={habitual.amountHint} /> : null}
            </div>
            {habitual.bankName ? (
              <p className={`${copilotCaptionClass} mt-2`}>Nombre bancario habitual: {habitual.bankName}</p>
            ) : null}
            {habitual.frequentDescription ? (
              <p className={`${copilotCaptionClass} mt-1`}>
                Descripción frecuente: {habitual.frequentDescription}
              </p>
            ) : null}
            <p className={`${copilotCaptionClass} mt-1`}>
              Primera / última: {formatMovementDate(habitual.firstSeen)} ·{" "}
              {formatMovementDate(habitual.lastSeen)}
            </p>
          </div>
        </section>
      ) : null}

      {/* 4. Historial bancario activo */}
      {activeHistory.length > 0 ? (
        <section data-client-banking-active-history>
          <h3 className="text-sm font-semibold text-[var(--copilot-text)]">Historial bancario activo</h3>
          <div className="mt-2 hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--copilot-border)] text-left text-xs text-[var(--copilot-muted)]">
                  <th className="py-2 pr-2">Fecha movimiento</th>
                  <th className="py-2 pr-2">Descripción Santander</th>
                  <th className="py-2 pr-2">Importe</th>
                  <th className="py-2 pr-2">Estado</th>
                  <th className="py-2 pr-2 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {activeHistory.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--copilot-border)]/50 align-top">
                    <td className="py-2 pr-2 whitespace-nowrap">{formatMovementDate(row.movementDate)}</td>
                    <td className={`py-2 pr-2 ${BANK_MOVEMENT_DESCRIPTION_CLASS}`}>
                      {row.displayDescription}
                      {row.associatedAt ? (
                        <span className={`mt-1 block ${copilotCaptionClass}`}>
                          Asociado el {formatDateTime(row.associatedAt)}
                          {row.confirmedByEmail ? ` por ${row.confirmedByEmail}` : ""}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2 whitespace-nowrap">{row.amountLabel ?? "—"}</td>
                    <td className="py-2 pr-2">Asociado</td>
                    <td className="py-2 pr-2 text-right">
                      <a
                        href={bankConsultHref(companyId, row.movementId)}
                        className="font-medium text-[var(--copilot-accent)] hover:underline"
                        data-bank-ver-en-banco={row.movementId}
                      >
                        Ver en Banco
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-2 space-y-2 sm:hidden">
            {activeHistory.map((row) => (
              <li
                key={row.id}
                className="rounded-xl border border-[var(--copilot-border)] p-3 text-sm"
                data-client-banking-active-card={row.movementId}
              >
                <p className="font-semibold text-[var(--copilot-text)]">
                  {formatMovementDate(row.movementDate)} · {row.amountLabel ?? "—"}
                </p>
                <p className={`mt-1 ${BANK_MOVEMENT_DESCRIPTION_CLASS}`}>{row.displayDescription}</p>
                <p className={copilotCaptionClass}>Asociado</p>
                {row.associatedAt ? (
                  <p className={copilotCaptionClass}>
                    Asociado el {formatDateTime(row.associatedAt)}
                    {row.confirmedByEmail ? ` por ${row.confirmedByEmail}` : ""}
                  </p>
                ) : null}
                <a
                  href={bankConsultHref(companyId, row.movementId)}
                  className="mt-2 inline-block text-sm font-medium text-[var(--copilot-accent)] hover:underline"
                  data-bank-ver-en-banco={row.movementId}
                >
                  Ver en Banco
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 5. Pagos conciliados (recibo real) */}
      {reconciledPayments.length > 0 ? (
        <section>
          <h3 className="text-sm font-semibold text-[var(--copilot-text)]">Pagos conciliados</h3>
          <ul className="mt-2 space-y-2">
            {reconciledPayments.map((p) => (
              <li
                key={p.movementId}
                className="rounded-lg border border-[var(--copilot-border)] px-3 py-2 text-xs"
              >
                <span className="font-medium">
                  {formatMovementDate(p.movementDate)} · {p.currency}{" "}
                  {p.movementAmount.toLocaleString("es-UY")}
                </span>
                <span className="text-[var(--copilot-muted)]">
                  {" "}
                  · {RECONCILIATION_LEVEL_LABEL[p.level]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 6. Correcciones anteriores (colapsadas) */}
      {correctionsCount > 0 ? (
        <section data-client-banking-corrections>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-xl border border-[var(--copilot-border)] px-3 py-2 text-left"
            aria-expanded={correctionsOpen}
            onClick={() => setCorrectionsOpen((o) => !o)}
            data-client-banking-corrections-toggle
          >
            <span className="text-sm font-semibold text-[var(--copilot-text)]">
              Correcciones anteriores ({correctionsCount})
            </span>
            <span className={copilotCaptionClass}>{correctionsOpen ? "Ocultar" : "Mostrar"}</span>
          </button>
          {correctionsOpen ? (
            <div className="mt-2 space-y-2">
              {correctionsGrouped.map((group) => (
                <div key={group.key} className="rounded-xl border border-[var(--copilot-border)]">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm"
                    aria-expanded={Boolean(groupOpen[group.key])}
                    onClick={() =>
                      setGroupOpen((prev) => ({ ...prev, [group.key]: !prev[group.key] }))
                    }
                  >
                    <span className="font-medium text-[var(--copilot-text)]">{group.label}</span>
                    <span className={copilotCaptionClass}>
                      {groupOpen[group.key] ? "Ocultar detalle" : "Ver detalle"}
                    </span>
                  </button>
                  {groupOpen[group.key] ? (
                    <ul className="space-y-2 border-t border-[var(--copilot-border)] px-3 py-2">
                      {group.items.map((row) => (
                        <li key={row.id} className="rounded-lg bg-[var(--copilot-soft-bg)] px-3 py-2 text-xs">
                          <p className="font-medium text-[var(--copilot-text)]">
                            {formatMovementDate(row.movementDate)} · {row.amountLabel ?? "—"} · Revocado
                          </p>
                          <p className={`mt-1 ${BANK_MOVEMENT_DESCRIPTION_CLASS}`}>
                            {row.displayDescription}
                          </p>
                          <p className={copilotCaptionClass}>
                            Asociado
                            {row.confirmedByEmail ? ` por ${row.confirmedByEmail}` : ""}
                            {row.associatedAt ? ` el ${formatDateTime(row.associatedAt)}` : ""}
                          </p>
                          <p className={copilotCaptionClass}>
                            Revocado
                            {row.revokedByEmail ? ` por ${row.revokedByEmail}` : ""}
                            {row.revokedAt ? ` el ${formatDateTime(row.revokedAt)}` : ""}
                          </p>
                          {row.reason ? (
                            <p className={copilotCaptionClass}>Motivo: {row.reason}</p>
                          ) : null}
                          <a
                            href={bankConsultHref(companyId, row.movementId)}
                            className="mt-1 inline-block font-medium text-[var(--copilot-accent)] hover:underline"
                          >
                            Ver en Banco
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className={copilotMetricLabelClass}>{label}</p>
      <p className="text-sm font-semibold text-[var(--copilot-text)]">{value}</p>
    </div>
  );
}
