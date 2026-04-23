import type { SupabaseClient } from "@supabase/supabase-js";

export type FinancialPeriodValidationRow = {
  id: string;
  company_id: string;
  period_month: string;
  validated: boolean;
  validated_at: string | null;
  validated_by: string | null;
  source: string | null;
  notes: string | null;
};

/**
 * Lee validación de período para el workspace.
 *
 * El tercer argumento debe ser siempre `auth.ctx.supabase` (RLS con JWT o service role en PIN).
 */
export async function getFinancialValidation(
  companyId: string,
  periodMonth: string,
  supabase: SupabaseClient
): Promise<FinancialPeriodValidationRow | null> {
  const { data, error } = await supabase
    .from("financial_period_validations")
    .select(
      "id, company_id, period_month, validated, validated_at, validated_by, source, notes"
    )
    .eq("company_id", companyId)
    .eq("period_month", periodMonth)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return null;
  return data as FinancialPeriodValidationRow;
}

export type ValidateFinancialPeriodParams = {
  companyId: string;
  periodMonth: string;
  user: string;
  source?: string;
  notes?: string | null;
};

const DEFAULT_SOURCE = "zeta_excel";

/**
 * Inserta o actualiza validación de período (una fila por `company_id` + `period_month`).
 *
 * El primer argumento debe ser siempre `auth.ctx.supabase`.
 */
export async function validateFinancialPeriod(
  supabase: SupabaseClient,
  params: ValidateFinancialPeriodParams
): Promise<FinancialPeriodValidationRow> {
  const source = params.source?.trim() || DEFAULT_SOURCE;
  const notes = params.notes == null || params.notes === "" ? null : String(params.notes);
  const now = new Date().toISOString();

  const payload = {
    company_id: params.companyId,
    period_month: params.periodMonth,
    validated: true,
    validated_at: now,
    validated_by: params.user,
    source,
    notes,
  };

  const { data: existing, error: selErr } = await supabase
    .from("financial_period_validations")
    .select("id")
    .eq("company_id", params.companyId)
    .eq("period_month", params.periodMonth)
    .maybeSingle();

  if (selErr) {
    throw new Error(selErr.message);
  }

  if (existing?.id) {
    const { data, error } = await supabase
      .from("financial_period_validations")
      .update(payload)
      .eq("id", existing.id)
      .select(
        "id, company_id, period_month, validated, validated_at, validated_by, source, notes"
      )
      .single();

    if (error) {
      throw new Error(error.message);
    }
    return data as FinancialPeriodValidationRow;
  }

  const { data, error } = await supabase
    .from("financial_period_validations")
    .insert(payload)
    .select(
      "id, company_id, period_month, validated, validated_at, validated_by, source, notes"
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }
  return data as FinancialPeriodValidationRow;
}
