import type { SupabaseClient } from "@supabase/supabase-js";

import type { CobranzaRegistrarCobroBody } from "@/lib/api/schemas/cobranza-registrar-cobro-body";
import { collectionCreateAction } from "@/lib/copilot-collection-service";
import type { CollectionAction } from "@/lib/copilot-collection-types";
import {
  COBRANZA_REGISTRAR_COBRO_SOURCE,
  COLLECTION_PAYMENT_METADATA_SCHEMA_VERSION,
  COLLECTION_PAYMENT_REGISTERED_KIND,
} from "@/lib/cobranza/registrar-cobro-constants";
import { mapManualCashMovementRow } from "@/lib/treasury/treasury-mappers";
import { manualCashMovementCreate } from "@/lib/treasury/services/manual-cash-movement-service";
import { ensureTreasuryAccountForMovement, eqTreasuryWorkspace } from "@/lib/treasury/treasury-db-helpers";
import { resolveTreasuryWorkspaceId } from "@/lib/treasury/treasury-tenant";
import type {
  ManualCashLedgerType,
  ManualCashMovement,
  TreasuryAccount,
  TreasuryCurrencyCode,
} from "@/lib/treasury/treasury-types";

export type RegistrarCobroWarning = {
  code: string;
  message: string;
};

export type RegistrarCobroResponseData = {
  manual_cash_movement: {
    id: string;
    amount: number;
    currency_code: TreasuryCurrencyCode;
    movement_date: string;
  };
  collection_action: {
    id: string;
    action_type: string;
    status: string;
  };
};

export type RegistrarCobroSuccess = {
  ok: true;
  message: string;
  data: RegistrarCobroResponseData;
  warnings: RegistrarCobroWarning[];
  refresh_hints: string[];
  idempotent?: boolean;
};

export type RegistrarCobroFailure = {
  ok: false;
  code: "VALIDATION" | "NOT_FOUND" | "DATABASE" | "PARTIAL";
  message: string;
  partial?: boolean;
  movement_id?: string;
  warnings?: RegistrarCobroWarning[];
};

export type RegistrarCobroResult = RegistrarCobroSuccess | RegistrarCobroFailure;

type ProtoCompanyRow = {
  id: string;
  name: string;
};

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function ledgerTypeFromTreasuryAccount(account: TreasuryAccount | null): ManualCashLedgerType {
  if (!account) return "cash";
  switch (account.type) {
    case "cash":
      return "cash";
    case "bank":
    case "investment":
      return "bank";
    case "wallet":
      return "virtual_wallet";
    case "credit_card":
      return "credit_card";
    default:
      return "cash";
  }
}

function contactDateFromPaymentDate(paymentDate: string): string {
  return `${paymentDate}T12:00:00.000Z`;
}

export function buildRegistrarCobroWarnings(
  body: Pick<CobranzaRegistrarCobroBody, "bank_origin" | "reference">
): RegistrarCobroWarning[] {
  const bankOrigin = body.bank_origin?.trim();
  const reference = body.reference?.trim();
  if (bankOrigin && !reference) {
    return [
      {
        code: "missing_reference",
        message: "Transferencia sin referencia bancaria.",
      },
    ];
  }
  return [];
}

export function buildCollectionActionNotes(
  body: Pick<CobranzaRegistrarCobroBody, "amount" | "currency_code" | "reference">
): string {
  const referenceLabel = body.reference?.trim() || "sin referencia";
  return `Cobro registrado: ${body.currency_code} ${body.amount}. Referencia: ${referenceLabel}.`;
}

function buildMovementMetadata(
  body: CobranzaRegistrarCobroBody,
  companyId: string,
  affectsCashflow: boolean
): Record<string, unknown> {
  return {
    kind: COLLECTION_PAYMENT_REGISTERED_KIND,
    schema_version: COLLECTION_PAYMENT_METADATA_SCHEMA_VERSION,
    source: COBRANZA_REGISTRAR_COBRO_SOURCE,
    client_request_id: body.client_request_id,
    proto_company_id: companyId,
    bank_origin: body.bank_origin?.trim() || null,
    reference: body.reference?.trim() || null,
    affects_cashflow: affectsCashflow,
  };
}

