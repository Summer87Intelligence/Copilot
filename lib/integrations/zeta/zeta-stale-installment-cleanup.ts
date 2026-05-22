/**
 * Cierre de cuotas locales obsoletas cuando Zeta ya no reporta saldo pendiente
 * (saldos) ni cuota abierta (QueryCliente).
 *
 * Evita que `zero_pass_blocked_by_installments` / `orphan_autoclose_blocked_by_installments`
 * dejen facturas cobradas con `balance_amount > 0` en Copilot.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { createLogger } from "@/lib/observability/logger";
import { fetchZetaInstallments } from "@/lib/integrations/zeta/zeta-installments-fetch";
import {
  mapZetaInstallmentsBatch,
  type ProtoInstallmentInput,
} from "@/lib/integrations/zeta/zeta-installments-mapper";
import {
  INSTALLMENT_SALDO_EPSILON,
  sumOpenInstallmentSaldoForInvoice,
} from "@/lib/integrations/zeta/zeta-installment-guard";
import { readZetaReconciliationState } from "@/lib/integrations/zeta/zeta-saldos-reconciliation";
import type { ZetaCallContext } from "@/lib/integrations/zeta/zeta-http-client";

const _log = createLogger({ source: "zeta_stale_installment_cleanup" });

export const STALE_INSTALLMENT_CLEANUP_REASON =
  "missing_from_zeta_saldos_and_installments" as const;

export type StaleInstallmentCleanupEntry = {
  installment_id: string;
  zeta_registro_id: string;
  cuota_numero: number;
  previous_cuota_saldo: number;
  currency_code: string | null;
};

export type CloseStaleInstallmentsResult = {
  closed_count: number;
  closed: StaleInstallmentCleanupEntry[];
  /** Alguna cuota local sigue abierta según la respuesta actual de Zeta cuotas. */
  blocked_by_open_zeta_cuota: boolean;
  /** No se pudo consultar cuotas en Zeta — el caller debe bloquear de forma conservadora. */
  cuotas_fetch_unavailable: boolean;
};

export type ShouldCloseStaleInstallmentInput = {
  invoiceAbsentFromSaldos: boolean;
  installmentAbsentFromCuotasResponse: boolean;
  installmentOpenSaldo: number;
  invoiceBalance: number;
  /** Proxy en pipeline de cuotas: factura ya marcada como ausente de saldos al menos una vez. */
  saldosMissingSignal: boolean;
};

/** Regla pura para tests y para el pipeline de cuotas. */
export function shouldCloseStaleInstallment(
  input: ShouldCloseStaleInstallmentInput
): boolean {
  if (input.installmentOpenSaldo <= INSTALLMENT_SALDO_EPSILON) return false;
  if (!input.installmentAbsentFromCuotasResponse) return false;
  if (!input.invoiceAbsentFromSaldos && !input.saldosMissingSignal) return false;
  if (input.invoiceBalance <= INSTALLMENT_SALDO_EPSILON) return false;
  return true;
}

export function buildOpenCuotaKey(
  registroId: string | number,
  cuotaNumero: number
): string {
  return `${String(registroId).trim()}:${cuotaNumero}`;
}

/** Claves de cuotas con saldo abierto según filas mapeadas de Zeta en la corrida actual. */
export function collectOpenCuotaKeysFromMapped(
  mapped: readonly ProtoInstallmentInput[]
): Set<string> {
  const keys = new Set<string>();
  for (const m of mapped) {
    if (m.cuota_saldo <= INSTALLMENT_SALDO_EPSILON) continue;
    keys.add(buildOpenCuotaKey(m.zeta_registro_id, m.cuota_numero));
  }
  return keys;
}

/** Consulta Zeta cuotas abiertas del cliente (una página; filtros estándar del pipeline). */
export async function fetchOpenCuotaKeysFromZeta(
  ctx: ZetaCallContext,
  clienteCodigo: string
): Promise<Set<string> | null> {
  const fetchResult = await fetchZetaInstallments({
    ctx,
    page: "1",
    filters: { clienteCodigo: clienteCodigo.trim() },
  });
  if (!fetchResult.ok) {
    _log.warn("fetch_open_cuota_keys_failed", {
      cliente_codigo: clienteCodigo,
      error_code: fetchResult.error_code,
    });
    return null;
  }
  const { mapped } = mapZetaInstallmentsBatch(fetchResult.rows);
  return collectOpenCuotaKeysFromMapped(mapped);
}

