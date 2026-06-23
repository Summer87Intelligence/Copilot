"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";

import { useDisplayCurrency } from "@/components/copilot/display-currency-provider";
import { useRegistrarCobro } from "@/hooks/use-registrar-cobro";
import type { CobranzaClientRow } from "@/lib/copilot-cobranza-summary";
import {
  COBRANZA_REGISTRAR_COBRO_TRUST_COPY,
  buildInitialRegistrarCobroFormFromPrefill,
  formatRegistrarCobroWarnings,
  todayYmdLocal,
  validateRegistrarCobroForm,
  type RegistrarCobroFormValues,
  type RegistrarCobroPrefill,
} from "@/lib/cobranza/registrar-cobro-client";
import { fetchTreasuryAccounts } from "@/lib/treasury/treasury-client";
import type { TreasuryAccount } from "@/lib/treasury/treasury-types";

export type RegistrarCobroDrawerPrefill = RegistrarCobroPrefill & {
  companyName?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  clients: CobranzaClientRow[];
  prefill?: RegistrarCobroDrawerPrefill | null;
  onSuccess?: () => void;
  onToast?: (message: string, tone: "success" | "error" | "warning") => void;
};

export function RegistrarCobroDrawer({
  open,
  onClose,
  clients,
  prefill,
  onSuccess,
  onToast,
}: Props) {
  const { fxRate } = useDisplayCurrency();
  const { submit, submitting } = useRegistrarCobro();
  const clientRequestIdRef = useRef<string>("");
  const [values, setValues] = useState<RegistrarCobroFormValues>(() =>
    buildInitialRegistrarCobroFormFromPrefill(null)
  );
  const [fieldErrors, setFieldErrors] = useState<ReturnType<typeof validateRegistrarCobroForm>>(
    {}
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [treasuryAccounts, setTreasuryAccounts] = useState<TreasuryAccount[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);

  const today = todayYmdLocal();
  const lockedClient = Boolean(prefill?.companyId);

  useEffect(() => {
    if (!open) return;
    clientRequestIdRef.current = crypto.randomUUID();
    setValues(buildInitialRegistrarCobroFormFromPrefill(prefill, today, fxRate));
    setFieldErrors({});
    setFormError(null);
  }, [open, prefill, today, fxRate]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const result = await fetchTreasuryAccounts();
      if (cancelled) return;
      setAccountsLoaded(true);
      if (result.ok) {
        setTreasuryAccounts(result.data.items.filter((a) => a.active));
      } else {
        setTreasuryAccounts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  function setField<K extends keyof RegistrarCobroFormValues>(
    key: K,
    value: RegistrarCobroFormValues[K]
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const errors = validateRegistrarCobroForm(values, today);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const result = await submit(values, clientRequestIdRef.current);
    if (!result.ok) {
      setFormError(result.message);
      onToast?.(result.message, "error");
      return;
    }

    const warningText = formatRegistrarCobroWarnings(result.warnings);
    onToast?.(
      warningText ? `${result.message} ${warningText}` : result.message,
      warningText ? "warning" : "success"
    );
    onSuccess?.();
    onClose();
  }

  const selectedClient = clients.find((c) => c.companyId === values.companyId);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={submitting ? undefined : onClose}
        aria-hidden
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Registrar cobro"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-[var(--copilot-border)] bg-[var(--copilot-card)] shadow-2xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--copilot-border)] px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[var(--copilot-ink)]">Registrar cobro</h2>
            {lockedClient && prefill?.companyName ? (
              <p className="mt-0.5 truncate text-xs text-[var(--copilot-ink-muted)]">
                {prefill.companyName}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
                Impacta Tesorería · no modifica facturas
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Cerrar"
            className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 transition hover:bg-[var(--copilot-panel-bg)] disabled:opacity-60"
          >
            <X className="h-4 w-4 text-[var(--copilot-ink-muted)]" aria-hidden />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
            <p
              className="rounded-xl border border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)]/50 px-3 py-2.5 text-xs leading-relaxed text-[var(--copilot-warning-text-strong)]"
              role="note"
            >
              {COBRANZA_REGISTRAR_COBRO_TRUST_COPY}
            </p>

            <Field label="Cliente" required error={fieldErrors.companyId}>
              {lockedClient ? (
                <input
                  type="text"
                  readOnly
                  value={prefill?.companyName ?? selectedClient?.name ?? values.companyId}
                  className={[inputCls, "bg-[var(--copilot-panel-bg)]"].join(" ")}
                />
              ) : (
                <select
                  value={values.companyId}
                  onChange={(e) => setField("companyId", e.target.value)}
                  className={selectCls}
                  required
                >
                  <option value="">Seleccionar cliente…</option>
                  {clients.map((c) => (
                    <option key={c.companyId} value={c.companyId}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <Field label="Fecha de cobro" required error={fieldErrors.paymentDate}>
              <input
                type="date"
                value={values.paymentDate}
                max={today}
                onChange={(e) => setField("paymentDate", e.target.value)}
                className={inputCls}
                required
              />
            </Field>

            <div className="flex gap-3">
              <div className="min-w-0 flex-1">
                <Field label="Monto" required error={fieldErrors.amount}>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={values.amount}
                    onChange={(e) => setField("amount", e.target.value)}
                    className={inputCls}
                    required
                  />
                </Field>
              </div>
              <div className="w-28 shrink-0">
                <Field label="Moneda" required error={fieldErrors.currencyCode}>
                  <select
                    value={values.currencyCode}
                    onChange={(e) =>
                      setField("currencyCode", e.target.value as RegistrarCobroFormValues["currencyCode"])
                    }
                    className={selectCls}
                    required
                  >
                    <option value="UYU">UYU</option>
                    <option value="USD">USD</option>
                  </select>
                </Field>
              </div>
            </div>

            <Field label="Banco origen" error={fieldErrors.bankOrigin}>
              <input
                type="text"
                value={values.bankOrigin}
                onChange={(e) => setField("bankOrigin", e.target.value)}
                placeholder="Ej. Santander, BROU…"
                maxLength={120}
                className={inputCls}
              />
            </Field>

            {accountsLoaded && treasuryAccounts.length > 0 ? (
              <Field label="Cuenta destino">
                <select
                  value={values.accountId}
                  onChange={(e) => setField("accountId", e.target.value)}
                  className={selectCls}
                >
                  <option value="">Sin cuenta específica</option>
                  {treasuryAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currencyCode})
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            <Field label="Referencia" error={fieldErrors.reference}>
              <input
                type="text"
                value={values.reference}
                onChange={(e) => setField("reference", e.target.value)}
                placeholder="Nº transferencia, recibo…"
                maxLength={200}
                className={inputCls}
              />
            </Field>

            <Field label="Observaciones" error={fieldErrors.notes}>
              <textarea
                value={values.notes}
                onChange={(e) => setField("notes", e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Notas internas del cobro…"
                className={[inputCls, "resize-none"].join(" ")}
              />
            </Field>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-panel-bg)]/60 px-3 py-3">
              <input
                type="checkbox"
                checked={values.affectsCashflow}
                onChange={(e) => setField("affectsCashflow", e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-[var(--copilot-border)] text-[var(--copilot-accent)] focus:ring-[var(--copilot-accent)]"
              />
              <span className="text-sm text-[var(--copilot-ink)]">
                Afecta caja
                <span className="mt-0.5 block text-xs font-normal text-[var(--copilot-ink-muted)]">
                  El ingreso se suma a la posición de efectivo en Tesorería.
                </span>
              </span>
            </label>

            {formError ? (
              <p
                role="alert"
                className="rounded-lg border border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] px-3 py-2 text-xs text-[var(--copilot-danger-text-strong)]"
              >
                {formError}
              </p>
            ) : null}
          </div>

          <footer className="sticky bottom-0 shrink-0 border-t border-[var(--copilot-border)] bg-[var(--copilot-card)] px-4 py-3 sm:px-5 sm:py-4">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 text-sm font-medium text-[var(--copilot-ink-muted)] transition hover:bg-[var(--copilot-panel-bg)] disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--copilot-accent)] text-sm font-semibold text-[var(--copilot-on-accent)] transition hover:opacity-90 disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Registrando…
                  </>
                ) : (
                  "Registrar cobro"
                )}
              </button>
            </div>
          </footer>
        </form>
      </aside>
    </>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--copilot-ink-muted)]">
        {label}
        {required ? <span className="ml-0.5 text-[var(--copilot-danger-text)]">*</span> : null}
      </span>
      {children}
      {error ? (
        <p className="text-[11px] text-[var(--copilot-danger-text-strong)]">{error}</p>
      ) : null}
    </div>
  );
}

const inputCls =
  "w-full min-h-[44px] rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-3 py-2.5 text-base sm:text-sm text-[var(--copilot-ink)] shadow-sm transition placeholder:text-[var(--copilot-ink-muted)] focus:border-[var(--copilot-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--copilot-accent)]/20";

const selectCls =
  "w-full min-h-[44px] rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-3 py-2.5 text-base sm:text-sm text-[var(--copilot-ink)] shadow-sm transition focus:border-[var(--copilot-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--copilot-accent)]/20";
