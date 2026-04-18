import type { OperationalSupabase } from "@/lib/data/supabase-operational-data";

const ROW_CAP = 5000;
const INSIGHT_ROW_LIMIT = 100;

/**
 * Dataset del motor de flujo de caja (columnas mínimas).
 */
export async function loadCashflowEngineDatasetRows(client: OperationalSupabase) {
  const [recRes, payRes, invRes] = await Promise.all([
    client
      .from("proto_receipts")
      .select("amount,invoice_id,receipt_date,company_id")
      .eq("is_active", true)
      .order("receipt_date", { ascending: false })
      .limit(ROW_CAP),
    client
      .from("proto_payments")
      .select("amount,payment_date")
      .eq("is_active", true)
      .order("payment_date", { ascending: false })
      .limit(ROW_CAP),
    client
      .from("proto_invoices")
      .select(
        "id,company_id,issue_date,due_date,balance_amount,collection_probability"
      )
      .eq("is_active", true)
      .order("issue_date", { ascending: false })
      .limit(ROW_CAP),
  ]);

  if (recRes.error) throw new Error(recRes.error.message);
  if (payRes.error) throw new Error(payRes.error.message);
  if (invRes.error) throw new Error(invRes.error.message);

  return {
    receipts: recRes.data ?? [],
    payments: payRes.data ?? [],
    invoices: invRes.data ?? [],
  };
}

/**
 * Filas para snapshot financiero consolidado (`copilot-financial-engine`).
 */
export async function loadFinancialSnapshotRows(client: OperationalSupabase) {
  const [recRes, payRes, invRes, taxObRes, taxPayRes] = await Promise.all([
    client
      .from("proto_receipts")
      .select("amount")
      .eq("is_active", true)
      .limit(ROW_CAP),
    client
      .from("proto_payments")
      .select("amount,payment_date")
      .eq("is_active", true)
      .limit(ROW_CAP),
    client
      .from("proto_invoices")
      .select("balance_amount,collection_probability")
      .eq("is_active", true)
      .limit(ROW_CAP),
    client
      .from("proto_tax_obligations")
      .select("*")
      .eq("is_active", true)
      .limit(ROW_CAP),
    client
      .from("proto_tax_payments")
      .select("*")
      .eq("is_active", true)
      .limit(ROW_CAP),
  ]);

  if (recRes.error) throw new Error(recRes.error.message);
  if (payRes.error) throw new Error(payRes.error.message);
  if (invRes.error) throw new Error(invRes.error.message);
  if (taxObRes.error) throw new Error(taxObRes.error.message);
  if (taxPayRes.error) throw new Error(taxPayRes.error.message);

  return {
    receipts: recRes.data ?? [],
    payments: payRes.data ?? [],
    invoices: invRes.data ?? [],
    taxObligations: taxObRes.data ?? [],
    taxPayments: taxPayRes.data ?? [],
  };
}

/** Columnas `amount` para caja simplificada (`copilot-financial-intelligence`). */
export async function loadCashStatusAmountRows(client: OperationalSupabase) {
  const [inRes, outRes] = await Promise.all([
    client
      .from("proto_receipts")
      .select("amount")
      .eq("is_active", true)
      .limit(ROW_CAP),
    client
      .from("proto_payments")
      .select("amount")
      .eq("is_active", true)
      .limit(ROW_CAP),
  ]);

  if (inRes.error) throw new Error(inRes.error.message);
  if (outRes.error) throw new Error(outRes.error.message);

  return { inflows: inRes.data ?? [], outflows: outRes.data ?? [] };
}

export async function selectProtoInvoicesInsightWindow(client: OperationalSupabase) {
  return client
    .from("proto_invoices")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(INSIGHT_ROW_LIMIT);
}

export async function selectProtoPaymentsInsightWindow(client: OperationalSupabase) {
  return client
    .from("proto_payments")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(INSIGHT_ROW_LIMIT);
}

export async function selectProtoCompaniesInsightWindow(client: OperationalSupabase) {
  return client
    .from("proto_companies")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(INSIGHT_ROW_LIMIT);
}

