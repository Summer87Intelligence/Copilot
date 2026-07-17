/**
 * Mappers DB → dominio del motor puro / propuestas shadow.
 */

import { normalizePayerName } from "@/lib/bank/intelligence/name-normalizer";
import {
  deriveMovementFingerprint,
  derivePayerFingerprint,
  type PayerFingerprint,
  type PayerSignals,
} from "@/lib/bank/intelligence/payer-fingerprint";
import type {
  ClientCandidate,
  InvoiceCandidate,
  NormalizedBankMovement,
  PayerClientLink,
  ReceiptCandidate,
  ReconciliationCandidateResult,
} from "@/lib/bank/intelligence/reconciliation-matching";
import { RECONCILIATION_ENGINE_VERSION } from "@/lib/bank/intelligence/reconciliation-matching";
import { normalizeCurrency, toMinorUnits } from "@/lib/bank/intelligence/server/money";
import type {
  BankMovementRow,
  ClientPayerLinkRow,
  PayerIdentityRow,
  ProtoClientRow,
  ProtoInvoiceRow,
  ProtoReceiptRow,
} from "@/lib/bank/intelligence/server/repositories";
import type {
  ShadowCandidateEvidence,
  ShadowProposal,
} from "@/lib/bank/intelligence/server/types";

const VOID_RECEIPT = ["void", "voided", "canceled", "cancelled", "anulada"];

/**
 * Extrae señales de pagador SIN usar account_label (cuenta propia/destino).
 * Solo metadata de origen / documento si el importador las dejó.
 */
export function extractPayerSignalsFromMovement(row: BankMovementRow): PayerSignals {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const accountRaw =
    typeof meta.origin_account === "string"
      ? meta.origin_account
      : typeof meta.payer_account === "string"
        ? meta.payer_account
        : typeof meta.counterparty_account === "string"
          ? meta.counterparty_account
          : null;
  const documentId =
    typeof meta.document_id === "string"
      ? meta.document_id
      : typeof meta.payer_document === "string"
        ? meta.payer_document
        : typeof meta.rut === "string"
          ? meta.rut
          : null;
  const payerName =
    typeof meta.payer_name === "string" && meta.payer_name.trim()
      ? meta.payer_name
      : (row.description ?? row.raw_description ?? null);

  return {
    bankName: row.bank_name,
    accountRaw,
    documentId,
    payerName,
  };
}

export function mapMovementRow(
  row: BankMovementRow,
  opts?: { isProbableDuplicate?: boolean; isReversed?: boolean }
): {
  movement: NormalizedBankMovement;
  payerFp: PayerFingerprint;
  movementFpHash: string;
} {
  const currency = normalizeCurrency(row.currency) ?? "UYU";
  const amountMajor = typeof row.amount === "number" ? row.amount : Number(row.amount);
  const amountMinor = toMinorUnits(Number.isFinite(amountMajor) ? amountMajor : 0);
  const date = String(row.movement_date).slice(0, 10);
  const signals = extractPayerSignalsFromMovement(row);
  const payerFp = derivePayerFingerprint(signals);
  const movementFp = deriveMovementFingerprint({
    bankName: row.bank_name,
    bankReference: row.bank_reference,
    amountMinor,
    dateYmd: date,
    currency,
  });

  const movement: NormalizedBankMovement = {
    id: row.id,
    workspaceId: row.workspace_id,
    amountMinor,
    currency,
    direction: row.direction === "outflow" ? "outflow" : "inflow",
    date,
    payerFingerprintHash: payerFp.hash,
    normalizedPayerName: payerFp.normalizedName || normalizePayerName(signals.payerName),
    bankReference: row.bank_reference,
    isProbableDuplicate: opts?.isProbableDuplicate === true,
    isReversed: opts?.isReversed === true || String(row.status).toLowerCase() === "ignored",
    isNonCommercial: false,
  };

  return { movement, payerFp, movementFpHash: movementFp.hash };
}

