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
} from "@/lib/bank/canonical/bank-payer-identification";
import { maskAccountOrReference } from "@/lib/bank/canonical/payer-identity";

/**
 * FASE BANK-HISTORICAL-PAYER-IDENTIFICATION-001 — vista read-only de
 * identidades de pagador candidatas, para la revisión en lote (sección 4/5).
 * No escribe nada. Cruza contra identificaciones YA confirmadas
 * (`bank_movement_client_identifications`) para no re-proponer lo ya resuelto.
 */

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
};

export type PayerClusterView = {
  clusterKey: string;
  displayName: string;
  months: string[];
  currencies: string[];
  totalByCurrency: Record<string, number>;
  movementCount: number;
  clientMatches: ClientMatch[];
  evidence: EvidenceLevel;
  movements: PayerClusterMovementView[];
};

export async function buildPayerClusterAudit(
  supabase: SupabaseClient,
  input: { workspaceId: string; from: string; to: string }
): Promise<PayerClusterView[]> {
  const { workspaceId, from, to } = input;

  const [{ data: movementRows, error: movErr }, { data: companyRows, error: compErr }] = await Promise.all([
    supabase
      .from("bank_movements")
      .select("id, movement_date, amount, currency, description, bank_reference, bank_name, status")
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
  };
  const rows = (movementRows ?? []) as MovementRow[];
  const movementIds = rows.map((r) => r.id);

  const [{ data: receiptRows, error: recErr }, { data: linkRows, error: linkErr }, { data: identRows, error: identErr }] =
    await Promise.all([
      supabase
        .from("proto_receipts")
        .select("id, company_id, amount, currency_code, currency")
        .eq("workspace_company_id", workspaceId)
        .limit(20000),
      supabase
        .from("bank_movement_reconciliation_links")
        .select("bank_movement_id")
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

  const linkedMovementIds = new Set((linkRows ?? []).map((l) => l.bank_movement_id as string));
  const identifiedByMovement = new Map<string, string>();
  for (const r of identRows ?? []) {
    identifiedByMovement.set(r.movement_id as string, r.client_company_id as string);
  }

  const receiptsByClient = new Map<string, { amount: number; currency: string }[]>();
  for (const r of receiptRows ?? []) {
    const cid = r.company_id as string;
    const list = receiptsByClient.get(cid) ?? [];
    list.push({ amount: Number(r.amount), currency: (r.currency_code || r.currency) as string });
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

  return clusters.map((cluster) => {
    const clientMatches = matchClusterToClients(cluster, clients);
    const distinctClientIds = Array.from(new Set(clientMatches.map((m) => m.clientCompanyId)));
    const hasCorroboratingReceipt = distinctClientIds.some((cid) =>
      (receiptsByClient.get(cid) ?? []).some((r) => cluster.currencies.includes(r.currency))
    );
    const evidence = classifyEvidence({ cluster, clientMatches, hasCorroboratingReceipt });

    const movements: PayerClusterMovementView[] = cluster.movements.map((m) => {
      const alreadyIdentifiedClientId = identifiedByMovement.get(m.movementId) ?? null;
      const hasFinancialLink = linkedMovementIds.has(m.movementId);
      const hasCompatibleReceipt = distinctClientIds.some((cid) =>
        (receiptsByClient.get(cid) ?? []).some(
          (r) => r.currency === m.currency && Math.abs(r.amount - m.amount) <= 0.01
        )
      );
      const level = deriveIdentificationLevel({
        clientConfirmed: alreadyIdentifiedClientId !== null,
        hasCompatibleReceipt,
        hasFinancialLink,
        hasInvoiceAllocations: false,
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
      };
    });

    return {
      clusterKey: cluster.clusterKey,
      displayName: cluster.displayName,
      months: cluster.months,
      currencies: cluster.currencies,
      totalByCurrency: cluster.totalByCurrency,
      movementCount: cluster.movements.length,
      clientMatches,
      evidence,
      movements,
    };
  });
}