/** Lecturas acotadas en un solo round-trip cuando hacen falta las tres tablas. */
export async function loadInsightEngineProtoRows(client: OperationalSupabase) {
  const [invRes, payRes, compRes] = await Promise.all([
    selectProtoInvoicesInsightWindow(client),
    selectProtoPaymentsInsightWindow(client),
    selectProtoCompaniesInsightWindow(client),
  ]);

  if (invRes.error) throw new Error(invRes.error.message);
  if (payRes.error) throw new Error(payRes.error.message);
  if (compRes.error) throw new Error(compRes.error.message);

  return {
    invoices: (invRes.data ?? []) as Record<string, unknown>[],
    payments: (payRes.data ?? []) as Record<string, unknown>[],
    companies: (compRes.data ?? []) as Record<string, unknown>[],
  };
}

/** Paralelo de lecturas para `copilot-clients-portfolio`. */
export async function loadClientPortfolioSourceRows(client: OperationalSupabase) {
  const [cRes, iRes, rRes, ctRes] = await Promise.all([
    client
      .from("proto_companies")
      .select("*")
      .eq("is_active", true)
      .limit(ROW_CAP),
    client
      .from("proto_invoices")
      .select("*")
      .eq("is_active", true)
      .limit(ROW_CAP),
    client
      .from("proto_receipts")
      .select("*")
      .eq("is_active", true)
      .limit(ROW_CAP),
    client
      .from("proto_contacts")
      .select("*")
      .eq("is_active", true)
      .limit(ROW_CAP),
  ]);

  return { cRes, iRes, rRes, ctRes };
}

export async function selectProtoTaxObligationsActiveOrdered(
  client: OperationalSupabase
) {
  return client
    .from("proto_tax_obligations")
    .select("*")
    .eq("is_active", true)
    .order("due_date", { ascending: true });
}

export async function selectProtoTaxPaymentsActiveOrdered(
  client: OperationalSupabase
) {
  return client
    .from("proto_tax_payments")
    .select("*")
    .eq("is_active", true)
    .order("payment_date", { ascending: false });
}

export async function selectProtoTaxPaymentsByObligationId(
  client: OperationalSupabase,
  obligationId: string
) {
  return client
    .from("proto_tax_payments")
    .select("*")
    .eq("obligation_id", obligationId)
    .eq("is_active", true)
    .order("payment_date", { ascending: false });
}

export async function selectProtoTaxObligationById(
  client: OperationalSupabase,
  id: string
) {
  return client.from("proto_tax_obligations").select("*").eq("id", id).maybeSingle();
}

export async function selectTaxAgendaForwardWindow(
  client: OperationalSupabase,
  selectCols: string,
  todayYmd: string,
  endYmd: string
) {
  return client
    .from("proto_tax_obligations")
    .select(selectCols)
    .eq("is_active", true)
    .gte("due_date", todayYmd)
    .lte("due_date", endYmd)
    .order("due_date", { ascending: true });
}

export async function selectTaxAgendaOverdueOpen(
  client: OperationalSupabase,
  selectCols: string,
  todayYmd: string
) {
  return client
    .from("proto_tax_obligations")
    .select(selectCols)
    .eq("is_active", true)
    .lt("due_date", todayYmd)
    .neq("status", "paid")
    .order("due_date", { ascending: true });
}

/** Paralelo de lecturas para `copilot-financial-alerts` (dataset predictivo). */
export async function loadPredictiveFinancialAlertsDatasetRows(
  client: OperationalSupabase
) {
  const [payRes, taxObRes, taxPayRes, recRes, invRes] = await Promise.all([
    client
      .from("proto_payments")
      .select("id,amount,payment_date,category,obligation_id")
      .eq("is_active", true)
      .limit(ROW_CAP),
    client
      .from("proto_tax_obligations")
      .select("*")
      .eq("is_active", true)
      .limit(ROW_CAP),
    client
      .from("proto_tax_payments")
      .select("*")
      .eq("is_active", true)
      .limit(ROW_CAP),
    client
      .from("proto_receipts")
      .select("amount")
      .eq("is_active", true)
      .limit(ROW_CAP),
    client
      .from("proto_invoices")
      .select("balance_amount,collection_probability")
      .eq("is_active", true)
      .limit(ROW_CAP),
  ]);

  if (payRes.error) throw new Error(payRes.error.message);
  if (taxObRes.error) throw new Error(taxObRes.error.message);
  if (taxPayRes.error) throw new Error(taxPayRes.error.message);
  if (recRes.error) throw new Error(recRes.error.message);
  if (invRes.error) throw new Error(invRes.error.message);

  return {
    payments: payRes.data ?? [],
    obligations: taxObRes.data ?? [],
    taxPayments: taxPayRes.data ?? [],
    receipts: recRes.data ?? [],
    invoices: invRes.data ?? [],
  };
}
