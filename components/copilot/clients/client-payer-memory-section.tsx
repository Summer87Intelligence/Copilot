"use client";

import { useCallback, useEffect, useState } from "react";

import {
  copilotCaptionClass,
  copilotMetricLabelClass,
} from "@/components/copilot/ui/copilot-visual-system";
import {
  derivePayerIdentityDisplayStatus,
  type ClientPayerLinkStatus,
  type PayerIdentityDisplayStatus,
} from "@/lib/bank/canonical/payer-identity";

type PayerCard = {
  linkId: string;
  originalName: string | null;
  normalizedName: string | null;
  maskedAccount: string | null;
  bankName: string | null;
  usualCurrency: string | null;
  confirmations: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  displayStatus: PayerIdentityDisplayStatus;
};

type HistoryRow = {
  linkId: string;
  date: string | null;
  amountLabel: string | null;
  payerName: string | null;
  maskedReference: string | null;
  receiptLabel: string | null;
  modeLabel: string;
  statusLabel: string;
};

type ApiRow = {
  linkId: string;
  linkStatus: string;
  confirmations: number;
  bankName: string | null;
  originalName: string | null;
  normalizedName: string | null;
  maskedAccount: string | null;
  usualCurrency: string | null;
  linkFirstSeenAt: string | null;
  linkLastSeenAt: string | null;
  linkedToOtherClients: boolean;
};

type IdentificationRow = {
  id: string;
  movementId: string;
  date: string | null;
  amountLabel: string | null;
  status: string;
  reason: string | null;
  confirmedAt: string | null;
  actorEmail: string | null;
};

type ReconciledPaymentRow = {
  movementId: string;
  movementDate: string;
  movementAmount: number;
  currency: string;
  receiptId: string;
  receiptAmount: number;
  level: "reconciled_with_receipt" | "full_reconciliation";
  appliedInvoices: Array<{ invoiceId: string; invoiceNumber: string | null; appliedAmount: number }>;
  totalApplied: number;
};

const RECONCILIATION_LEVEL_LABEL: Record<ReconciledPaymentRow["level"], string> = {
  reconciled_with_receipt: "Conciliado con recibo",
  full_reconciliation: "Conciliación completa",
};

