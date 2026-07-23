/**
 * FASE BANK-UNIFIED-INCOME-RECONCILIATION-WORKSPACE-001 — la pestaña Ingresos
 * pasa a ser la única bandeja operativa diaria: identificación de cliente y
 * conciliación completa en una misma pantalla, consumiendo exclusivamente el
 * motor canónico (D). Sin motor nuevo, sin writer paralelo.
 *
 * Este módulo es puro (sin I/O) salvo `buildIncomeWorkspaceRows`, que orquesta
 * lecturas ya existentes (`listOperationalSuggestionsForIncomeWorkspace` +
 * `buildEvidenceForSuggestions`). El movimiento bancario es la unidad
 * principal: cada `bank_movement` positivo aparece una única vez, con la
 * sugerencia canónica "vigente" (si existe) fusionada.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { getBankMovementAuditDisplayDescription } from "@/lib/bank-movements/bank-movement-display";
import { listOperationalSuggestionsForIncomeWorkspace, type BankMovementRow } from "@/lib/bank/intelligence/server/repositories";
import type { ShadowSuggestionRow } from "@/lib/bank/intelligence/server/types";
import {
  buildEvidenceForSuggestions,
  type CanonicalSuggestionEvidence,
} from "@/lib/bank/canonical/canonical-suggestion-evidence";

export const INCOME_ROW_STATUSES = [
  "sin_identificar",
  "cliente_sugerido",
  "con_coincidencia",
  "requiere_revision",
  "conciliado",
  "sugerencia_rechazada",
  "ignorado",
] as const;
export type IncomeRowStatus = (typeof INCOME_ROW_STATUSES)[number];

export const INCOME_ROW_STATUS_LABELS: Record<IncomeRowStatus, string> = {
  sin_identificar: "Sin identificar",
  cliente_sugerido: "Cliente sugerido",
  con_coincidencia: "Con coincidencia",
  requiere_revision: "Requiere revisión",
  conciliado: "Conciliado",
  sugerencia_rechazada: "Sugerencia rechazada",
  ignorado: "Ignorado",
};

export type IncomeWorkspaceRow = {
  movement: {
    id: string;
    date: string;
    amount: number;
    currency: string;
    descriptionMasked: string;
    accountLabel: string | null;
    bankMovementStatus: string;
  };
  status: IncomeRowStatus;
  evidence: CanonicalSuggestionEvidence | null;
};

/**
 * De todas las sugerencias `operational` históricas de un movimiento (puede haber
 * más de una: superseded/expired de corridas previas del motor), elige la ÚNICA
 * "vigente" para representar el estado actual del movimiento en la bandeja:
 * confirmada > rechazada > activa (generated/pending_review) > ninguna
 * (superseded/expired solamente ⇒ se trata como si no hubiera sugerencia).
 * Determinístico: ordena por `createdAt` antes de elegir "la última" de cada grupo.
 */
export function pickCurrentSuggestionForMovement(
  suggestions: ShadowSuggestionRow[]
): ShadowSuggestionRow | null {
  if (suggestions.length === 0) return null;
  const sorted = [...suggestions].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const byStatus = (status: ShadowSuggestionRow["status"]) => sorted.filter((s) => s.status === status);

  const confirmed = byStatus("confirmed");
  if (confirmed.length > 0) return confirmed[confirmed.length - 1]!;

  const rejected = byStatus("rejected");
  if (rejected.length > 0) return rejected[rejected.length - 1]!;

  const active = sorted.filter((s) => s.status === "generated" || s.status === "pending_review");
  if (active.length > 0) return active[active.length - 1]!;

  return null;
}

/**
 * Deriva el estado operativo de un movimiento de Ingresos a partir de su
 * evidencia canónica (o su ausencia). No depende del nivel de confianza humano
 * (Alta/Media/Baja) para distinguir "con coincidencia" de "requiere revisión":
 * un caso de confianza Baja puede tener cliente+recibo concretos y sin
 * conflicto (con coincidencia, solo conservador en el score), mientras que un
 * caso sin cliente propuesto o con advertencias (pagador compartido, candidatos
 * empatados) siempre requiere revisión, sin importar el score.
 */
