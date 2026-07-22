import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getPayerClusterDetail,
  listPayerClusterSummaries,
  type ClusterDetail,
  type EvidenceLevel,
  type ListClustersInput,
  type PayerClusterMovementView,
  type PayerClusterSummary,
} from "@/lib/bank/canonical/payer-cluster-audit.server";
import { auditDuplicateBankMovements } from "@/lib/bank/canonical/duplicate-import-audit.server";
import {
  deriveCaseStatus,
  UNIFIED_CASE_RECOMMENDED_ACTION,
  unifiedCaseStatusLabel,
  type UnifiedCaseStatus,
  type UnifiedRowStatus,
} from "@/lib/bank/canonical/unified-reconciliation-status";

/**
 * FASE BANK-RECONCILIATION-SIMPLE-UNIFIED-WORKSPACE-001
 *
 * View-model de solo lectura que COMPONE (nunca reemplaza) los motores ya
 * existentes — clustering de pagador (payer-cluster-audit.server.ts, que a su
 * vez usa bank-payer-identification.ts) y auditoría de duplicados
 * (duplicate-import-audit.server.ts) — en un único "caso" por cliente/pagador,
 * para que la UI de Conciliación deje de exigir dos pasos manuales separados
 * (identificar cliente, después vincular recibo).
 *
 * No crea tablas, no agrega escrituras, no reimplementa clustering ni
 * matching: solo interpreta los campos que esos motores YA devuelven
 * (`evidence`, `level`, `hasCompatibleReceipt`, `hasFinancialLink`) para
 * derivar un estado y una acción recomendada en el lenguaje simple que pide
 * la sección 10 (nunca expone "suggestion"/"allocation"/"payer identity").
 */

export type { UnifiedCaseStatus, UnifiedRowStatus };
export { deriveCaseStatus, unifiedCaseStatusLabel };

export type UnifiedRowAction =
  | "confirmar_con_recibo"
  | "dejar_pendiente"
  | "buscar_cliente"
  | "elegir_cliente"
  | "ninguna";

const ROW_STATUS_LABEL: Record<UnifiedRowStatus, string> = {
  sin_cliente: "Sin cliente",
  listo_para_confirmar: "Listo para confirmar",
  falta_recibo: "Falta recibo en Zeta",
  requiere_revision: "Requiere revisión",
  conciliado: "Conciliado con recibo",
  duplicado: "Duplicado de importación",
};

export function unifiedRowStatusLabel(status: UnifiedRowStatus): string {
  return ROW_STATUS_LABEL[status];
}

/**
 * Deriva el estado de UNA fila (un movimiento) a partir de campos que ya
 * calculan los motores existentes. Nunca decide por importe/fecha por sí
 * misma — solo interpreta `level`/`hasCompatibleReceipt`/`evidence`.
 */
export function deriveRowStatus(input: {
  isDuplicate: boolean;
  level: PayerClusterMovementView["level"];
  hasCompatibleReceipt: boolean;
  evidence: EvidenceLevel;
}): UnifiedRowStatus {
  if (input.isDuplicate) return "duplicado";
  if (input.level === "full_reconciliation" || input.level === "reconciled_with_receipt") return "conciliado";
  if (input.evidence === "ambiguous") return "requiere_revision";
  if (input.evidence === "none") return "sin_cliente";
  // Evidencia strong/probable: un único cliente candidato.
  if (input.hasCompatibleReceipt) return "listo_para_confirmar";
  return "falta_recibo";
}

export function deriveRowAction(status: UnifiedRowStatus): UnifiedRowAction {
  switch (status) {
    case "listo_para_confirmar":
      return "confirmar_con_recibo";
    case "falta_recibo":
      return "dejar_pendiente";
    case "sin_cliente":
      return "buscar_cliente";
    case "requiere_revision":
      return "elegir_cliente";
    case "conciliado":
    case "duplicado":
      return "ninguna";
  }
}

