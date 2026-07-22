import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  classifyEvidence,
  clusterInflowMovements,
  deriveIdentificationLevel,
  matchClusterToClients,
  type ClientCandidate,
  type ClientMatch,
  type ClusterableMovement,
  type EvidenceLevel,
  type IdentificationLevel,
  type PayerCluster,
} from "@/lib/bank/canonical/bank-payer-identification";
import { maskAccountOrReference, normalizePayerName } from "@/lib/bank/canonical/payer-identity";
import { isBankMovementUiHidden } from "@/lib/bank-movements/bank-movement-visibility";

/**
 * FASE BANK-HISTORICAL-PAYER-IDENTIFICATION-001 — vista read-only de
 * identidades de pagador candidatas, para la revisión en lote (sección 4/5).
 * No escribe nada. Cruza contra identificaciones YA confirmadas
 * (`bank_movement_client_identifications`) para no re-proponer lo ya resuelto.
 *
 * Performance (sección 14): la lista de clusters devuelve solo resúmenes,
 * paginados y filtrados server-side — el detalle de movimientos de un cluster
 * puntual se pide aparte (`getPayerClusterDetail`), lazy, al abrir el drawer.
 */

export type PayerClusterReceiptCandidate = {
  receiptId: string;
  amount: number;
  currency: string;
  date: string | null;
};

export type PayerClusterMovementView = {
  movementId: string;
  date: string;
  amount: number;
  currency: string;
  referenceMasked: string | null;
  hasCompatibleReceipt: boolean;
  hasFinancialLink: boolean;
  alreadyIdentifiedClientId: string | null;
  level: IdentificationLevel;
  /**
   * FASE BANK-RECONCILIATION-END-TO-END-STABILIZATION-001 — primer recibo
   * compatible (moneda + monto ±0.01) encontrado entre los clientes candidatos
   * del cluster. Opcional: solo se calcula en el detalle (getPayerClusterDetail),
   * nunca en el resumen paginado.
   */
  receiptCandidate?: PayerClusterReceiptCandidate | null;
  /** Cantidad total de recibos compatibles encontrados (0, 1, o varios). */
  receiptCandidatesCount?: number;
};

export type PayerClusterSummary = {
  clusterKey: string;
  displayName: string;
  months: string[];
  currencies: string[];
  totalByCurrency: Record<string, number>;
  movementCount: number;
  /** IDs de movimientos del cluster (para excluir duplicados en la capa unificada). */
  movementIds: string[];
  clientMatches: ClientMatch[];
  evidence: EvidenceLevel;
  compatibleReceiptCount: number;
  missingReceiptCount: number;
  alreadyIdentifiedCount: number;
};

type WorkspaceWindow = { workspaceId: string; from: string; to: string };

type ComputedContext = {
  clusters: PayerCluster[];
  clients: ClientCandidate[];
  receiptsByClient: Map<string, { id: string; amount: number; currency: string; date: string | null }[]>;
  linkedMovementIds: Set<string>;
  movementIdsWithAllocations: Set<string>;
  identifiedByMovement: Map<string, string>;
};

