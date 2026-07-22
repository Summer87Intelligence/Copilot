import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getPayerClusterDetail,
  listPayerClusterSummaries,
  type ClusterDetail,
  type EvidenceLevel,
  type ListClustersInput,
  type PayerClusterMovementView,
  type PayerClusterReceiptCandidate,
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
import {
  deriveInvoiceContextKind,
  invoiceContextLabel,
} from "@/lib/bank/canonical/canonical-reconciliation-movement-view";

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
  /** Movimientos operativos (excluye duplicados de importación). */
  movementCount: number;
  /** Duplicados técnicos excluidos de totales, lote y pendientes. */
  duplicateExcludedCount: number;
  months: string[];
  currencies: string[];
  /** Totales operativos: no incluyen importes de filas duplicadas. */
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

type DuplicateAuditGroup = {
  duplicateMovementIds: string[];
  canonicalMovementId: string;
  amount: number;
  currency: string;
};

/** Resta importes de filas duplicadas del total del cluster. */
export function totalsExcludingDuplicateMovements(
  totalByCurrency: Record<string, number>,
  clusterMovementIds: readonly string[],
  duplicateGroups: readonly DuplicateAuditGroup[]
): Record<string, number> {
  const inCluster = new Set(clusterMovementIds);
  const next: Record<string, number> = { ...totalByCurrency };
  for (const group of duplicateGroups) {
    for (const dupId of group.duplicateMovementIds) {
      if (!inCluster.has(dupId)) continue;
      const cur = group.currency;
      next[cur] = Number(((next[cur] ?? 0) - group.amount).toFixed(2));
      if (Math.abs(next[cur]!) < 0.005) delete next[cur];
    }
  }
  return next;
}

/**
 * Ajusta recibos listos/pendientes excluyendo duplicados del universo operativo.
 * Preferimos restar del bucket "sin recibo" primero (los dups técnicos suelen
 * no ser la fila operativa con recibo elegible).
 */
export function operationalReceiptCounts(input: {
  compatibleReceiptCount: number;
  missingReceiptCount: number;
  duplicateExcludedCount: number;
}): { receiptsFoundCount: number; missingReceiptCount: number } {
  let receipts = input.compatibleReceiptCount;
  let missing = input.missingReceiptCount;
  let dups = input.duplicateExcludedCount;
  const fromMissing = Math.min(missing, dups);
  missing -= fromMissing;
  dups -= fromMissing;
  receipts = Math.max(0, receipts - dups);
  return { receiptsFoundCount: receipts, missingReceiptCount: missing };
}

