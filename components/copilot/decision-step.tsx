import type { ReactNode } from "react";

import {
  CopilotCard,
  CopilotPrimaryButton,
  CopilotPrimaryLink,
} from "@/components/copilot/copilot-ui";

type SemanticVariant = "critical" | "warning" | "success" | "neutral";

const variantBox: Record<SemanticVariant, string> = {
  critical:
    "border-rose-300/90 bg-rose-50/95 text-rose-950 ring-1 ring-rose-200/80",
  warning:
    "border-amber-300/90 bg-amber-50/95 text-amber-950 ring-1 ring-amber-200/70",
  success:
    "border-emerald-300/90 bg-emerald-50/95 text-emerald-950 ring-1 ring-emerald-200/70",
  neutral:
    "border-[var(--copilot-border)] bg-white/80 text-[var(--copilot-ink)] ring-1 ring-[rgba(44,40,37,0.06)]",
};

const riskBar: Record<SemanticVariant, string> = {
  critical: "border-l-rose-500 bg-rose-50/90 text-rose-950",
  warning: "border-l-amber-500 bg-amber-50/85 text-amber-950",
  success: "border-l-emerald-500 bg-emerald-50/85 text-emerald-900",
  neutral: "border-l-[var(--copilot-border)] bg-[rgba(44,40,37,0.04)] text-[var(--copilot-ink)]",
};

export function DecisionStep({
  stepIndex,
  totalSteps,
  title,
  headline,
  subtitle,
  description,
  risk,
  result,
  impact,
  recommendation,
  trace,
  dataList,
  data,
  ctaLabel,
  onNext,
  nextHref,
  durationHint,
}: {
  stepIndex: number;
  totalSteps: number;
  /** Etiqueta corta del paso (si no hay headline, se usa como título principal). */
  title: string;
  /** Titular grande (mensaje ejecutivo principal). */
  headline?: string;
  /** Bloque de contexto inmediatamente bajo el titular. */
  subtitle?: string;
  /** Párrafo secundario (compatibilidad con flujos simples). */
  description?: string;
  /** Riesgo explícito con color semántico. */
  risk?: { text: string; variant: SemanticVariant };
  /** Resultado / estado con color semántico (p. ej. cubierto vs faltante). */
  result?: { text: string; variant: SemanticVariant };
  /** Impacto cuantificado o cierre (caja destacada). */
  impact?: string;
  /** Recomendación obligatoria cuando hay datos (p. ej. priorizar clientes). */
  recommendation?: string;
  /** Trazabilidad: fuente y momento (texto pequeño al pie). */
  trace?: string[];
  /** Lista estructurada (filas, bullets, tabla). */
  dataList?: ReactNode;
  data?: ReactNode;
  ctaLabel: string;
  onNext?: () => void;
  nextHref?: string;
  durationHint?: string;
}) {
  const isHeadlineMode = Boolean(headline);

  return (
    <CopilotCard className="mx-auto max-w-2xl border-[rgba(31,107,74,0.14)] p-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        Paso {stepIndex} de {totalSteps}
        {durationHint ? (
          <span className="ml-2 font-normal normal-case text-[var(--copilot-ink-muted)]">
            · {durationHint}
          </span>
        ) : null}
      </p>

      {isHeadlineMode ? (
        <>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--copilot-ink-muted)]">
            {title}
          </p>
          <h2 className="mt-2 text-2xl font-bold leading-snug tracking-tight text-[var(--copilot-ink)] sm:text-[1.65rem]">
            {headline}
          </h2>
        </>
      ) : (
        <h2 className="mt-3 text-xl font-semibold tracking-tight text-[var(--copilot-ink)]">
          {title}
        </h2>
      )}

      {subtitle ? (
        <p className="mt-4 text-base font-medium leading-relaxed text-[var(--copilot-ink)]">
          {subtitle}
        </p>
      ) : null}

      {description ? (
        <p
          className={`text-sm leading-relaxed text-[var(--copilot-ink)] ${subtitle ? "mt-3" : isHeadlineMode ? "mt-3" : "mt-3"}`}
        >
          {description}
        </p>
      ) : null}

      {risk ? (
        <div
          className={`mt-5 rounded-r-xl border-l-4 px-4 py-3 text-sm font-semibold leading-snug ${riskBar[risk.variant]}`}
        >
          {risk.text}
        </div>
      ) : null}

      {result ? (
        <div
          className={`mt-4 rounded-xl border px-4 py-3 text-sm font-semibold leading-snug ${variantBox[result.variant]}`}
        >
          {result.text}
        </div>
      ) : null}

      {recommendation ? (
        <div className="mt-5 rounded-xl border border-[rgba(31,107,74,0.2)] bg-[rgba(31,107,74,0.06)] px-4 py-3 text-sm font-semibold leading-relaxed text-[var(--copilot-ink)]">
          {recommendation}
        </div>
      ) : null}

      {dataList ? (
        <div className="mt-6 space-y-2 text-sm text-[var(--copilot-ink)]">{dataList}</div>
      ) : null}

      {data ? (
        <div className="mt-6 space-y-3 text-sm text-[var(--copilot-ink-muted)]">{data}</div>
      ) : null}

      {impact ? (
        <p className="mt-5 rounded-xl border border-[rgba(31,107,74,0.15)] bg-[rgba(31,107,74,0.04)] px-4 py-3 text-sm font-semibold text-[var(--copilot-ink)]">
          {impact}
        </p>
      ) : null}

      {trace && trace.length > 0 ? (
        <div className="mt-6 space-y-1 border-t border-[var(--copilot-border)] pt-4 text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
          {trace.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      ) : null}

      <div className="mt-10 flex justify-center">
        {nextHref ? (
          <CopilotPrimaryLink
            href={nextHref}
            className="min-w-[240px] justify-center px-8 py-3 text-base"
          >
            {ctaLabel}
          </CopilotPrimaryLink>
        ) : (
          <CopilotPrimaryButton
            type="button"
            className="min-w-[240px] px-8 py-3 text-base"
            onClick={onNext}
          >
            {ctaLabel}
          </CopilotPrimaryButton>
        )}
      </div>
    </CopilotCard>
  );
}
