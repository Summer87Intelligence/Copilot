"use client";

import { useEffect, useReducer } from "react";
import type { ClientPaymentProfile, InvoicePaymentProjection } from "@/lib/payment-behavior/payment-behavior-engine";
import { formatTreasuryMoney } from "@/lib/treasury/treasury-dashboard";
import type { TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";

function fmt(amount: number, currency: string): string {
  return formatTreasuryMoney(amount, currency as TreasuryCurrencyCode);
}

function fmtDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${day} ${months[(month ?? 1) - 1]}. ${year}`;
}

type State = {
  loading: boolean;
  profiles: ClientPaymentProfile[];
  projections: InvoicePaymentProjection[];
};

function reducer(
  state: State,
  action:
    | { type: "LOADING" }
    | { type: "OK"; profiles: ClientPaymentProfile[]; projections: InvoicePaymentProjection[] }
    | { type: "ERR" }
): State {
  if (action.type === "LOADING") return { ...state, loading: true };
  if (action.type === "OK") return { loading: false, profiles: action.profiles, projections: action.projections };
  return { ...state, loading: false };
}

function regularityLabel(r: ClientPaymentProfile["paymentRegularity"]): string {
  if (r === "stable") return "Estable";
  if (r === "normal") return "Normal";
  if (r === "irregular") return "Irregular";
  return "Sin datos";
}

function regularityColor(r: ClientPaymentProfile["paymentRegularity"]): string {
  if (r === "stable") return "text-[var(--copilot-success-text)] bg-[var(--copilot-badge-success-bg)]";
  if (r === "normal") return "text-sky-700 bg-sky-100";
  if (r === "irregular") return "text-[var(--copilot-warning-text)] bg-[var(--copilot-badge-warning-bg)]";
  return "text-neutral-500 bg-neutral-100";
}

function regularityNarrative(r: ClientPaymentProfile["paymentRegularity"]): string {
  if (r === "stable") return "Sus pagos son muy consistentes.";
  if (r === "normal") return "Sus pagos son razonablemente regulares.";
  if (r === "irregular") return "Sus tiempos de pago son variables.";
  return "Historial insuficiente para determinar un patrón.";
}

function confidenceLabel(c: ClientPaymentProfile["confidence"]): string {
  if (c === "high") return "alta";
  if (c === "medium") return "media";
  if (c === "low") return "baja";
  return "sin historial";
}

function confidenceBadgeClass(c: ClientPaymentProfile["confidence"]): string {
  if (c === "high")
    return "text-[var(--copilot-badge-success-text)] bg-[var(--copilot-badge-success-bg)] border-[var(--copilot-border)]";
  if (c === "medium")
    return "text-[var(--copilot-badge-warning-text)] bg-[var(--copilot-badge-warning-bg)] border-[var(--copilot-border)]";
  if (c === "low")
    return "text-[var(--copilot-badge-danger-text)] bg-[var(--copilot-badge-danger-bg)] border-[var(--copilot-border)]";
  return "text-[var(--copilot-ink-muted)] bg-[var(--copilot-badge-neutral-bg)] border-[var(--copilot-border)]";
}

function paymentRangeSentence(profile: ClientPaymentProfile): string | null {
  const median = profile.medianDaysToPay;
  const avg = profile.avgDaysToPay;
  if (median === null && avg === null) return null;
  const m = median !== null ? Math.round(median) : Math.round(avg!);
  const a = avg !== null ? Math.round(avg) : m;
  const lo = Math.min(m, a);
  const hi = Math.max(m, a);
  if (hi - lo <= 3) return `Suele pagar en ~${m} días después de facturar.`;
  return `Suele pagar entre ${lo} y ${hi} días después de facturar.`;
}

export function ClientPaymentBehaviorCard({ companyId }: { companyId: string }) {
  const [state, dispatch] = useReducer(reducer, { loading: true, profiles: [], projections: [] });

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    dispatch({ type: "LOADING" });

    fetch(`/api/copilot/payment-behavior/projection?client_id=${encodeURIComponent(companyId)}`)
      .then((r) => r.json() as Promise<{ ok: boolean; profiles: ClientPaymentProfile[]; projections: InvoicePaymentProjection[] }>)
      .then((data) => {
        if (cancelled) return;
        dispatch({
          type: "OK",
          profiles: data.ok ? (data.profiles ?? []) : [],
          projections: data.ok ? (data.projections ?? []) : [],
        });
      })
      .catch(() => { if (!cancelled) dispatch({ type: "ERR" }); });

    return () => { cancelled = true; };
  }, [companyId]);

  if (state.loading) {
    return (
      <div className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]">
          Comportamiento de pago
        </p>
        <div className="space-y-2">
          <div className="h-3 w-36 animate-pulse rounded bg-[var(--copilot-border)]/60" />
          <div className="h-3 w-24 animate-pulse rounded bg-[var(--copilot-border)]/60" />
        </div>
      </div>
    );
  }

  if (state.profiles.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4">
        <p className="mb-1 text-xs font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]">
          Comportamiento de pago
        </p>
        <p className="text-xs text-[var(--copilot-ink-muted)]">Sin historial de cobros para este cliente.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4 shadow-sm">
      <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]">
        Comportamiento de pago
      </p>
      <div className="space-y-4">
        {state.profiles.map((profile) => {
          const openProjections = state.projections
            .filter((p) => p.clientId === companyId && p.currency === profile.currency)
            .sort((a, b) => a.predictedPaymentDate.localeCompare(b.predictedPaymentDate));
          const nextProjection = openProjections[0] ?? null;
          const extraCount = openProjections.length - 1;
          const rangeSentence = paymentRangeSentence(profile);

          return (
            <div key={profile.currency} className="space-y-2.5">
              {/* Currency + regularity */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[var(--copilot-ink)]">{profile.currency}</span>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${regularityColor(profile.paymentRegularity)}`}>
                  {regularityLabel(profile.paymentRegularity)}
                </span>
              </div>

              {/* Main sentence */}
              {rangeSentence ? (
                <p className="text-[13px] font-medium leading-snug text-[var(--copilot-ink)]">
                  {rangeSentence}
                </p>
              ) : (
                <p className="text-xs text-[var(--copilot-ink-muted)]">Sin historial de tiempos de pago.</p>
              )}

              {/* Regularity narrative + confidence badge */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-[var(--copilot-ink-muted)]">
                  {regularityNarrative(profile.paymentRegularity)}
                </span>
                <span className={`inline-flex shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${confidenceBadgeClass(profile.confidence)}`}>
                  Confiabilidad {confidenceLabel(profile.confidence)}
                </span>
              </div>

              {/* Próximo cobro probable — bloque principal */}
              {nextProjection && (
                <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] px-3 py-2.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]">
                    Próximo cobro probable
                  </p>
                  <p className="mt-1 text-lg font-bold tabular-nums leading-none text-[var(--copilot-ink)]">
                    {fmt(nextProjection.expectedAmount, nextProjection.currency)}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
                    Estimado para el {fmtDate(nextProjection.predictedPaymentDate)}
                    {extraCount > 0 && (
                      <span className="ml-1">· y {extraCount} factura{extraCount > 1 ? "s" : ""} más</span>
                    )}
                  </p>
                </div>
              )}

              {/* Stats secundarias */}
              {(profile.medianDaysToPay !== null || profile.historicalRecoveryRate !== null) && (
                <dl className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-[var(--copilot-ink-muted)]">
                  {profile.medianDaysToPay !== null && (
                    <div className="flex gap-1">
                      <dt>Mediana</dt>
                      <dd className="font-medium tabular-nums">{Math.round(profile.medianDaysToPay)} días</dd>
                    </div>
                  )}
                  {profile.historicalRecoveryRate !== null && (
                    <div className="flex gap-1">
                      <dt>Cobro histórico</dt>
                      <dd className="font-medium tabular-nums">{Math.round(profile.historicalRecoveryRate * 100)}%</dd>
                    </div>
                  )}
                </dl>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
