/**
 * Orquestación conceptual del pipeline Zeta → Copilot (sin I/O).
 *
 * Flujo lógico end-to-end:
 *
 * 1. **Extracción (futuro)** — Job o cliente HTTP que llama a la API de Zeta (o importa
 *    archivos), autentica, pagina y arma listas de entidades crudas (`ZetaInvoice`, etc.)
 *    más `companyId` y opcionalmente `syncRunId`. Esa capa vive fuera de este archivo;
 *    aquí solo recibimos el resultado ya materializado en memoria como `ZetaSyncBatchInput`.
 *
 * 2. **Normalización** — `normalizeZetaPayload` traduce tipos proveedor →
 *    `NormalizedFinancePayload` (modelo interno Summer87, agnóstico de detalles de API).
 *
 * 3. **Agregación** — `buildDashboardSnapshotFromNormalized` reduce el lote normalizado
 *    a KPIs (`DashboardSnapshot`) que entiende el Copilot.
 *
 * 4. **Persistencia (futuro)** — Escribir snapshot y/o raw sync en Supabase (tablas por
 *    empresa, idempotencia por `syncRunId`, historial para tendencias). **No implementado aquí.**
 *
 * 5. **Consumo** — UI y `generateCopilotInsights` seguirían leyendo snapshot desde la
 *    fuente actual hasta que se cablee el paso 4; este módulo no toca dashboard ni auth.
 */

import type { DashboardSnapshot } from "@/lib/dashboard-data";
import type { NormalizedFinancePayload } from "@/types/normalized-finance";
import { buildDashboardSnapshotFromNormalized } from "@/services/finance-aggregator";
import {
  normalizeZetaPayload,
  type ZetaNormalizerBatchInput,
} from "@/services/zeta-normalizer";

/**
 * Lote crudo “tal como vendría” del conector Zeta: mismas listas que acepta el normalizador.
 * Alias semántico para el pipeline completo; el contrato detallado sigue en `types/zeta.ts`.
 */
export type ZetaSyncBatchInput = ZetaNormalizerBatchInput;

export type ZetaSyncOrchestrationResult = {
  normalizedPayload: NormalizedFinancePayload;
  dashboardSnapshot: DashboardSnapshot;
};

/**
 * Ejecuta normalización + agregación sobre un batch compatible con Zeta.
 *
 * - No llama APIs ni Supabase.
 * - No valida negocio (duplicados, sumas cruzadas); eso será validación explícita o en persistencia.
 */
export function buildDashboardSnapshotFromZetaBatch(
  input: ZetaSyncBatchInput,
): ZetaSyncOrchestrationResult {
  const normalizedPayload = normalizeZetaPayload(input);
  const dashboardSnapshot =
    buildDashboardSnapshotFromNormalized(normalizedPayload);

  return {
    normalizedPayload,
    dashboardSnapshot,
  };
}