export function mapClientRow(row: ProtoClientRow): ClientCandidate | null {
  if (row.workspace_company_id == null) return null;
  return {
    clientId: row.id,
    workspaceId: row.workspace_company_id,
    normalizedName: normalizePayerName(row.name),
  };
}

export function mapReceiptRow(
  row: ProtoReceiptRow,
  alreadyReconciled: boolean
): ReceiptCandidate | null {
  const currency = normalizeCurrency(row.currency_code);
  if (!currency || !row.company_id) return null;
  const st = String(row.status ?? "").toLowerCase();
  if (VOID_RECEIPT.some((x) => st.includes(x))) return null;
  const amountMajor = typeof row.amount === "number" ? row.amount : Number(row.amount);
  return {
    receiptId: row.id,
    clientId: row.company_id,
    workspaceId: row.workspace_company_id,
    amountMinor: toMinorUnits(Number.isFinite(amountMajor) ? amountMajor : 0),
    currency,
    date: String(row.receipt_date).slice(0, 10),
    alreadyReconciled,
  };
}

export function mapInvoiceRow(row: ProtoInvoiceRow): InvoiceCandidate | null {
  const currency = normalizeCurrency(row.currency_code);
  if (!currency || !row.company_id) return null;
  const bal =
    typeof row.balance_amount === "number"
      ? row.balance_amount
      : Number(row.balance_amount ?? 0);
  return {
    invoiceId: row.id,
    clientId: row.company_id,
    workspaceId: row.workspace_company_id,
    currency,
    outstandingMinor: toMinorUnits(Number.isFinite(bal) ? bal : 0),
    date: String(row.issue_date ?? row.due_date ?? "").slice(0, 10) || "1970-01-01",
  };
}

export function mapPayerLink(
  link: ClientPayerLinkRow,
  identity: PayerIdentityRow
): PayerClientLink {
  return {
    fingerprintHash: identity.account_hash,
    clientId: link.client_company_id,
    workspaceId: link.workspace_id,
    status: link.status as PayerClientLink["status"],
    paymentsCount: Number(link.reconciled_count) || 0,
  };
}

export function mapMatchResultToProposal(input: {
  workspaceId: string;
  bankMovementId: string;
  payerIdentityId: string | null;
  payerFp: PayerFingerprint;
  movementFpHash: string;
  result: ReconciliationCandidateResult;
  dateWindowDays: number;
  generatedAt?: string;
}): ShadowProposal {
  const { result } = input;
  const evidence: ShadowCandidateEvidence = {
    payerFingerprintStrength: input.payerFp.strength,
    matchedClientIds: result.clientId ? [result.clientId] : [],
    matchedReceiptIds: result.receiptId ? [result.receiptId] : [],
    invoiceAllocationIds: result.invoiceAllocations.map((a) => a.invoiceId),
    historicalLinkStatuses: [],
    dateWindowDays: input.dateWindowDays,
    reasons: [...result.reasons],
    warnings: [...result.warnings],
  };

  return {
    workspaceId: input.workspaceId,
    bankMovementId: input.bankMovementId,
    payerIdentityId: input.payerIdentityId,
    proposedClientId: result.clientId ?? null,
    proposedReceiptId: result.receiptId ?? null,
    confidence: Math.max(0, Math.min(100, Math.round(result.confidence))),
    reasons: [...result.reasons],
    warnings: [...result.warnings],
    recommendedAction: result.recommendedAction,
    engineVersion: RECONCILIATION_ENGINE_VERSION,
    movementFingerprint: input.movementFpHash,
    payerFingerprint: input.payerFp.hash,
    candidateEvidence: evidence,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    proposedInvoiceAllocations: result.invoiceAllocations.map((a) => ({
      invoiceId: a.invoiceId,
      amountMinor: a.amountMinor,
    })),
  };
}