function patchInstallmentRawPayload(
  existing: unknown,
  patch: {
    previous_cuota_saldo: number;
    cleaned_at: string;
    sync_run_id?: string;
  }
): Record<string, unknown> {
  const base =
    existing != null && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  base.zeta_installment_cleanup = {
    reason: STALE_INSTALLMENT_CLEANUP_REASON,
    source: "installment_cleanup",
    previous_cuota_saldo: patch.previous_cuota_saldo,
    cleaned_at: patch.cleaned_at,
    sync_run_id: patch.sync_run_id ?? null,
  };
  return base;
}

type OpenInstallmentRow = {
  id: string;
  zeta_registro_id: string;
  cuota_numero: number;
  cuota_saldo: number;
  currency_code: string | null;
  raw_payload: unknown;
};

async function loadOpenInstallmentsForInvoice(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  invoiceId: string
): Promise<OpenInstallmentRow[] | null> {
  const { data, error } = await supabase
    .from("proto_invoice_installments")
    .select("id, zeta_registro_id, cuota_numero, cuota_saldo, currency_code, raw_payload")
    .eq("workspace_company_id", workspaceCompanyId)
    .eq("invoice_id", invoiceId)
    .gt("cuota_saldo", INSTALLMENT_SALDO_EPSILON);

  if (error) return null;

  const out: OpenInstallmentRow[] = [];
  for (const raw of data ?? []) {
    const row = raw as {
      id?: string;
      zeta_registro_id?: string;
      cuota_numero?: number;
      cuota_saldo?: unknown;
      currency_code?: string | null;
      raw_payload?: unknown;
    };
    if (!row.id || row.zeta_registro_id == null || row.cuota_numero == null) continue;
    const saldo =
      typeof row.cuota_saldo === "number"
        ? row.cuota_saldo
        : Number(String(row.cuota_saldo ?? "").replace(",", "."));
    if (!Number.isFinite(saldo)) continue;
    out.push({
      id: row.id,
      zeta_registro_id: String(row.zeta_registro_id),
      cuota_numero: row.cuota_numero,
      cuota_saldo: saldo,
      currency_code: row.currency_code ?? null,
      raw_payload: row.raw_payload,
    });
  }
  return out;
}

/**
 * Cierra cuotas locales obsoletas de una factura ausente de saldos pendientes.
 * Si alguna cuota local coincide con una cuota abierta en Zeta → bloquea (Case C).
 */
