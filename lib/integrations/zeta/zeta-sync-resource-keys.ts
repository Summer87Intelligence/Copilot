/**
 * Claves canónicas Zeta: alinea `zeta_pipeline_runs.pipeline_name` con
 * `zeta_sync_state.resource_flow` / `zeta_sync_runs.resource_flow` donde el
 * producto exige un único identificador visible.
 */

import { ZETA_PIPELINE_NAMES } from "@/lib/data/zeta-pipeline-run-types";

/** Único nombre para vendor payments (cron, pipelines UI, sync state, health). */
export const ZETA_VENDOR_PAYMENTS_RESOURCE_FLOW = ZETA_PIPELINE_NAMES.VENDOR_PAYMENTS;

/** Labels UI compartidos (Pipeline Health + Sync Health + Client 360). */
export const ZETA_PIPELINE_DISPLAY_LABELS: Record<string, string> = {
  [ZETA_PIPELINE_NAMES.SALDOS]: "Saldos",
  [ZETA_PIPELINE_NAMES.VOUCHERS]: "Facturas",
  [ZETA_PIPELINE_NAMES.CONTACTS]: "Contactos",
  [ZETA_PIPELINE_NAMES.VENDOR_PAYMENTS]: "Pagos proveedores",
  [ZETA_PIPELINE_NAMES.CUOTAS]: "Cuotas",
  [ZETA_PIPELINE_NAMES.COMPLETENESS_AUDIT]: "Auditoría completitud",
  [ZETA_PIPELINE_NAMES.INTEGRITY_CHECK]: "Integridad",
  [ZETA_PIPELINE_NAMES.RESYNC_WORKER]: "Resync worker",
};

/** Labels para `zeta_sync_state.resource_flow` en Sync Health / Client 360. */
export const ZETA_SYNC_RESOURCE_FLOW_LABELS: Record<string, string> = {
  [ZETA_VENDOR_PAYMENTS_RESOURCE_FLOW]: "Pagos a proveedores",
  zeta_customer_vouchers_v1: "Comprobantes por cliente",
  zeta_collection_receipts_v1: "Recibos de cobranza",
  zeta_commercial_client_v1: "Datos comerciales cliente",
  factura_cliente_saldos_pendientes: "Saldos pendientes",
  zeta_saldos_pendientes_v1: "Saldos pendientes",
  zeta_contacts_incremental_v1: "Clientes / contactos",
  zeta_clients_v1: "Clientes / contactos",
};

/** Alias históricos — migrados en DB; normalizados en lectura (defensa rollback). */
export const ZETA_VENDOR_PAYMENTS_RESOURCE_FLOW_LEGACY_ALIASES = [
  "zeta_vendor_payments_v1",
] as const;

const LEGACY_VENDOR_PAYMENTS_SET = new Set<string>(
  ZETA_VENDOR_PAYMENTS_RESOURCE_FLOW_LEGACY_ALIASES
);

export function isLegacyVendorPaymentsResourceFlow(resourceFlow: string): boolean {
  return LEGACY_VENDOR_PAYMENTS_SET.has(resourceFlow.trim());
}

/** Devuelve la clave canónica para persistencia y UI. */
export function normalizeZetaSyncResourceFlow(resourceFlow: string): string {
  const flow = resourceFlow.trim();
  if (isLegacyVendorPaymentsResourceFlow(flow)) {
    return ZETA_VENDOR_PAYMENTS_RESOURCE_FLOW;
  }
  return flow;
}

export type ZetaSyncStateMergeInput = {
  resource_flow: string;
  last_success_at: string | null;
  bootstrap_completed: boolean;
};

/**
 * Colapsa filas legacy + canónica del mismo flujo (mismo workspace implícito
 * en el caller). Conserva el mejor `last_success_at` y bootstrap OR.
 */
export function mergeZetaSyncStateRows<T extends ZetaSyncStateMergeInput>(
  rows: readonly T[]
): T[] {
  const byCanonical = new Map<string, T>();

  for (const row of rows) {
    const canonical = normalizeZetaSyncResourceFlow(row.resource_flow);
    const normalized = { ...row, resource_flow: canonical } as T;
    const prev = byCanonical.get(canonical);
    if (!prev) {
      byCanonical.set(canonical, normalized);
      continue;
    }

    const prevMs = prev.last_success_at ? Date.parse(prev.last_success_at) : 0;
    const nextMs = normalized.last_success_at
      ? Date.parse(normalized.last_success_at)
      : 0;
    const bestLastSuccess =
      nextMs >= prevMs ? normalized.last_success_at : prev.last_success_at;

    byCanonical.set(canonical, {
      ...prev,
      ...normalized,
      last_success_at: bestLastSuccess,
      bootstrap_completed:
        prev.bootstrap_completed || normalized.bootstrap_completed,
    });
  }

  return [...byCanonical.values()];
}

/** Label humano para pipeline cron (`zeta_pipeline_runs.pipeline_name`). */
export function getZetaPipelineDisplayLabel(pipelineName: string): string {
  return ZETA_PIPELINE_DISPLAY_LABELS[pipelineName.trim()] ?? pipelineName.trim();
}

/**
 * Label humano para sync state (`resource_flow`). Normaliza legacy vendor
 * antes de resolver el mapa.
 */
export function getZetaSyncResourceFlowLabel(resourceFlow: string): string {
  const canonical = normalizeZetaSyncResourceFlow(resourceFlow);
  return ZETA_SYNC_RESOURCE_FLOW_LABELS[canonical] ?? canonical;
}