export type UnifiedReconciliationCaseSummary = {
  clusterKey: string;
  payerDisplayName: string;
  suggestedClientId: string | null;
  suggestedClientName: string | null;
  evidence: EvidenceLevel;
  movementCount: number;
  months: string[];
  currencies: string[];
  totalByCurrency: Record<string, number>;
  receiptsFoundCount: number;
  missingReceiptCount: number;
  alreadyIdentifiedCount: number;
  status: UnifiedCaseStatus;
  recommendedAction: string;
};

function bestSuggestedClient(summary: PayerClusterSummary): { id: string | null; name: string | null } {
  const exact = summary.clientMatches.find((m) => m.matchType === "exact");
  const first = exact ?? summary.clientMatches[0];
  return { id: first?.clientCompanyId ?? null, name: first?.clientName ?? null };
}

function summaryToCase(summary: PayerClusterSummary): UnifiedReconciliationCaseSummary {
  const suggested = bestSuggestedClient(summary);
  // A nivel de resumen (sin IDs de movimiento por fila, ver limitación en el
  // informe) se aproxima el estado agregando por evidencia + conteos ya
  // calculados por el motor de clustering, sin necesidad de otra consulta.
  const approxRowStatuses: UnifiedRowStatus[] = [
    ...Array(summary.compatibleReceiptCount).fill(
      summary.evidence === "ambiguous" ? "requiere_revision" : summary.evidence === "none" ? "sin_cliente" : "listo_para_confirmar"
    ),
    ...Array(summary.missingReceiptCount).fill(
      summary.evidence === "ambiguous" ? "requiere_revision" : summary.evidence === "none" ? "sin_cliente" : "falta_recibo"
    ),
  ] as UnifiedRowStatus[];
  const status = deriveCaseStatus(approxRowStatuses, summary.evidence);

  return {
    clusterKey: summary.clusterKey,
    payerDisplayName: summary.displayName,
    suggestedClientId: suggested.id,
    suggestedClientName: suggested.name,
    evidence: summary.evidence,
    movementCount: summary.movementCount,
    months: summary.months,
    currencies: summary.currencies,
    totalByCurrency: summary.totalByCurrency,
    receiptsFoundCount: summary.compatibleReceiptCount,
    missingReceiptCount: summary.missingReceiptCount,
    alreadyIdentifiedCount: summary.alreadyIdentifiedCount,
    status,
    recommendedAction: UNIFIED_CASE_RECOMMENDED_ACTION[status],
  };
}

export type ListUnifiedCasesInput = Omit<ListClustersInput, "evidence"> & {
  status?: UnifiedCaseStatus;
};

