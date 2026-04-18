/**
 * Bloque 13 — Trazabilidad ejecutiva (fuente, lectura temporal, cobertura).
 * Sin scoring inventado: solo estados justificables y texto conservador.
 */

import type { ActionListItem } from "@/lib/ai/action-types";
import type { CopilotInsightItem } from "@/lib/copilot-insight-engine";
import { INSIGHT_ENGINE_ROW_LIMIT } from "@/lib/copilot-insight-engine";

export type CopilotTraceDataState =
  | "fresh"
  | "stale"
  | "partial"
  | "pending_sync"
  | "insufficient_data";

export type CopilotTraceViewModel = {
  sourceLabel: string;
  /** ISO 8601 cuando existe; si no, `refreshedLabel` sigue siendo honesto. */
  refreshedAtIso: string | null;
  refreshedLabel: string;
  coverageLabel: string;
  dataState: CopilotTraceDataState;
  /** Nota breve de cautela (no “confianza alta/media/baja” inventada). */
  cautelaNote?: string | null;
};

export function formatTraceTimestampEs(iso: string | null | undefined): string {
  if (!iso) return "Refresh desconocido";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "Refresh desconocido";
    return d.toLocaleString("es-UY", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "Refresh desconocido";
  }
}

/** Etiqueta corta del estado de datos (UX, no es un SLA). */
export function traceDataStateLabelEs(state: CopilotTraceDataState): string {
  switch (state) {
    case "insufficient_data":
      return "Sin datos suficientes";
    case "pending_sync":
      return "Pendiente de sincronización";
    case "partial":
      return "Cobertura parcial";
    case "stale":
      return "Puede estar desactualizado";
    case "fresh":
      return "Lectura reciente";
    default:
      return "";
  }
}

const INSIGHT_ENGINE_SOURCE =
  "Motor de insights · tablas proto_* (Supabase), ventana acotada";

export function traceFromInsightEngineItem(item: CopilotInsightItem): CopilotTraceViewModel {
  const isEmpty = item.id === "empty";
  const iso = item.computedAtIso ?? null;
  const refreshedLabel = iso
    ? formatTraceTimestampEs(iso)
    : `Generado con la vista: ${item.evidence.updatedAt}`;

  if (isEmpty) {
    return {
      sourceLabel: INSIGHT_ENGINE_SOURCE,
      refreshedAtIso: iso,
      refreshedLabel,
      coverageLabel:
        "No hay volumen mínimo en facturas, pagos o empresas para disparar reglas del motor.",
      dataState: "insufficient_data",
      cautelaNote: null,
    };
  }

  return {
    sourceLabel: INSIGHT_ENGINE_SOURCE,
    refreshedAtIso: iso,
    refreshedLabel,
    coverageLabel: `Cobertura parcial: hasta ${INSIGHT_ENGINE_ROW_LIMIT} filas por tabla (facturas, pagos, empresas) por consulta.`,
    dataState: "partial",
    cautelaNote:
      "El panel «Ver respaldo» combina indicadores derivados de datos con texto explicativo fijo.",
  };
}

/** Drawer de evidencia: motor vs plantilla mock legacy. */
export function traceFromInsightEvidenceContext(opts: {
  fromEngine: boolean;
  evidenceUpdatedAtLabel: string;
}): CopilotTraceViewModel {
  const stamp = `Actualizado: ${opts.evidenceUpdatedAtLabel}`;
  if (opts.fromEngine) {
    return {
      sourceLabel: INSIGHT_ENGINE_SOURCE,
      refreshedAtIso: null,
      refreshedLabel: stamp,
      coverageLabel:
        "Indicadores y señales salen del lote analizado al generar la página; lectura IA es plantilla guía.",
      dataState: "partial",
      cautelaNote: null,
    };
  }
  return {
    sourceLabel: "Plantilla de ejemplo (no calculada sobre tu cuenta)",
    refreshedAtIso: null,
    refreshedLabel: stamp,
    coverageLabel: "Sin datos operativos vinculados a esta ficha.",
    dataState: "insufficient_data",
    cautelaNote: "Usá la vista Insights con datos cargados para ver respaldo del motor.",
  };
}

/** Una sola tira por respuesta GET /api/copilot/real-insights (evita repetir en cada tarjeta). */
export function traceFromRealInsightsBatch(computedAtIso: string | null): CopilotTraceViewModel {
  return {
    sourceLabel:
      "Cálculo en vivo: proto_invoices, proto_tax_obligations, cartera y snapshot financiero",
    refreshedAtIso: computedAtIso,
    refreshedLabel: computedAtIso
      ? formatTraceTimestampEs(computedAtIso)
      : "Hora de cálculo no informada por el servidor",
    coverageLabel:
      "Varias reglas en paralelo; cada tarjeta abajo detalla el subconjunto que disparó esa lectura.",
    dataState: "partial",
    cautelaNote: null,
  };
}

export function traceFromActionRow(a: ActionListItem): CopilotTraceViewModel {
  const pending = a.execution_status.toLowerCase() === "pending";
  return {
    sourceLabel: "Registro persistido en tabla actions (decisión → acción)",
    refreshedAtIso: a.updated_at,
    refreshedLabel: `Actualizada: ${formatTraceTimestampEs(a.updated_at)} · Creada: ${formatTraceTimestampEs(a.created_at)}`,
    coverageLabel: pending
      ? "Resultado operativo aún no registrado en el motor."
      : "Estado de ejecución persistido para esta fila.",
    dataState: "partial",
    cautelaNote: pending
      ? null
      : "El cajón de respaldo puede usar plantillas ilustrativas según el tipo de acción.",
  };
}

export function traceFromRutasHub(opts: {
  loadedAtIso: string;
  hasSignals: boolean;
}): CopilotTraceViewModel {
  return {
    sourceLabel:
      "Agregado al cargar: finanzas, alertas fiscales, agenda, cartera e insights en vivo",
    refreshedAtIso: opts.loadedAtIso,
    refreshedLabel: formatTraceTimestampEs(opts.loadedAtIso),
    coverageLabel: opts.hasSignals
      ? "Cada KPI refleja solo lo disponible en esa fuente en este momento."
      : "Sin señales consolidadas en esta lectura (datos vacíos o sin disparadores).",
    dataState: opts.hasSignals ? "partial" : "insufficient_data",
    cautelaNote: null,
  };
}

export function traceFromAttentionPrimary(input: {
  assembledAtIso: string;
  hasSnapshot: boolean;
  hasObligationRow: boolean;
  alertType: "fiscalidad" | "liquidez" | "cobertura" | "conciliacion";
}): CopilotTraceViewModel {
  let coverage =
    "Un solo caso priorizado desde la lista de alertas; no es un listado completo de riesgos.";
  if (!input.hasSnapshot) {
    coverage +=
      " Snapshot financiero no disponible: contexto de caja acotado en esta carga.";
  }
  if (input.alertType === "fiscalidad" && !input.hasObligationRow) {
    coverage +=
      " Obligación no vinculada en datos proto: validá montos y fechas con contaduría.";
  }
  return {
    sourceLabel: "Priorización en vivo: alertas del copiloto + snapshot financiero (esta sesión)",
    refreshedAtIso: input.assembledAtIso,
    refreshedLabel: formatTraceTimestampEs(input.assembledAtIso),
    coverageLabel: coverage,
    dataState: "partial",
    cautelaNote:
      "Ordena foco operativo; no sustituye archivo fiscal ni auditoría de cada obligación.",
  };
}
