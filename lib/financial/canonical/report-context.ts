/**
 * FINANCIAL CANONICAL LAYER — Contexto financiero.
 *
 * Construye un `CanonicalFinancialContext` consistente. Centraliza la
 * interpretación de "período", "corte" y "piso 2026" para que ningún módulo
 * reinterprete las fechas por su cuenta.
 */

import {
  MIN_FINANCIAL_DATE,
  getCopilotOperationalEndDate,
  getCopilotOperationalStartDate,
} from "@/lib/copilot-operational-period";

import { SUPPORTED_CURRENCIES } from "./currency";
import type {
  CanonicalFinancialContext,
  CanonicalPeriod,
  FinancialCurrency,
  IsoDate,
} from "./types";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertYmd(value: string, label: string): IsoDate {
  const d = value.slice(0, 10);
  if (!YMD_RE.test(d)) {
    throw new Error(`[canonical/context] ${label} debe ser YYYY-MM-DD, recibido: "${value}"`);
  }
  return d;
}

export interface BuildCanonicalFinancialContextInput {
  workspaceId: string;
  /** Inicio de la actividad del período. Default: inicio operativo (2026-01-01). */
  periodStart?: IsoDate;
  /** Fin de la actividad del período. Default: hoy (UTC). */
  periodEnd?: IsoDate;
  /** Corte del stock. Default: `periodEnd`. */
  cutoffDate?: IsoDate;
  /** Piso duro de fechas. Default: `MIN_FINANCIAL_DATE`. */
  minFinancialDate?: IsoDate;
  currencies?: FinancialCurrency[];
  exchangeRate?: CanonicalFinancialContext["exchangeRate"];
}

/**
 * Arma un contexto canónico validado. `periodEnd` actúa como corte por defecto
 * (el saldo pendiente se mide al cierre del período consultado).
 */
export function buildCanonicalFinancialContext(
  input: BuildCanonicalFinancialContextInput
): CanonicalFinancialContext {
  const workspaceId = input.workspaceId.trim();
  if (!workspaceId) {
    throw new Error("[canonical/context] workspaceId requerido.");
  }

  const periodStart = assertYmd(
    input.periodStart ?? getCopilotOperationalStartDate(),
    "periodStart"
  );
  const periodEnd = assertYmd(
    input.periodEnd ?? getCopilotOperationalEndDate(),
    "periodEnd"
  );
  const cutoffDate = assertYmd(input.cutoffDate ?? periodEnd, "cutoffDate");
  const minFinancialDate = assertYmd(
    input.minFinancialDate ?? MIN_FINANCIAL_DATE,
    "minFinancialDate"
  );

  if (periodEnd < periodStart) {
    throw new Error(
      `[canonical/context] periodEnd (${periodEnd}) no puede ser anterior a periodStart (${periodStart}).`
    );
  }

  const currencies =
    input.currencies && input.currencies.length > 0
      ? [...input.currencies]
      : [...SUPPORTED_CURRENCIES];

  return {
    workspaceId,
    periodStart,
    periodEnd,
    cutoffDate,
    minFinancialDate,
    currencies,
    exchangeRate: input.exchangeRate,
  };
}

/** Deriva el `CanonicalPeriod` (from/to/cutoff) desde un contexto. */
export function canonicalPeriodFromContext(
  context: CanonicalFinancialContext
): CanonicalPeriod {
  return {
    from: context.periodStart,
    to: context.periodEnd,
    cutoff: context.cutoffDate,
  };
}