export async function closeStaleInstallmentsForInvoiceAbsentFromSaldos(
  supabase: SupabaseClient,
  params: {
    workspaceCompanyId: string;
    invoiceId: string;
    invoiceNumber: string;
    clienteCodigo: string;
    openCuotaKeysFromZeta: Set<string> | null;
    syncRunId?: string;
    now?: string;
  }
): Promise<CloseStaleInstallmentsResult> {
  const wid = params.workspaceCompanyId.trim();
  const now = params.now ?? new Date().toISOString();
  const empty: CloseStaleInstallmentsResult = {
    closed_count: 0,
    closed: [],
    blocked_by_open_zeta_cuota: false,
    cuotas_fetch_unavailable: params.openCuotaKeysFromZeta === null,
  };

  if (params.openCuotaKeysFromZeta === null) {
    return empty;
  }

  const rows = await loadOpenInstallmentsForInvoice(supabase, wid, params.invoiceId);
  if (rows === null) {
    return { ...empty, cuotas_fetch_unavailable: true };
  }
  if (rows.length === 0) {
    return empty;
  }

  const openKeys = params.openCuotaKeysFromZeta;
  for (const row of rows) {
    const key = buildOpenCuotaKey(row.zeta_registro_id, row.cuota_numero);
    if (openKeys.has(key)) {
      _log.warn("installment_stale_close_blocked_open_in_zeta", {
        invoice_id: params.invoiceId,
        invoice_number: params.invoiceNumber,
        zeta_codigo: params.clienteCodigo,
        zeta_registro_id: row.zeta_registro_id,
        cuota_numero: row.cuota_numero,
        cuota_saldo: row.cuota_saldo,
        currency_code: row.currency_code,
      });
      return {
        closed_count: 0,
        closed: [],
        blocked_by_open_zeta_cuota: true,
        cuotas_fetch_unavailable: false,
      };
    }
  }

  const closed: StaleInstallmentCleanupEntry[] = [];
  for (const row of rows) {
    const prev = row.cuota_saldo;
    const { error } = await supabase
      .from("proto_invoice_installments")
      .update({
        cuota_saldo: 0,
        synced_at: now,
        raw_payload: patchInstallmentRawPayload(row.raw_payload, {
          previous_cuota_saldo: prev,
          cleaned_at: now,
          sync_run_id: params.syncRunId,
        }),
      })
      .eq("workspace_company_id", wid)
      .eq("id", row.id);

    if (error) {
      _log.warn("installment_stale_close_db_error", {
        invoice_id: params.invoiceId,
        installment_id: row.id,
        message: error.message,
      });
      continue;
    }

    closed.push({
      installment_id: row.id,
      zeta_registro_id: row.zeta_registro_id,
      cuota_numero: row.cuota_numero,
      previous_cuota_saldo: prev,
      currency_code: row.currency_code,
    });

    _log.info("installment_stale_closed", {
      invoice_id: params.invoiceId,
      invoice_number: params.invoiceNumber,
      zeta_codigo: params.clienteCodigo,
      installment_id: row.id,
      zeta_registro_id: row.zeta_registro_id,
      cuota_numero: row.cuota_numero,
      previous_cuota_saldo: prev,
      currency_code: row.currency_code,
      reason: STALE_INSTALLMENT_CLEANUP_REASON,
      source: "installment_cleanup",
    });
  }

  if (closed.length > 0) {
    _log.info("zero_pass_unblocked_by_stale_installment_cleanup", {
      invoice_id: params.invoiceId,
      invoice_number: params.invoiceNumber,
      zeta_codigo: params.clienteCodigo,
      closed_count: closed.length,
    });
  }

  return {
    closed_count: closed.length,
    closed,
    blocked_by_open_zeta_cuota: false,
    cuotas_fetch_unavailable: false,
  };
}

/**
 * Tras una corrida de cuotas: cierra installments locales no devueltos por Zeta
 * cuando la factura vinculada ya tiene señal de ausencia en saldos pendientes.
 */