function summaryToCase(
  summary: PayerClusterSummary,
  duplicateMovementIds: ReadonlySet<string> = new Set(),
  duplicateGroups: readonly DuplicateAuditGroup[] = []
): UnifiedReconciliationCaseSummary {
  const suggested = bestSuggestedClient(summary);
  const duplicateExcludedCount = summary.movementIds.filter((id) => duplicateMovementIds.has(id)).length;
  const operationalCount = Math.max(0, summary.movementCount - duplicateExcludedCount);
  const { receiptsFoundCount, missingReceiptCount } = operationalReceiptCounts({
    compatibleReceiptCount: summary.compatibleReceiptCount,
    missingReceiptCount: summary.missingReceiptCount,
    duplicateExcludedCount,
  });

  const approxRowStatuses: UnifiedRowStatus[] = [
    ...Array(receiptsFoundCount).fill(
      summary.evidence === "ambiguous" ? "requiere_revision" : summary.evidence === "none" ? "sin_cliente" : "listo_para_confirmar"
    ),
    ...Array(missingReceiptCount).fill(
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
    movementCount: operationalCount,
    duplicateExcludedCount,
    months: summary.months,
    currencies: summary.currencies,
    totalByCurrency: totalsExcludingDuplicateMovements(
      summary.totalByCurrency,
      summary.movementIds,
      duplicateGroups
    ),
    receiptsFoundCount,
    missingReceiptCount,
    alreadyIdentifiedCount: Math.min(summary.alreadyIdentifiedCount, operationalCount),
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
 * Lista paginada de casos unificados — listPayerClusterSummaries + auditoría de
 * duplicados en la ventana. Conteos/totales operativos excluyen duplicados.
 */
export async function listUnifiedReconciliationCases(
  supabase: SupabaseClient,
  input: ListUnifiedCasesInput
): Promise<ListUnifiedCasesResult> {
  const raw = await listPayerClusterSummaries(supabase, {
    ...input,
    page: 1,
    pageSize: 5000,
  });
  const duplicateGroups = await auditDuplicateBankMovements(
    supabase,
    input.workspaceId,
    input.from,
    input.to
  );
  const duplicateMovementIds = new Set(duplicateGroups.flatMap((g) => g.duplicateMovementIds));

  let cases = raw.clusters.map((c) => summaryToCase(c, duplicateMovementIds, duplicateGroups));
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
  /** Solo filas `duplicado`: movimiento canónico del grupo. */
  canonicalMovementId: string | null;
  /** Primer recibo compatible encontrado a nivel cluster (si lo hay). */
  receiptCandidate: PayerClusterReceiptCandidate | null;
  /** Cantidad de recibos compatibles encontrados a nivel cluster. */
  receiptCandidatesCount: number;
};

export type UnifiedReconciliationCaseDetail = UnifiedReconciliationCaseSummary & {
  rows: UnifiedReconciliationRow[];
  /** Movimientos elegibles para confirmación en lote (sección 7): no duplicados, no ambiguos, con recibo compatible. */
  batchEligibleMovementIds: string[];
};

/**
 * FASE BANK-RECONCILIATION-END-TO-END-STABILIZATION-001 — delega en la fuente
 * canónica única (canonical-reconciliation-movement-view.ts) para no mantener
 * dos vocabularios de "contexto de factura" divergentes entre la vista
 * unificada y la evidencia de un movimiento puntual.
 */
function invoiceContextFromLevel(input: {
  level: PayerClusterMovementView["level"];
  hasCompatibleReceipt: boolean;
  hasFinancialLink: boolean;
}): string {
  return invoiceContextLabel(deriveInvoiceContextKind(input));
}

/**
 * Detalle de un caso puntual — reusa getPayerClusterDetail y auditoría de
 * duplicados. Conteos/totales/lote son operativos (sin duplicados).
 */
export async function getUnifiedReconciliationCaseDetail(
  supabase: SupabaseClient,
  input: { workspaceId: string; from: string; to: string; clusterKey: string }
): Promise<UnifiedReconciliationCaseDetail | null> {
  const detail: ClusterDetail | null = await getPayerClusterDetail(supabase, input);
  if (!detail) return null;

  const dates = detail.movements.map((m) => m.date).sort();
  const duplicateGroups =
    dates.length > 0
      ? await auditDuplicateBankMovements(supabase, input.workspaceId, dates[0]!, dates[dates.length - 1]!)
      : [];
  const duplicateMovementIds = new Set(duplicateGroups.flatMap((g) => g.duplicateMovementIds));
  const canonicalByDuplicate = new Map<string, string>();
  for (const group of duplicateGroups) {
    for (const dupId of group.duplicateMovementIds) {
      canonicalByDuplicate.set(dupId, group.canonicalMovementId);
    }
  }
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
      invoiceContextLabel: invoiceContextFromLevel({
        level: m.level,
        hasCompatibleReceipt: m.hasCompatibleReceipt,
        hasFinancialLink: m.hasFinancialLink,
      }),
      status,
      statusLabel: unifiedRowStatusLabel(status),
      action: deriveRowAction(status),
      hasCompatibleReceipt: m.hasCompatibleReceipt,
      hasFinancialLink: m.hasFinancialLink,
      alreadyIdentifiedClientId: m.alreadyIdentifiedClientId,
      canonicalMovementId: canonicalByDuplicate.get(m.movementId) ?? null,
      receiptCandidate: m.receiptCandidate ?? null,
      receiptCandidatesCount: m.receiptCandidatesCount ?? 0,
    };
  });

  const nonDuplicateRows = rows.filter((r) => r.status !== "duplicado");
  const status = deriveCaseStatus(
    nonDuplicateRows.map((r) => r.status),
    detail.evidence
  );
  const totalByCurrency: Record<string, number> = {};
  for (const row of nonDuplicateRows) {
    totalByCurrency[row.currency] = Number(((totalByCurrency[row.currency] ?? 0) + row.amount).toFixed(2));
  }

  return {
    clusterKey: detail.clusterKey,
    payerDisplayName: detail.displayName,
    suggestedClientId: suggested.id,
    suggestedClientName: suggested.name,
    evidence: detail.evidence,
    movementCount: nonDuplicateRows.length,
    duplicateExcludedCount: rows.length - nonDuplicateRows.length,
    months: detail.months,
    currencies: detail.currencies,
    totalByCurrency,
    receiptsFoundCount: nonDuplicateRows.filter((r) => r.hasCompatibleReceipt).length,
    missingReceiptCount: nonDuplicateRows.filter((r) => !r.hasCompatibleReceipt).length,
    alreadyIdentifiedCount: nonDuplicateRows.filter((r) => r.alreadyIdentifiedClientId).length,
    status,
    recommendedAction: UNIFIED_CASE_RECOMMENDED_ACTION[status],
    rows,
    batchEligibleMovementIds: rows.filter((r) => r.status === "listo_para_confirmar").map((r) => r.movementId),
  };
}
