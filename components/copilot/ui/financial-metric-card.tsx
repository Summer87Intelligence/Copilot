"use client";

import { type KeyboardEvent, type ReactNode } from "react";
import { ArrowRight, Info } from "lucide-react";
import Link from "next/link";

import {
  metricFootnoteToneClass,
  metricValueToneClass,
  sortMetricCurrencyValues,
  type MetricCurrencyValue,
  type MetricTone,
} from "@/lib/ui/financial-metric-card-model";

/**
 * FinancialMetricCard (DS-Core) — card de métrica financiera ÚNICA.
 *
 * Consolida las tres implementaciones divergentes (Hoy cockpit, Dashboard KPIs,
 * Cobranza KPIs). Reglas:
 *  - UYU y USD apilados y separados (nunca combinados en una línea).
 *  - Una sola estructura: label → valor → nota → CTA.
 *  - Altura uniforme entre cards de una misma fila (usar con grid items-stretch).
 */

export type MetricCardCta =
  | { label: string; href: string }
  | { label: string; onClick: () => void };

export type FinancialMetricCardProps = {
  label: string;
  /** Valores por moneda (apilados, UYU primero). Tiene prioridad sobre `value`. */
  values?: readonly MetricCurrencyValue[];
  /** Métrica no monetaria (ej. "36", "0%"). */
  value?: { primary: string; secondary?: string };
  /** Texto cuando no hay datos. */
  emptyText?: string;
  footnote?: { text: string; tone?: MetricTone };
  /** Tooltip informativo (icono i en el header). */
  hint?: string;
  /** Colorea el valor principal. */
  tone?: MetricTone;
  /** Hoy = center; Dashboard/Cobranza = start. */
  align?: "start" | "center";
  cta?: MetricCardCta;
  /** Card entera clickeable (abre drawer/detalle). */
  onClick?: () => void;
  active?: boolean;
  className?: string;
};

const SHELL_CLASS =
  "flex h-full min-h-0 w-full min-w-0 flex-col justify-between gap-3 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-4 shadow-sm transition-shadow";

function CurrencyValues({
  values,
  tone,
  align,
}: {
  values: readonly MetricCurrencyValue[];
  tone: MetricTone;
  align: "start" | "center";
}) {
  const sorted = sortMetricCurrencyValues(values);
  const alignClass = align === "center" ? "items-center text-center" : "items-start text-left";
  return (
    <div className={`flex w-full flex-col gap-2 ${alignClass}`}>
      {sorted.map((v) => {
        const isPrimary = v.currency === "UYU";
        return (
          <div key={v.currency} className={`flex w-full flex-col ${alignClass}`}>
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--copilot-ink-muted)]">
              {v.currency}
            </span>
            <span
              className={`whitespace-nowrap font-semibold tabular-nums tracking-tight ${isPrimary ? "text-[1.5rem]" : "text-[1.15rem] opacity-90"} ${metricValueToneClass(tone)}`}
            >
              {v.formatted}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CtaNode({ cta }: { cta: MetricCardCta }) {
  const base =
    "inline-flex items-center gap-1 text-xs font-semibold text-[var(--copilot-accent)] transition hover:underline";
  if ("href" in cta) {
    return (
      <Link href={cta.href} className={base} onClick={(e) => e.stopPropagation()}>
        {cta.label}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={base}
      onClick={(e) => {
        e.stopPropagation();
        cta.onClick();
      }}
    >
      {cta.label}
      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}

function activateKey(e: KeyboardEvent, onActivate: () => void) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    onActivate();
  }
}

export function FinancialMetricCard({
  label,
  values,
  value,
  emptyText = "—",
  footnote,
  hint,
  tone = "neutral",
  align = "start",
  cta,
  onClick,
  active = false,
  className = "",
}: FinancialMetricCardProps) {
  const interactive = Boolean(onClick);
  const alignClass = align === "center" ? "items-center text-center" : "items-start text-left";

  let body: ReactNode;
  if (values && values.length > 0) {
    body = <CurrencyValues values={values} tone={tone} align={align} />;
  } else if (value) {
    body = (
      <div className={`flex w-full flex-col ${alignClass}`}>
        <span
          className={`whitespace-nowrap text-[1.6rem] font-semibold tabular-nums tracking-tight ${metricValueToneClass(tone)}`}
        >
          {value.primary}
        </span>
        {value.secondary ? (
          <span className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">{value.secondary}</span>
        ) : null}
      </div>
    );
  } else {
    body = <p className="text-sm text-[var(--copilot-ink-muted)]">{emptyText}</p>;
  }

  return (
    <article
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? onClick : undefined}
      onKeyDown={interactive ? (e) => activateKey(e, () => onClick?.()) : undefined}
      className={`${SHELL_CLASS} ${interactive ? "cursor-pointer hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--copilot-accent)]" : ""} ${active ? "ring-2 ring-[var(--copilot-accent)]/40" : ""} ${className}`}
    >
      <header className={`flex w-full items-center gap-1.5 ${align === "center" ? "justify-center" : "justify-between"}`}>
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--copilot-ink-muted)]">
          {label}
        </span>
        {hint ? (
          <span title={hint} className="text-[var(--copilot-ink-muted)]" aria-label={hint}>
            <Info className="h-3.5 w-3.5" aria-hidden />
          </span>
        ) : null}
      </header>

      <div className={`flex flex-1 flex-col justify-center ${alignClass}`}>{body}</div>

      {footnote || cta ? (
        <footer className={`flex w-full flex-col gap-1.5 ${alignClass}`}>
          {footnote ? (
            <p className={`text-xs font-medium leading-snug ${metricFootnoteToneClass(footnote.tone ?? "neutral")}`}>
              {footnote.text}
            </p>
          ) : null}
          {cta ? <CtaNode cta={cta} /> : null}
        </footer>
      ) : null}
    </article>
  );
}