const IDENTIFICATION_STATUS_LABEL: Record<string, string> = {
  identified: "Cliente identificado",
  shared_account: "Cuenta compartida",
  third_party: "Pago de tercero",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-UY", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

/**
 * FASE BANK-SIMPLE-RECONCILIATION-AND-PAYER-MEMORY-001 — sección read-only
 * "Pagos y cuentas utilizadas" en Cliente 360. No escribe nada.
 * Acciones de corrección quedan documentadas para fase posterior (deshabilitadas).
 */
export function ClientPayerMemorySection({ companyId }: { companyId: string }) {
  const [cards, setCards] = useState<PayerCard[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [identificationsOnly, setIdentificationsOnly] = useState<IdentificationRow[]>([]);
  const [reconciledPayments, setReconciledPayments] = useState<ReconciledPaymentRow[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/copilot/clients/${companyId}/payer-memory`);
      const json = (await res.json()) as {
        ok?: boolean;
        identities?: ApiRow[];
        history?: HistoryRow[];
        identificationsOnly?: IdentificationRow[];
        reconciledPayments?: ReconciledPaymentRow[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "No se pudo cargar la memoria de pagos.");
        setCards([]);
        setHistory([]);
        setIdentificationsOnly([]);
        setReconciledPayments([]);
        return;
      }
      const identities = json.identities ?? [];
      setCards(
        identities.map((row) => ({
          linkId: row.linkId,
          originalName: row.originalName,
          normalizedName: row.normalizedName,
          maskedAccount: row.maskedAccount,
          bankName: row.bankName,
          usualCurrency: row.usualCurrency,
          confirmations: row.confirmations,
          firstSeenAt: row.linkFirstSeenAt,
          lastSeenAt: row.linkLastSeenAt,
          displayStatus: derivePayerIdentityDisplayStatus({
            status: row.linkStatus as ClientPayerLinkStatus,
            confirmations: row.confirmations,
            linkedToOtherClients: row.linkedToOtherClients,
          }),
        }))
      );
      setHistory(json.history ?? []);
      setIdentificationsOnly(json.identificationsOnly ?? []);
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

  if (cards.length === 0 && identificationsOnly.length === 0 && reconciledPayments.length === 0) {
    return (
      <div className="px-5 py-4">
        <h3 className="text-sm font-semibold text-[var(--copilot-text)]">Pagos y cuentas utilizadas</h3>
        <p className={`${copilotCaptionClass} mt-2`}>
          Todavía no hay pagos bancarios confirmados para este cliente.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-5 py-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--copilot-text)]">Pagos y cuentas utilizadas</h3>
        <p className={`${copilotCaptionClass} mt-1`}>
          Cómo suele pagar este cliente. Solo lectura — las correcciones de asociación se habilitarán
          en una fase posterior.
        </p>
      </div>

      {identificationsOnly.length > 0 ? (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">
            Movimientos identificados sin conciliación financiera
          </h4>
          <p className={`${copilotCaptionClass} mt-1`}>
            El cliente fue identificado para estos movimientos, pero todavía no hay un recibo/factura
            vinculado en Zeta — nunca se afirma &ldquo;conciliado&rdquo; ni &ldquo;factura pagada&rdquo; acá.
          </p>
          <ul className="mt-2 space-y-2">
            {identificationsOnly.map((row) => (
              <li
                key={row.id}
                className="rounded-lg border border-[var(--copilot-border)] px-3 py-2 text-xs text-[var(--copilot-text)]"
              >
                <span className="font-medium">{formatDate(row.date)}</span>
                {row.amountLabel ? ` · ${row.amountLabel}` : ""}
                <span className="text-[var(--copilot-muted)]">
                  {" "}
                  · {IDENTIFICATION_STATUS_LABEL[row.status] ?? row.status}
                </span>
                {row.reason ? <span className="text-[var(--copilot-muted)]"> · {row.reason}</span> : null}
                {row.actorEmail ? <span className="text-[var(--copilot-muted)]"> · {row.actorEmail}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {reconciledPayments.length > 0 ? (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">
            Pagos conciliados
          </h4>
          <p className={`${copilotCaptionClass} mt-1`}>
            Movimiento vinculado a un recibo real de Zeta. &ldquo;Conciliación completa&rdquo; solo cuando hay
            facturas realmente aplicadas — nunca por coincidencia de importe.
          </p>
          <ul className="mt-2 space-y-2">
            {reconciledPayments.map((p) => (
              <li
                key={p.movementId}
                className="rounded-lg border border-[var(--copilot-border)] px-3 py-2 text-xs text-[var(--copilot-text)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {formatDate(p.movementDate)} · {p.currency} {p.movementAmount.toLocaleString("es-UY")}
                  </span>
                  <span className="text-[var(--copilot-muted)]">{RECONCILIATION_LEVEL_LABEL[p.level]}</span>
                </div>
                {p.appliedInvoices.length > 0 ? (
                  <p className="mt-1 text-[var(--copilot-muted)]">
                    Facturas aplicadas:{" "}
                    {p.appliedInvoices
                      .map((inv) => `${inv.invoiceNumber ?? inv.invoiceId} (${p.currency} ${inv.appliedAmount.toLocaleString("es-UY")})`)
                      .join(", ")}{" "}
                    · Total aplicado: {p.currency} {p.totalApplied.toLocaleString("es-UY")}
                  </p>
                ) : (
                  <p className="mt-1 text-[var(--copilot-muted)]">
                    No encontramos una aplicación de este recibo a facturas en Zeta.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {cards.length > 0 ? (
      <ul className="grid gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <li
            key={card.linkId}
            className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-3"
          >
            <p className="text-sm font-semibold text-[var(--copilot-text)]">
              {card.originalName ?? card.normalizedName ?? "Pagador sin nombre"}
            </p>
            <p className={copilotCaptionClass}>
              {[card.maskedAccount, card.bankName, card.usualCurrency].filter(Boolean).join(" · ") ||
                "Sin cuenta enmascarada"}
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              <div>
                <p className={copilotMetricLabelClass}>Estado</p>
                <p className="text-sm font-medium text-[var(--copilot-text)]">{card.displayStatus}</p>
              </div>
              <div>
                <p className={copilotMetricLabelClass}>Pagos confirmados</p>
                <p className="text-sm font-medium text-[var(--copilot-text)]">{card.confirmations}</p>
              </div>
              <div>
                <p className={copilotMetricLabelClass}>Primera / última</p>
                <p className="text-sm font-medium text-[var(--copilot-text)]">
                  {formatDate(card.firstSeenAt)} · {formatDate(card.lastSeenAt)}
                </p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled
                title="Corrección de aprendizaje: fase posterior (append-only, sin tocar movimiento/recibo)."
                className="cursor-not-allowed rounded-md border border-[var(--copilot-border)] px-2 py-1 text-[10px] text-[var(--copilot-muted)] opacity-60"
              >
                Corregir asociación
              </button>
              <button
                type="button"
                disabled
                title="Marcar pago de tercero: fase posterior."
                className="cursor-not-allowed rounded-md border border-[var(--copilot-border)] px-2 py-1 text-[10px] text-[var(--copilot-muted)] opacity-60"
              >
                Pago de tercero
              </button>
            </div>
          </li>
        ))}
      </ul>
      ) : null}

      {history.length > 0 ? (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">
            Historial de conciliaciones
          </h4>
          <ul className="mt-2 space-y-2">
            {history.map((row) => (
              <li
                key={row.linkId}
                className="rounded-lg border border-[var(--copilot-border)] px-3 py-2 text-xs text-[var(--copilot-text)]"
              >
                <span className="font-medium">{formatDate(row.date)}</span>
                {row.amountLabel ? ` · ${row.amountLabel}` : ""}
                {row.payerName ? ` · ${row.payerName}` : ""}
                {row.maskedReference ? ` · ${row.maskedReference}` : ""}
                {row.receiptLabel ? ` · ${row.receiptLabel}` : ""}
                <span className="text-[var(--copilot-muted)]">
                  {" "}
                  · {row.modeLabel} · {row.statusLabel}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