function buildActionMetadata(
  body: CobranzaRegistrarCobroBody,
  movementId: string,
  affectsCashflow: boolean
): Record<string, unknown> {
  return {
    kind: COLLECTION_PAYMENT_REGISTERED_KIND,
    schema_version: COLLECTION_PAYMENT_METADATA_SCHEMA_VERSION,
    source: COBRANZA_REGISTRAR_COBRO_SOURCE,
    client_request_id: body.client_request_id,
    manual_cash_movement_id: movementId,
    amount: body.amount,
    currency_code: body.currency_code,
    payment_date: body.payment_date,
    bank_origin: body.bank_origin?.trim() || null,
    reference: body.reference?.trim() || null,
    affects_cashflow: affectsCashflow,
  };
}

function toResponseData(
  movement: ManualCashMovement,
  action: CollectionAction
): RegistrarCobroResponseData {
  return {
    manual_cash_movement: {
      id: movement.id,
      amount: movement.amount,
      currency_code: movement.currencyCode,
      movement_date: movement.movementDate,
    },
    collection_action: {
      id: action.id,
      action_type: action.actionType,
      status: action.status,
    },
  };
}

function successMessage(idempotent: boolean): string {
  if (idempotent) {
    return "Cobro ya registrado (idempotente). Impacta Tesorería local; no modifica facturas en Zeta.";
  }
  return "Cobro registrado. Impacta Tesorería local; no modifica facturas en Zeta.";
}

const REFRESH_HINTS = ["cobranza", "treasury_cash_position", "hoy"] as const;