export async function reconcileStaleInstallmentsAfterCuotasFetch(
  supabase: SupabaseClient,
  params: {
    workspaceCompanyId: string;
    clienteCodigo: string;
    openCuotaKeysFromZeta: Set<string>;
    syncRunId?: string;
    now?: string;
  }
): Promise<{ closed_count: number }> {
  const wid = params.workspaceCompanyId.trim();
  const cliente = params.clienteCodigo.trim();
  const now = params.now ?? new Date().toISOString();
  let closed_count = 0;

  const { data, error } = await supabase
    .from("proto_invoice_installments")
    .select(
      "id, invoice_id, zeta_registro_id, cuota_numero, cuota_saldo, currency_code, raw_payload"
    )
    .eq("workspace_company_id", wid)
    .eq("cliente_codigo", cliente)
    .gt("cuota_saldo", INSTALLMENT_SALDO_EPSILON)
    .not("invoice_id", "is", null);

  if (error) {
    _log.warn("reconcile_stale_installments_load_error", {
      cliente_codigo: cliente,
      message: error.message,
    });
    return { closed_count: 0 };
  }

  for (const raw of data ?? []) {
    const row = raw as {
      id?: string;
      invoice_id?: string;
      zeta_registro_id?: string;
      cuota_numero?: number;
      cuota_saldo?: unknown;
      currency_code?: string | null;
      raw_payload?: unknown;
    };
    if (!row.id || !row.invoice_id || row.zeta_registro_id == null || row.cuota_numero == null) {
      continue;
    }

    const saldo =
      typeof row.cuota_saldo === "number"
        ? row.cuota_saldo
        : Number(String(row.cuota_saldo ?? "").replace(",", "."));
    if (!Number.isFinite(saldo) || saldo <= INSTALLMENT_SALDO_EPSILON) continue;

    const key = buildOpenCuotaKey(row.zeta_registro_id, row.cuota_numero);
    if (params.openCuotaKeysFromZeta.has(key)) continue;

    const { data: inv, error: invErr } = await supabase
      .from("proto_invoices")
      .select("id, invoice_number, balance_amount, zeta_metadata, currency_code, company_id")
      .eq("workspace_company_id", wid)
      .eq("id", row.invoice_id)
      .maybeSingle();

    if (invErr || !inv) continue;

    const invRow = inv as {
      invoice_number?: string;
      balance_amount?: unknown;
      zeta_metadata?: unknown;
      currency_code?: string | null;
    };
    const balance =
      typeof invRow.balance_amount === "number"
        ? invRow.balance_amount
        : Number(String(invRow.balance_amount ?? "").replace(",", "."));
    const balanceFin = Number.isFinite(balance) ? balance : 0;
    const rec = readZetaReconciliationState(invRow.zeta_metadata);
    const saldosMissingSignal =
      rec.pending_sync_missing_count >= 1 || rec.last_missing_detected_at != null;

    if (
      !shouldCloseStaleInstallment({
        invoiceAbsentFromSaldos: false,
        installmentAbsentFromCuotasResponse: true,
        installmentOpenSaldo: saldo,
        invoiceBalance: balanceFin,
        saldosMissingSignal,
      })
    ) {
      continue;
    }

    const { error: upErr } = await supabase
      .from("proto_invoice_installments")
      .update({
        cuota_saldo: 0,
        synced_at: now,
        raw_payload: patchInstallmentRawPayload(row.raw_payload, {
          previous_cuota_saldo: saldo,
          cleaned_at: now,
          sync_run_id: params.syncRunId,
        }),
      })
      .eq("workspace_company_id", wid)
      .eq("id", row.id);

    if (upErr) continue;

    closed_count += 1;
    _log.info("installment_stale_closed", {
      invoice_id: row.invoice_id,
      invoice_number: invRow.invoice_number,
      zeta_codigo: cliente,
      installment_id: row.id,
      zeta_registro_id: row.zeta_registro_id,
      cuota_numero: row.cuota_numero,
      previous_cuota_saldo: saldo,
      currency_code: row.currency_code ?? invRow.currency_code ?? null,
      reason: STALE_INSTALLMENT_CLEANUP_REASON,
      source: "installment_cleanup",
    });
  }

  if (closed_count > 0) {
    _log.info("installments_pipeline_stale_reconcile_done", {
      cliente_codigo: cliente,
      closed_count,
    });
  }

  return { closed_count };
}

/**
 * Prepara cierre de factura: limpia cuotas obsoletas y devuelve saldo de cuotas post-cleanup.
 */
export async function prepareInvoiceCloseAfterStaleInstallmentCleanup(
  supabase: SupabaseClient,
  params: {
    workspaceCompanyId: string;
    invoiceId: string;
    invoiceNumber: string;
    clienteCodigo: string;
    touchedInvoiceIds: Set<string>;
    openCuotaKeysFromZeta: Set<string> | null;
    syncRunId?: string;
  }
): Promise<{
  installmentSaldo: number | null;
  cleanup: CloseStaleInstallmentsResult;
}> {
  if (params.touchedInvoiceIds.has(params.invoiceId)) {
    const saldo = await sumOpenInstallmentSaldoForInvoice(
      supabase,
      params.workspaceCompanyId,
      params.invoiceId
    );
    return {
      installmentSaldo: saldo,
      cleanup: {
        closed_count: 0,
        closed: [],
        blocked_by_open_zeta_cuota: false,
        cuotas_fetch_unavailable: false,
      },
    };
  }

  const cleanup = await closeStaleInstallmentsForInvoiceAbsentFromSaldos(supabase, {
    workspaceCompanyId: params.workspaceCompanyId,
    invoiceId: params.invoiceId,
    invoiceNumber: params.invoiceNumber,
    clienteCodigo: params.clienteCodigo,
    openCuotaKeysFromZeta: params.openCuotaKeysFromZeta,
    syncRunId: params.syncRunId,
  });

  if (cleanup.blocked_by_open_zeta_cuota || cleanup.cuotas_fetch_unavailable) {
    const saldo = await sumOpenInstallmentSaldoForInvoice(
      supabase,
      params.workspaceCompanyId,
      params.invoiceId
    );
    return { installmentSaldo: saldo, cleanup };
  }

  const saldo = await sumOpenInstallmentSaldoForInvoice(
    supabase,
    params.workspaceCompanyId,
    params.invoiceId
  );
  return { installmentSaldo: saldo, cleanup };
}