async function computeContext(supabase: SupabaseClient, input: WorkspaceWindow): Promise<ComputedContext> {
  const { workspaceId, from, to } = input;

  const [{ data: movementRows, error: movErr }, { data: companyRows, error: compErr }] = await Promise.all([
    supabase
      .from("bank_movements")
      .select("id, movement_date, amount, currency, description, bank_reference, bank_name, status, metadata")
      .eq("workspace_id", workspaceId)
      .eq("direction", "inflow")
      .neq("status", "ignored")
      .gte("movement_date", from)
      .lte("movement_date", to)
      .limit(5000),
    supabase.from("proto_companies").select("id, name").eq("workspace_company_id", workspaceId).limit(5000),
  ]);
  if (movErr) throw new Error(`PAYER_CLUSTER_AUDIT_MOVEMENTS_FAILED: ${movErr.message}`);
  if (compErr) throw new Error(`PAYER_CLUSTER_AUDIT_COMPANIES_FAILED: ${compErr.message}`);

  type MovementRow = {
    id: string;
    movement_date: string;
    amount: string | number;
    currency: string;
    description: string | null;
    bank_reference: string | null;
    bank_name: string | null;
    metadata: Record<string, unknown> | null;
  };
  const rows = ((movementRows ?? []) as MovementRow[]).filter((r) => !isBankMovementUiHidden(r.metadata));
  const movementIds = rows.map((r) => r.id);

  const [{ data: receiptRows, error: recErr }, { data: linkRows, error: linkErr }, { data: identRows, error: identErr }] =
    await Promise.all([
      supabase
        .from("proto_receipts")
        .select("id, company_id, amount, currency_code, currency, receipt_date")
        .eq("workspace_company_id", workspaceId)
        .limit(20000),
      supabase
        .from("bank_movement_reconciliation_links")
        .select("id, bank_movement_id")
        .eq("workspace_id", workspaceId)
        .is("archived_at", null)
        .limit(20000),
      movementIds.length > 0
        ? supabase
            .from("bank_movement_client_identifications")
            .select("movement_id, client_company_id")
            .eq("workspace_id", workspaceId)
            .in("movement_id", movementIds)
            .not("status", "in", '("excluded","revoked")')
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (recErr) throw new Error(`PAYER_CLUSTER_AUDIT_RECEIPTS_FAILED: ${recErr.message}`);
  if (linkErr) throw new Error(`PAYER_CLUSTER_AUDIT_LINKS_FAILED: ${linkErr.message}`);
  if (identErr) throw new Error(`PAYER_CLUSTER_AUDIT_IDENTIFICATIONS_FAILED: ${identErr.message}`);

  const links = (linkRows ?? []) as Array<{ id: string; bank_movement_id: string }>;
  const linkedMovementIds = new Set(links.map((l) => l.bank_movement_id));
  const linkIds = links.map((l) => l.id);
  const movementIdByLinkId = new Map(links.map((l) => [l.id, l.bank_movement_id]));

  const movementIdsWithAllocations = new Set<string>();
  if (linkIds.length > 0) {
    const { data: allocRows, error: allocErr } = await supabase
      .from("payment_allocations")
      .select("reconciliation_link_id")
      .eq("workspace_id", workspaceId)
      .eq("status", "active")
      .in("reconciliation_link_id", linkIds)
      .limit(20000);
    if (allocErr) throw new Error(`PAYER_CLUSTER_AUDIT_ALLOCATIONS_FAILED: ${allocErr.message}`);
    for (const a of allocRows ?? []) {
      const movementId = movementIdByLinkId.get(a.reconciliation_link_id as string);
      if (movementId) movementIdsWithAllocations.add(movementId);
    }
  }

  const identifiedByMovement = new Map<string, string>();
  for (const r of identRows ?? []) {
    identifiedByMovement.set(r.movement_id as string, r.client_company_id as string);
  }

  const receiptsByClient = new Map<
    string,
    { id: string; amount: number; currency: string; date: string | null }[]
  >();
  for (const r of receiptRows ?? []) {
    const cid = r.company_id as string;
    const list = receiptsByClient.get(cid) ?? [];
    list.push({
      id: r.id as string,
      amount: Number(r.amount),
      currency: (r.currency_code || r.currency) as string,
      date: (r.receipt_date as string | null) ?? null,
    });
    receiptsByClient.set(cid, list);
  }

  const clusterable: ClusterableMovement[] = rows.map((r) => ({
    movementId: r.id,
    movementDate: r.movement_date,
    amount: Number(r.amount),
    currency: r.currency,
    description: r.description,
    bankReference: r.bank_reference,
    bankName: r.bank_name,
  }));
  const clusters = clusterInflowMovements(clusterable);

  const clients: ClientCandidate[] = (companyRows ?? []).map((c) => ({
    clientCompanyId: c.id as string,
    clientName: c.name as string,
  }));

  return { clusters, clients, receiptsByClient, linkedMovementIds, movementIdsWithAllocations, identifiedByMovement };
}

function summarize(cluster: PayerCluster, ctx: ComputedContext): PayerClusterSummary {
  const clientMatches = matchClusterToClients(cluster, ctx.clients);
  const distinctClientIds = Array.from(new Set(clientMatches.map((m) => m.clientCompanyId)));
  const hasCorroboratingReceipt = distinctClientIds.some((cid) =>
    (ctx.receiptsByClient.get(cid) ?? []).some((r) => cluster.currencies.includes(r.currency))
  );
  const evidence = classifyEvidence({ cluster, clientMatches, hasCorroboratingReceipt });

  let compatibleReceiptCount = 0;
  let alreadyIdentifiedCount = 0;
  for (const m of cluster.movements) {
    if (ctx.identifiedByMovement.has(m.movementId)) alreadyIdentifiedCount++;
    const hasCompatibleReceipt = distinctClientIds.some((cid) =>
      (ctx.receiptsByClient.get(cid) ?? []).some(
        (r) => r.currency === m.currency && Math.abs(r.amount - m.amount) <= 0.01
      )
    );
    if (hasCompatibleReceipt) compatibleReceiptCount++;
  }

  return {
    clusterKey: cluster.clusterKey,
    displayName: cluster.displayName,
    months: cluster.months,
    currencies: cluster.currencies,
    totalByCurrency: cluster.totalByCurrency,
    movementCount: cluster.movements.length,
    movementIds: cluster.movements.map((m) => m.movementId),
    clientMatches,
    evidence,
    compatibleReceiptCount,
    missingReceiptCount: cluster.movements.length - compatibleReceiptCount,
    alreadyIdentifiedCount,
  };
}

export type ListClustersInput = WorkspaceWindow & {
  search?: string;
  evidence?: EvidenceLevel;
  page: number;
  pageSize: number;
};

export type ListClustersResult = {
  clusters: PayerClusterSummary[];
  total: number;
  page: number;
  pageSize: number;
};

/** Lista paginada de resúmenes de cluster — nunca incluye el detalle de movimientos. */
export async function listPayerClusterSummaries(
  supabase: SupabaseClient,
  input: ListClustersInput
): Promise<ListClustersResult> {
  const ctx = await computeContext(supabase, input);
  let summaries = ctx.clusters.map((c) => summarize(c, ctx));

  if (input.search && input.search.trim()) {
    const needle = normalizePayerName(input.search) ?? "";
    summaries = summaries.filter((s) => (normalizePayerName(s.displayName) ?? "").includes(needle));
  }
  if (input.evidence) {
    summaries = summaries.filter((s) => s.evidence === input.evidence);
  }
  summaries.sort((a, b) => b.movementCount - a.movementCount);

  const total = summaries.length;
  const start = (input.page - 1) * input.pageSize;
  const page = summaries.slice(start, start + input.pageSize);

  return { clusters: page, total, page: input.page, pageSize: input.pageSize };
}

export type ClusterDetail = PayerClusterSummary & { movements: PayerClusterMovementView[] };

/** Detalle completo (movimientos) de UN cluster puntual — carga lazy al abrir el drawer. */
export async function getPayerClusterDetail(
  supabase: SupabaseClient,
  input: WorkspaceWindow & { clusterKey: string }
): Promise<ClusterDetail | null> {
  const ctx = await computeContext(supabase, input);
  const cluster = ctx.clusters.find((c) => c.clusterKey === input.clusterKey);
  if (!cluster) return null;

  const summary = summarize(cluster, ctx);
  const distinctClientIds = Array.from(new Set(summary.clientMatches.map((m) => m.clientCompanyId)));

  const movements: PayerClusterMovementView[] = cluster.movements.map((m) => {
    const alreadyIdentifiedClientId = ctx.identifiedByMovement.get(m.movementId) ?? null;
    const hasFinancialLink = ctx.linkedMovementIds.has(m.movementId);
    // FASE BANK-RECONCILIATION-END-TO-END-STABILIZATION-001 — recolecta TODOS
    // los recibos compatibles (moneda + monto ±0.01) entre los clientes
    // candidatos del cluster, no solo un booleano: el primero se propone como
    // receiptCandidate y el total permite distinguir "listo" de "ambiguo".
    const matchingReceipts = distinctClientIds.flatMap((cid) =>
      (ctx.receiptsByClient.get(cid) ?? []).filter(
        (r) => r.currency === m.currency && Math.abs(r.amount - m.amount) <= 0.01
      )
    );
    const hasCompatibleReceipt = matchingReceipts.length > 0;
    const firstMatch = matchingReceipts[0] ?? null;
    const receiptCandidate: PayerClusterReceiptCandidate | null = firstMatch
      ? {
          receiptId: firstMatch.id,
          amount: firstMatch.amount,
          currency: firstMatch.currency,
          date: firstMatch.date,
        }
      : null;
    const level = deriveIdentificationLevel({
      clientConfirmed: alreadyIdentifiedClientId !== null,
      hasCompatibleReceipt,
      hasFinancialLink,
      hasInvoiceAllocations: ctx.movementIdsWithAllocations.has(m.movementId),
    });
    return {
      movementId: m.movementId,
      date: m.movementDate,
      amount: m.amount,
      currency: m.currency,
      referenceMasked: maskAccountOrReference(m.bankReference),
      hasCompatibleReceipt,
      hasFinancialLink,
      alreadyIdentifiedClientId,
      level,
      receiptCandidate,
      receiptCandidatesCount: matchingReceipts.length,
    };
  });

  return { ...summary, movements };
}

export type { EvidenceLevel } from "@/lib/bank/canonical/bank-payer-identification";