async function fetchProtoCompany(
  supabase: SupabaseClient,
  workspaceId: string,
  companyId: string
): Promise<ProtoCompanyRow | null> {
  const { data, error } = await supabase
    .from("proto_companies")
    .select("id, name")
    .eq("workspace_company_id", workspaceId)
    .eq("id", companyId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const id = str(row.id);
  const name = str(row.name);
  if (!id || !name) return null;
  return { id, name };
}

async function findMovementByClientRequestId(
  supabase: SupabaseClient,
  workspaceId: string,
  clientRequestId: string
): Promise<ManualCashMovement | null> {
  const { data, error } = await eqTreasuryWorkspace(
    supabase.from("manual_cash_movements").select("*"),
    workspaceId
  )
    .eq("metadata->>client_request_id", clientRequestId)
    .maybeSingle();

  if (error || !data) return null;
  return mapManualCashMovementRow(data as Record<string, unknown>);
}

async function findActionByClientRequestId(
  supabase: SupabaseClient,
  workspaceId: string,
  clientRequestId: string
): Promise<CollectionAction | null> {
  const { data, error } = await supabase
    .from("collection_actions")
    .select("*")
    .eq("workspace_company_id", workspaceId)
    .eq("metadata->>client_request_id", clientRequestId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: str(row.id),
    workspaceCompanyId: str(row.workspace_company_id),
    companyId: str(row.company_id),
    status: str(row.status) as CollectionAction["status"],
    actionType: str(row.action_type) as CollectionAction["actionType"],
    priority: str(row.priority) as CollectionAction["priority"],
    assignedTo: row.assigned_to != null ? str(row.assigned_to) || null : null,
    createdBy: row.created_by != null ? str(row.created_by) || null : null,
    dueDate: row.due_date != null ? str(row.due_date) : null,
    contactDate: row.contact_date != null ? str(row.contact_date) : null,
    nextActionDate: row.next_action_date != null ? str(row.next_action_date) : null,
    promiseDate: row.promise_date != null ? str(row.promise_date) : null,
    promiseAmount: typeof row.promise_amount === "number" ? row.promise_amount : null,
    promiseCurrency:
      row.promise_currency != null
        ? (str(row.promise_currency) as CollectionAction["promiseCurrency"])
        : null,
    notes: row.notes != null ? str(row.notes) || null : null,
    metadata:
      row.metadata != null && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : null,
    isActive: Boolean(row.is_active),
    archivedAt: row.archived_at != null ? str(row.archived_at) : null,
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

async function createCollectionEvidence(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  body: CobranzaRegistrarCobroBody,
  movementId: string,
  affectsCashflow: boolean
): Promise<ReturnType<typeof collectionCreateAction>> {
  return collectionCreateAction(
    supabase,
    {
      companyId: body.company_id,
      actionType: "internal_note",
      status: "contacted",
      contactDate: contactDateFromPaymentDate(body.payment_date),
      notes: buildCollectionActionNotes(body),
      metadata: buildActionMetadata(body, movementId, affectsCashflow),
    },
    tenantCompanyId
  );
}

export async function registrarCobro(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  body: CobranzaRegistrarCobroBody
): Promise<RegistrarCobroResult> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
  const warnings = buildRegistrarCobroWarnings(body);
  const affectsCashflow = body.affects_cashflow ?? true;
  const clientRequestId = body.client_request_id.trim();

  const [existingMovement, existingAction] = await Promise.all([
    findMovementByClientRequestId(supabase, workspaceId, clientRequestId),
    findActionByClientRequestId(supabase, workspaceId, clientRequestId),
  ]);

  if (existingMovement && existingAction) {
    return {
      ok: true,
      idempotent: true,
      message: successMessage(true),
      data: toResponseData(existingMovement, existingAction),
      warnings,
      refresh_hints: [...REFRESH_HINTS],
    };
  }

  const company = await fetchProtoCompany(supabase, workspaceId, body.company_id);
  if (!company) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "Cliente no encontrado en el workspace.",
    };
  }

  const accountCheck = await ensureTreasuryAccountForMovement(
    supabase,
    workspaceId,
    body.account_id ?? null,
    body.currency_code
  );
  if (!accountCheck.ok) {
    return {
      ok: false,
      code: accountCheck.code === "NOT_FOUND" ? "NOT_FOUND" : "VALIDATION",
      message: accountCheck.message,
    };
  }

  let movement = existingMovement;

  if (!movement) {
    const ledgerType = ledgerTypeFromTreasuryAccount(accountCheck.data);
    const bankOrigin = body.bank_origin?.trim() || null;
    const reference = body.reference?.trim() || null;
    const notes = body.notes?.trim() || null;

    const movementResult = await manualCashMovementCreate(supabase, tenantCompanyId, {
      account_id: body.account_id ?? null,
      ledger_type: ledgerType,
      movement_type: "income",
      source: "manual",
      concept: `Cobro — ${company.name}`,
      category: "cobranza",
      amount: body.amount,
      currency_code: body.currency_code,
      movement_date: body.payment_date,
      payment_method: bankOrigin,
      counterparty: company.name,
      reference,
      notes,
      affects_cashflow: affectsCashflow,
      metadata: buildMovementMetadata(body, company.id, affectsCashflow),
    });

    if (!movementResult.ok) {
      return {
        ok: false,
        code: movementResult.code === "VALIDATION" ? "VALIDATION" : "DATABASE",
        message: movementResult.message,
        warnings,
      };
    }
    movement = movementResult.data;
  }

  if (existingAction) {
    return {
      ok: true,
      idempotent: true,
      message: successMessage(true),
      data: toResponseData(movement, existingAction),
      warnings,
      refresh_hints: [...REFRESH_HINTS],
    };
  }

  const actionResult = await createCollectionEvidence(
    supabase,
    tenantCompanyId,
    body,
    movement.id,
    affectsCashflow
  );

  if (!actionResult.ok) {
    return {
      ok: false,
      partial: true,
      code: "PARTIAL",
      message:
        "El movimiento de caja se creó pero falló la evidencia de cobranza. Reintentá con el mismo client_request_id o reconciliá manualmente.",
      movement_id: movement.id,
      warnings,
    };
  }

  return {
    ok: true,
    message: successMessage(false),
    data: toResponseData(movement, actionResult.data),
    warnings,
    refresh_hints: [...REFRESH_HINTS],
  };
}
