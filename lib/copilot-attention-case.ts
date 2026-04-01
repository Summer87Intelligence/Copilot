import type { FiscalAlertCategory, FiscalAlertItem } from "@/lib/copilot-tax-alerts";

const PRIORITY_RANK = { critical: 0, high: 1, medium: 2 } as const;

/**
 * Primer caso crítico o alto (mismo criterio de orden que el listado de alertas).
 */
export function pickPrimaryUrgentCase(
  items: FiscalAlertItem[]
): FiscalAlertItem | null {
  const urgent = items.filter(
    (a) => a.priority === "critical" || a.priority === "high"
  );
  if (urgent.length === 0) return null;
  urgent.sort((a, b) => {
    const d = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (d !== 0) return d;
    return a.id.localeCompare(b.id);
  });
  return urgent[0];
}

export type HealthAttentionLevel = "critical" | "high";

/**
 * Caso principal según el nivel del semáforo (`?level=` en la URL).
 * Si no hay filas de ese nivel, se recae en el primer urgente habitual.
 */
export function pickPrimaryCaseForLevel(
  items: FiscalAlertItem[],
  level: HealthAttentionLevel | null
): FiscalAlertItem | null {
  if (level == null) return pickPrimaryUrgentCase(items);

  const sortFn = (a: FiscalAlertItem, b: FiscalAlertItem) => {
    const d = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (d !== 0) return d;
    return a.id.localeCompare(b.id);
  };

  if (level === "critical") {
    const list = items.filter((a) => a.priority === "critical").sort(sortFn);
    return list[0] ?? pickPrimaryUrgentCase(items);
  }

  const highs = items.filter((a) => a.priority === "high").sort(sortFn);
  return highs[0] ?? pickPrimaryUrgentCase(items);
}

export type ParsedAttentionBlocks = {
  quePasa?: string;
  consecuencias?: string;
  planTexto?: string;
};

/** Detalle estructurado del motor predictivo (bloques en español). */
export function parsePredictiveDetailBlocks(detail: string): ParsedAttentionBlocks {
  const n = detail.replace(/\r\n/g, "\n").trim();
  const d = /\bQué detectamos:\s*([\s\S]+?)(?=\n\nPor qué importa:)/i.exec(n);
  const w = /\bPor qué importa:\s*([\s\S]+?)(?=\n\nQué conviene hacer:)/i.exec(n);
  const a = /\bQué conviene hacer:\s*([\s\S]+)$/i.exec(n);
  return {
    quePasa: d?.[1]?.replace(/\s+/g, " ").trim(),
    consecuencias: w?.[1]?.replace(/\s+/g, " ").trim(),
    planTexto: a?.[1]?.replace(/\s+/g, " ").trim(),
  };
}

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function sentences(text: string, max: number): string[] {
  const parts = text.split(/(?<=[.!?])\s+/).map((p) => p.trim()).filter(Boolean);
  return parts.slice(0, max);
}

function fiscalFallbackNarrative(alert: FiscalAlertItem): ParsedAttentionBlocks {
  const chunks = alert.detail
    .split(/(?<=[.!?])\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const quePasa =
    chunks.length >= 2
      ? normalizeSpaces(`${chunks[0]} ${chunks[1]}`)
      : normalizeSpaces(alert.detail.slice(0, 400)) || alert.summary;
  const consecuencias =
    alert.priority === "critical"
      ? "Podés afrontar recargos, bloqueos o afectación de la relación con organismos si el vencimiento pasa sin registro ni pago."
      : "El riesgo sube si se acumulan otros egresos o si no hay visibilidad contable antes del próximo vencimiento.";
  const planTexto = chunks[chunks.length - 1] ?? "";
  return { quePasa, consecuencias, planTexto };
}

const PLAN_FALLBACK: Record<FiscalAlertCategory, string[]> = {
  fiscalidad: [
    "Validar monto y fecha con contaduría o estudio.",
    "Registrar el pago fiscal o actualizar el estado en Datos.",
    "Abrir el respaldo en Finanzas para documentos y trazabilidad.",
  ],
  liquidez: [
    "Revisar caja proyectada y egresos en Finanzas.",
    "Negociar plazos o priorizar qué pago mover.",
    "Coordinar cobranzas o línea de tesorería si hace falta.",
  ],
  cobertura: [
    "Revisar probabilidades de cobro en facturas abiertas.",
    "Definir un colchón mínimo de caja para la próxima quincena.",
    "Registrar escenarios en Alertas para seguimiento.",
  ],
  conciliacion: [
    "Abrir el pago en Datos y vincularlo a la obligación fiscal.",
    "Corregir la categoría si no corresponde a impuestos.",
    "Verificar que Finanzas refleje el cierre coherente.",
  ],
};

export type AttentionCaseContent = {
  queEstaPasando: string;
  consecuencias: string;
  planSteps: string[];
};

/**
 * Textos para la pantalla de atención prioritaria a partir de la alerta real.
 */
export function buildAttentionCaseContent(alert: FiscalAlertItem): AttentionCaseContent {
  const parsed = parsePredictiveDetailBlocks(alert.detail);
  const fb = fiscalFallbackNarrative(alert);

  const queEstaPasando =
    parsed.quePasa ?? fb.quePasa ?? alert.summary;
  const consecuencias =
    parsed.consecuencias ?? fb.consecuencias;

  let planSteps: string[] = [];
  if (parsed.planTexto) {
    const ps = sentences(parsed.planTexto, 5);
    planSteps = ps.length >= 2 ? ps.slice(0, 3) : [parsed.planTexto];
  }
  if (planSteps.length < 2) {
    const fromDetail = sentences(fb.planTexto ?? "", 3);
    planSteps =
      fromDetail.length >= 2
        ? fromDetail
        : PLAN_FALLBACK[alert.type] ?? PLAN_FALLBACK.fiscalidad;
  }

  return {
    queEstaPasando: normalizeSpaces(queEstaPasando ?? alert.summary),
    consecuencias: normalizeSpaces(
      consecuencias ??
        "El riesgo operativo o financiero puede escalar si no hay seguimiento explícito."
    ),
    planSteps,
  };
}