export type ListUnifiedCasesResult = {
  cases: UnifiedReconciliationCaseSummary[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * Lista paginada de casos unificados — una llamada a listPayerClusterSummaries
 * (ya paginada/filtrada server-side), sin consultas adicionales. El filtro por
 * `status` se aplica en memoria sobre la página ya resumida (el mismo patrón
 * que ya usa listPayerClusterSummaries para `search`/`evidence`).
 */
export async function listUnifiedReconciliationCases(
  supabase: SupabaseClient,
  input: ListUnifiedCasesInput
): Promise<ListUnifiedCasesResult> {
  // Se pide una página más grande para poder filtrar por status en memoria sin
  // perder resultados reales de la página pedida por el usuario; con el volumen
  // actual (decenas de clusters, nunca miles) esto no es un problema de N+1 ni
  // de payload — sigue siendo 2 consultas fijas (movimientos + empresas).
  const raw = await listPayerClusterSummaries(supabase, {
    ...input,
    page: 1,
    pageSize: 5000,
  });
  let cases = raw.clusters.map(summaryToCase);
  if (input.status) {
    cases = cases.filter((c) => c.status === input.status);
  }
  const total = cases.length;
  const start = (input.page - 1) * input.pageSize;
  const page = cases.slice(start, start + input.pageSize);
  return { cases: page, total, page: input.page, pageSize: input.pageSize };
}

export type UnifiedReconciliationRow = {
  movementId: string;
  date: string;
  amount: number;
  currency: string;
  referenceMasked: string | null;
  /** Nombre de negocio del cliente (nunca IDs internos). */
  clientLabel: string;
  /** Contexto de factura en lenguaje simple. */
  invoiceContextLabel: string;
  status: UnifiedRowStatus;
  statusLabel: string;
  action: UnifiedRowAction;
  hasCompatibleReceipt: boolean;
  hasFinancialLink: boolean;
  alreadyIdentifiedClientId: string | null;
};

export type UnifiedReconciliationCaseDetail = UnifiedReconciliationCaseSummary & {
  rows: UnifiedReconciliationRow[];
  /** Movimientos elegibles para confirmación en lote (sección 7): no duplicados, no ambiguos, con recibo compatible. */
  batchEligibleMovementIds: string[];
};

function invoiceContextFromLevel(level: PayerClusterMovementView["level"]): string {
  if (level === "full_reconciliation") return "Factura comprobada";
  if (level === "reconciled_with_receipt") return "Sin factura comprobada";
  return "—";
}

/**
 * Detalle de un caso puntual — reusa getPayerClusterDetail (lazy, ya trae
 * movimientos + nivel por movimiento) y le suma el único dato que faltaba
 * para el flujo unificado: qué filas son duplicados de importación (sección
 * 6F), vía auditDuplicateBankMovements acotada a la ventana de fechas real
 * del propio cluster — nunca la ventana completa del workspace.
 */
export async function getUnifiedReconciliationCaseDetail(
  supabase: SupabaseClient,
  input: { workspaceId: string; from: string; to: string; clusterKey: string }
): Promise<UnifiedReconciliationCaseDetail | null> {
  const detail: ClusterDetail | null = await getPayerClusterDetail(supabase, input);
  if (!detail) return null;

  const dates = detail.movements.map((m) => m.date).sort();
  const duplicateGroups =
    dates.length > 0 ? await auditDuplicateBankMovements(supabase, input.workspaceId, dates[0]!, dates[dates.length - 1]!) : [];
  const duplicateMovementIds = new Set(duplicateGroups.flatMap((g) => g.duplicateMovementIds));
  const suggested = bestSuggestedClient(detail);

  const rows: UnifiedReconciliationRow[] = detail.movements.map((m) => {
    const status = deriveRowStatus({
      isDuplicate: duplicateMovementIds.has(m.movementId),
      level: m.level,
      hasCompatibleReceipt: m.hasCompatibleReceipt,
      evidence: detail.evidence,
    });
    return {
      movementId: m.movementId,
      date: m.date,
      amount: m.amount,
      currency: m.currency,
      referenceMasked: m.referenceMasked,
      clientLabel: suggested.name ?? (m.alreadyIdentifiedClientId ? "Cliente identificado" : "Sin cliente"),
      invoiceContextLabel: invoiceContextFromLevel(m.level),
      status,
      statusLabel: unifiedRowStatusLabel(status),
      action: deriveRowAction(status),
      hasCompatibleReceipt: m.hasCompatibleReceipt,
      hasFinancialLink: m.hasFinancialLink,
      alreadyIdentifiedClientId: m.alreadyIdentifiedClientId,
    };
  });

  const caseSummary = summaryToCase(detail);
  // El resumen exacto (a diferencia de la aproximación de listUnifiedReconciliationCases)
  // ahora puede recalcularse con las filas reales, incluyendo duplicados excluidos.
  const nonDuplicateRows = rows.filter((r) => r.status !== "duplicado");
  const status = deriveCaseStatus(
    nonDuplicateRows.map((r) => r.status),
    detail.evidence
  );

  return {
    ...caseSummary,
    movementCount: nonDuplicateRows.length,
    receiptsFoundCount: nonDuplicateRows.filter((r) => r.hasCompatibleReceipt).length,
    missingReceiptCount: nonDuplicateRows.filter((r) => !r.hasCompatibleReceipt).length,
    status,
    recommendedAction: UNIFIED_CASE_RECOMMENDED_ACTION[status],
    rows,
    batchEligibleMovementIds: rows.filter((r) => r.status === "listo_para_confirmar").map((r) => r.movementId),
  };
}