export function deriveIncomeRowStatus(
  movement: { bankMovementStatus: string },
  evidence: CanonicalSuggestionEvidence | null
): IncomeRowStatus {
  if (movement.bankMovementStatus === "ignored") return "ignorado";
  if (!evidence) return "sin_identificar";
  if (evidence.status === "confirmed") return "conciliado";
  if (evidence.status === "rejected") return "sugerencia_rechazada";

  const hasConflict = evidence.payer?.hasConflict ?? false;
  const hasWarnings = evidence.warnings.length > 0;
  const hasConcreteMatch = evidence.client != null && evidence.receipt != null;

  if (hasConcreteMatch && !hasConflict && !hasWarnings) return "con_coincidencia";
  return "requiere_revision";
}

export type IncomeWorkspaceCounters = {
  pendientes: number;
  conCoincidencia: number;
  requiereRevision: number;
  sinIdentificar: number;
  conciliadosHoy: number;
};

/**
 * "Conciliados hoy" no se deriva de `rows` (la evidencia no trae `reviewed_at`) —
 * se reusa `countOperationalConfirmedSince()` (mismo corte Montevideo UTC-3 que
 * la bandeja anterior) y se pasa ya calculado.
 */
export function buildIncomeWorkspaceCounters(rows: IncomeWorkspaceRow[], conciliadosHoy: number): IncomeWorkspaceCounters {
  let pendientes = 0;
  let conCoincidencia = 0;
  let requiereRevision = 0;
  let sinIdentificar = 0;
  for (const row of rows) {
    if (row.status === "con_coincidencia") {
      conCoincidencia += 1;
      pendientes += 1;
    } else if (row.status === "requiere_revision") {
      requiereRevision += 1;
      pendientes += 1;
    } else if (row.status === "sin_identificar" || row.status === "cliente_sugerido") {
      sinIdentificar += 1;
      pendientes += 1;
    }
  }
  return { pendientes, conCoincidencia, requiereRevision, sinIdentificar, conciliadosHoy };
}

/**
 * Orquesta: sugerencias `operational` (todo status) para el lote de movimientos
 * dado -> elige la vigente por movimiento -> arma evidencia solo para las
 * elegidas (reusa `buildEvidenceForSuggestions`, sin re-consultar movimientos).
 * Los movimientos ya vienen cargados por el llamador (evita N+1: una sola
 * consulta batch de sugerencias + las consultas batch ya existentes de
 * clientes/pagadores/recibos/facturas dentro de `buildEvidenceForSuggestions`).
 */
export async function buildIncomeWorkspaceRows(
  supabase: SupabaseClient,
  workspaceId: string,
  movements: BankMovementRow[]
): Promise<IncomeWorkspaceRow[]> {
  if (movements.length === 0) return [];

  const movementIds = movements.map((m) => m.id);
  const suggestions = await listOperationalSuggestionsForIncomeWorkspace(supabase, workspaceId, movementIds);

  const suggestionsByMovement = new Map<string, ShadowSuggestionRow[]>();
  for (const s of suggestions) {
    const arr = suggestionsByMovement.get(s.bankMovementId) ?? [];
    arr.push(s);
    suggestionsByMovement.set(s.bankMovementId, arr);
  }

  const pickedSuggestions: ShadowSuggestionRow[] = [];
  const movementsById = new Map(movements.map((m) => [m.id, m]));
  for (const movement of movements) {
    const picked = pickCurrentSuggestionForMovement(suggestionsByMovement.get(movement.id) ?? []);
    if (picked) pickedSuggestions.push(picked);
  }

  const evidenceList = await buildEvidenceForSuggestions(supabase, workspaceId, pickedSuggestions, movementsById);
  const evidenceByMovementId = new Map(evidenceList.map((e) => [e.movement.id, e]));

  return movements.map((movement) => {
    const evidence = evidenceByMovementId.get(movement.id) ?? null;
    const movementView = {
      id: movement.id,
      date: movement.movement_date,
      amount: typeof movement.amount === "number" ? movement.amount : parseFloat(String(movement.amount)) || 0,
      currency: movement.currency,
      descriptionMasked: evidence?.movement.descriptionMasked ?? maskFallback(movement.description ?? movement.raw_description),
      accountLabel: movement.account_label,
      bankMovementStatus: movement.status,
    };
    return {
      movement: movementView,
      status: deriveIncomeRowStatus({ bankMovementStatus: movement.status }, evidence),
      evidence,
    };
  });
}

function maskFallback(description: string | null): string {
  return getBankMovementAuditDisplayDescription({ description, raw_description: description });
}
