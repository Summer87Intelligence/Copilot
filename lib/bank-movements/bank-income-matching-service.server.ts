import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeAliasText, extractPossiblePayerName } from "@/lib/bank-movements/bank-text-normalization";
import {
  buildIncomeCandidates,
  type IncomeCandidate,
  type IncomeClientInput,
  type IncomeMovementInput,
} from "@/lib/bank-movements/bank-income-matching";

type ClientRow = {
  id: string;
  name: string | null;
  legal_name: string | null;
  RazonSocial: string | null;
  RUT: string | null;
  tax_id: string | null;
};

type AliasRow = {
  client_id: string;
  alias_text: string;
  alias_type: string;
  currency: string | null;
  usual_amount: number | null;
  confidence_weight: number | null;
};

type ConceptRow = {
  id: string;
  client_id: string;
  label: string;
  currency: string;
  expected_amount: number | null;
  billing_type: string;
  frequency: string | null;
  expected_day: number | null;
  active: boolean;
};

/**
 * Arma los IncomeClientInput del workspace combinando clientes, alias
 * (client_bank_aliases + client_transfer_aliases existentes), conceptos, deuda
 * abierta y matches confirmados previos. Solo lectura.
 */
export async function loadWorkspaceIncomeClients(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<IncomeClientInput[]> {
  const [clientsRes, aliasesRes, transferAliasesRes, conceptsRes, debtRes, priorRes] =
    await Promise.all([
      supabase
        .from("proto_companies")
        .select('id, name, legal_name, "RazonSocial", "RUT", tax_id')
        .eq("workspace_company_id", workspaceId)
        .eq("is_active", true),
      supabase
        .from("client_bank_aliases")
        .select("client_id, alias_text, alias_type, currency, usual_amount, confidence_weight")
        .eq("workspace_id", workspaceId)
        .is("archived_at", null),
      supabase
        .from("client_transfer_aliases")
        .select("company_id, label")
        .eq("workspace_id", workspaceId)
        .eq("is_active", true),
      supabase
        .from("client_billing_concepts")
        .select("id, client_id, label, currency, expected_amount, billing_type, frequency, expected_day, active")
        .eq("workspace_id", workspaceId)
        .eq("active", true)
        .is("archived_at", null),
      supabase
        .from("proto_invoices")
        .select("company_id, currency, currency_code, balance_amount")
        .eq("workspace_company_id", workspaceId)
        .gt("balance_amount", 0),
      supabase
        .from("bank_income_matches")
        .select("client_id")
        .eq("workspace_id", workspaceId)
        .eq("match_status", "confirmed"),
    ]);

  const clients = (clientsRes.data ?? []) as ClientRow[];

  const aliasesByClient = new Map<string, IncomeClientInput["aliases"]>();
  for (const a of (aliasesRes.data ?? []) as AliasRow[]) {
    const list = aliasesByClient.get(a.client_id) ?? [];
    list.push({
      aliasText: a.alias_text,
      aliasType: a.alias_type,
      currency: a.currency,
      usualAmount: a.usual_amount,
      confidenceWeight: a.confidence_weight ?? 1,
    });
    aliasesByClient.set(a.client_id, list);
  }
  // Alias existentes de "Formas de transferencia" como fuente manual adicional.
  for (const t of (transferAliasesRes.data ?? []) as Array<{ company_id: string; label: string }>) {
    const list = aliasesByClient.get(t.company_id) ?? [];
    list.push({ aliasText: t.label, aliasType: "manual", currency: null, usualAmount: null });
    aliasesByClient.set(t.company_id, list);
  }

  const conceptsByClient = new Map<string, IncomeClientInput["concepts"]>();
  for (const c of (conceptsRes.data ?? []) as ConceptRow[]) {
    const list = conceptsByClient.get(c.client_id) ?? [];
    list.push({
      id: c.id,
      label: c.label,
      currency: c.currency,
      expectedAmount: c.expected_amount,
      billingType: (c.billing_type as IncomeClientInput["concepts"][number]["billingType"]) ?? "recurring",
      frequency: c.frequency,
      expectedDay: c.expected_day,
      active: c.active,
    });
    conceptsByClient.set(c.client_id, list);
  }

  const debtByClient = new Map<string, Map<string, number>>();
  for (const inv of (debtRes.data ?? []) as Array<{
    company_id: string;
    currency: string | null;
    currency_code: string | null;
    balance_amount: number | null;
  }>) {
    const cur = (inv.currency_code || inv.currency) === "USD" ? "USD" : "UYU";
    const byCur = debtByClient.get(inv.company_id) ?? new Map<string, number>();
    byCur.set(cur, (byCur.get(cur) ?? 0) + Number(inv.balance_amount ?? 0));
    debtByClient.set(inv.company_id, byCur);
  }

  const priorClients = new Set(
    ((priorRes.data ?? []) as Array<{ client_id: string }>).map((r) => r.client_id)
  );

  return clients.map((client) => {
    const debtMap = debtByClient.get(client.id);
    return {
      clientId: client.id,
      name: client.name ?? client.RazonSocial ?? "Cliente",
      legalName: client.legal_name ?? client.RazonSocial ?? null,
      rut: client.RUT ?? client.tax_id ?? null,
      aliases: aliasesByClient.get(client.id) ?? [],
      concepts: conceptsByClient.get(client.id) ?? [],
      openDebt: debtMap ? [...debtMap.entries()].map(([currency, balance]) => ({ currency, balance })) : [],
      hasPriorConfirmedMatch: priorClients.has(client.id),
    } satisfies IncomeClientInput;
  });
}

export async function suggestIncomeCandidatesForMovement(
  supabase: SupabaseClient,
  workspaceId: string,
  movement: IncomeMovementInput
): Promise<IncomeCandidate[]> {
  if (movement.direction !== "inflow") return [];
  const clients = await loadWorkspaceIncomeClients(supabase, workspaceId);
  return buildIncomeCandidates(movement, clients);
}

// ─── Confirmar / rechazar asociación ──────────────────────────────────────────

export type ConfirmIncomeMatchParams = {
  supabase: SupabaseClient;
  workspaceId: string;
  userId: string;
  movement: { id: string; description: string };
  clientId: string;
  billingConceptId?: string | null;
  confidence?: "high" | "medium" | "low" | null;
  score?: number | null;
  reasons?: string[];
  rememberAlias?: boolean;
  aliasText?: string | null;
};

export type ConfirmIncomeMatchResult = {
  match_id: string;
  alias_created: boolean;
};

/**
 * Confirma la asociación ingreso ↔ cliente/concepto y, opcionalmente, aprende el
 * alias bancario. NO toca caja, facturas, recibos ni Zeta.
 */
export async function confirmIncomeMatch(
  params: ConfirmIncomeMatchParams
): Promise<ConfirmIncomeMatchResult> {
  const { supabase, workspaceId, userId, movement, clientId } = params;
  const now = new Date().toISOString();

  const row = {
    workspace_id: workspaceId,
    bank_movement_id: movement.id,
    client_id: clientId,
    billing_concept_id: params.billingConceptId ?? null,
    match_status: "confirmed" as const,
    confidence: params.confidence ?? null,
    score: params.score ?? null,
    reasons: params.reasons ?? [],
    confirmed_by: userId,
    confirmed_at: now,
  };

  // Un solo confirmado por movimiento: reemplazar si ya existe.
  const { data: existing } = await supabase
    .from("bank_income_matches")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("bank_movement_id", movement.id)
    .eq("match_status", "confirmed")
    .maybeSingle();

  let matchId: string;
  if (existing?.id) {
    const { data, error } = await supabase
      .from("bank_income_matches")
      .update(row)
      .eq("workspace_id", workspaceId)
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error) throw new Error("INCOME_MATCH_UPDATE_FAILED");
    matchId = data.id as string;
  } else {
    const { data, error } = await supabase
      .from("bank_income_matches")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error("INCOME_MATCH_INSERT_FAILED");
    matchId = data.id as string;
  }

  let aliasCreated = false;
  if (params.rememberAlias) {
    const rawAlias = (params.aliasText ?? extractPossiblePayerName(movement.description) ?? "").trim();
    const normalized = normalizeAliasText(rawAlias);
    if (rawAlias.length >= 3 && normalized.length >= 3) {
      const { data: dupe } = await supabase
        .from("client_bank_aliases")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("client_id", clientId)
        .eq("normalized_alias", normalized)
        .is("archived_at", null)
        .maybeSingle();
      if (!dupe) {
        const { error } = await supabase.from("client_bank_aliases").insert({
          workspace_id: workspaceId,
          client_id: clientId,
          alias_text: rawAlias,
          normalized_alias: normalized,
          alias_type: "learned",
          learned_from_bank_movement_id: movement.id,
          created_by: userId,
          metadata: { learned_at: now },
        });
        if (!error) aliasCreated = true;
      }
    }
  }

  return { match_id: matchId, alias_created: aliasCreated };
}

export async function rejectIncomeMatch(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  userId: string;
  movementId: string;
  clientId: string;
}): Promise<{ match_id: string }> {
  const { supabase, workspaceId, userId, movementId, clientId } = params;
  const { data, error } = await supabase
    .from("bank_income_matches")
    .insert({
      workspace_id: workspaceId,
      bank_movement_id: movementId,
      client_id: clientId,
      match_status: "rejected",
      confirmed_by: userId,
      confirmed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error("INCOME_MATCH_REJECT_FAILED");
  return { match_id: data.id as string };
}
