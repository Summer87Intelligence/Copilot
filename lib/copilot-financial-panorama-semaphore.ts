/**
 * Semáforos visuales para KPIs de Panorama financiero — puro, sin I/O.
 */

import type { PanoramaCurrencySlice, PanoramaProjection, PanoramaRiskLevel } from "@/lib/copilot-financial-panorama-model";
import type { CopilotVisualTone } from "@/components/copilot/ui/copilot-visual-system";

export type MetricSemaphoreLevel = "healthy" | "attention" | "critical" | "neutral" | "info";

export type MetricSemaphore = {
  level: MetricSemaphoreLevel;
  label: string;
  tone: CopilotVisualTone;
};

function ratePct(ratio: number | null): number | null {
  if (ratio == null) return null;
  return Math.round(ratio * 100);
}

export function resolveNetIncomeSemaphore(slice: PanoramaCurrencySlice): MetricSemaphore {
  if (slice.creditNotes > slice.grossInvoiced && slice.grossInvoiced > 0) {
    return { level: "critical", label: "Crítico", tone: "danger" };
  }
  if (slice.netIncome > 0) {
    return { level: "healthy", label: "Saludable", tone: "positive" };
  }
  if (slice.netIncome === 0 && slice.grossInvoiced === 0) {
    return { level: "neutral", label: "Informativo", tone: "neutral" };
  }
  return { level: "neutral", label: "Informativo", tone: "neutral" };
}

export function resolveCollectedSemaphore(slice: PanoramaCurrencySlice): MetricSemaphore {
  const pct = ratePct(slice.collectionRate);
  if (pct == null || slice.netIncome <= 0) {
    return { level: "neutral", label: "Informativo", tone: "neutral" };
  }
  if (pct >= 80) return { level: "healthy", label: "Saludable", tone: "positive" };
  if (pct >= 50) return { level: "attention", label: "Revisar", tone: "warning" };
  return { level: "critical", label: "Crítico", tone: "danger" };
}

export function resolvePendingSemaphore(slice: PanoramaCurrencySlice): MetricSemaphore {
  if (slice.pending > 0) {
    return { level: "attention", label: "Revisar", tone: "warning" };
  }
  return { level: "healthy", label: "Saludable", tone: "neutral" };
}

export function resolveOverdueSemaphore(slice: PanoramaCurrencySlice): MetricSemaphore {
  if (slice.overdue <= 0) {
    return { level: "healthy", label: "Saludable", tone: "positive" };
  }
  const pct = ratePct(slice.overdueRate);
  if (pct != null && pct > 30) {
    return { level: "critical", label: "Crítico", tone: "danger" };
  }
  return { level: "attention", label: "Revisar", tone: "warning" };
}

export function resolveCashSemaphore(
  availableCash: number,
  projection?: Pick<PanoramaProjection, "hasOutflows" | "upcomingOutflows" | "coverageRatio">
): MetricSemaphore {
  if (availableCash < 0) {
    return { level: "critical", label: "Crítico", tone: "danger" };
  }
  if (availableCash === 0) {
    return { level: "attention", label: "Revisar", tone: "warning" };
  }
  if (
    projection?.hasOutflows &&
    projection.upcomingOutflows > 0 &&
    availableCash < projection.upcomingOutflows * 0.5
  ) {
    return { level: "attention", label: "Revisar", tone: "warning" };
  }
  if (
    projection?.hasOutflows &&
    projection.coverageRatio != null &&
    projection.coverageRatio < 1
  ) {
    return { level: "attention", label: "Revisar", tone: "warning" };
  }
  return { level: "healthy", label: "Saludable", tone: "positive" };
}

export function resolveCreditNotesSemaphore(slice: PanoramaCurrencySlice): MetricSemaphore {
  if (slice.creditNotes <= 0 || slice.grossInvoiced <= 0) {
    return { level: "neutral", label: "Informativo", tone: "neutral" };
  }
  const share = slice.creditNotes / slice.grossInvoiced;
  if (share > 0.25) return { level: "critical", label: "Crítico", tone: "danger" };
  if (share > 0.1) return { level: "attention", label: "Revisar", tone: "warning" };
  return { level: "neutral", label: "Informativo", tone: "neutral" };
}

export function resolveRiskSemaphore(level: PanoramaRiskLevel): MetricSemaphore {
  if (level === "critical") return { level: "critical", label: "Crítico", tone: "danger" };
  if (level === "attention") return { level: "attention", label: "Revisar", tone: "warning" };
  return { level: "healthy", label: "Bajo", tone: "positive" };
}

export function semaphoreBadgeClass(level: MetricSemaphoreLevel): string {
  if (level === "healthy") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (level === "attention") return "border-amber-200 bg-amber-50 text-amber-900";
  if (level === "critical") return "border-rose-200 bg-rose-50 text-rose-900";
  if (level === "info") return "border-sky-200 bg-sky-50 text-sky-900";
  return "border-slate-200 bg-slate-50 text-slate-700";
}
