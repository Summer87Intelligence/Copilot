/**
 * ZETA-13: Completeness Audit Engine.
 *
 * Compara conteos y RegistroIds entre Zeta (source of truth) y la BD local (Supabase).
 * Detecta pérdidas silenciosas de sincronización sin modificar ningún dato.
 *
 * DISEÑO:
 * - Llama a Zeta para el período dado usando los fetchers existentes (read-only).
 * - Compara contra proto_invoices / proto_receipts locales.
 * - Para facturas: comparación por conteo (invoice_number != RegistroId; complejidad alta).
 * - Para recibos: comparación precisa por RegistroId (receipt_number = ZETA:COB:{RegistroId}).
 * - Para contactos: comparación por conteo total.
 * - Clasifica la severidad y devuelve el resultado estructurado.
 *
 * INVARIANTES:
 * - Nunca escribe en Zeta.
 * - Nunca modifica proto_invoices, proto_receipts ni ninguna tabla local.
 * - Idempotente: safe para ejecutar múltiples veces.
 */

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  fetchZetaCustomerVouchers,
} from "@/lib/integrations/zeta/zeta-customer-vouchers-fetch";
import {
  fetchZetaCollectionReceipts,
} from "@/lib/integrations/zeta/zeta-collection-receipts-fetch";
import {
  fetchZetaContactsTyped,
} from "@/lib/integrations/zeta/zeta-contacts-fetch";
import type { ZetaCustomerVoucherRecord } from "@/lib/integrations/zeta/contracts/zeta-customer-vouchers.contract";
import {
  zetaCustomerVoucherClassifierRejectReason,
} from "@/lib/integrations/zeta/zeta-customer-vouchers-invoice-classifier";
import type { ZetaCallContext } from "@/lib/integrations/zeta/zeta-http-client";
import type {
  CompletenessAuditMetadata,
  CompletenessAuditResult,
  CompletenessAuditSeverity,
  ZetaAuditableEntity,
} from "@/lib/integrations/zeta/zeta-enterprise-sync-types";

const PAGE_DELAY_MS = 500;
const MAX_PAGES = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function lastDayOfMonth(year: number, month: number): string {
  // month 1-12; day 0 del mes siguiente = último día del mes actual
  const d = new Date(Date.UTC(year, month, 0));
  return d.toISOString().slice(0, 10);
}

function computeSeverity(zetaCount: number, localCount: number): CompletenessAuditSeverity {
  if (zetaCount === 0) return "ok";
  const drift = Math.abs(zetaCount - localCount);
  const pct = (drift / zetaCount) * 100;
  if (pct === 0) return "ok";
  if (pct <= 5) return "warning";
  return "critical";
}

function readRegistroId(row: Record<string, unknown>): string | null {
  for (const key of ["RegistroId", "registroId", "registro_id", "REGISTROID"]) {
    const v = row[key];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return String(Math.round(v));
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function extractLocalRegistroIdFromMeta(meta: Record<string, unknown> | null): string | null {
  if (!meta) return null;
  const v1 = meta["zeta_customer_voucher_v1"] as Record<string, unknown> | undefined;
  if (v1) {
    const rid = v1["zeta_registro_id"];
    if (rid != null && String(rid).trim()) return String(rid).trim();
  }
  const idv1 = meta["zeta_comprobante_identity_v1"] as Record<string, unknown> | undefined;
  if (idv1) {
    const rid = idv1["registro_id"];
    if (rid != null && String(rid).trim()) return String(rid).trim();
  }
  return null;
}

// ── Invoices (Facturas de cliente) ────────────────────────────────────────────

/**
 * Audita completeness de facturas para un mes/año dado.
 * Estrategia: comparación por CONTEO + RegistroIds de Zeta vs local (via zeta_metadata).
 *
 * ALINEACIÓN CON EL PIPELINE:
 * El pipeline de customer vouchers descarta filas con cfe_type_not_dgi (CFETipo=0 u otro tipo
 * interno no DGI) y filas que parecen recibos de cobranza (recibo_text). Este audit aplica
 * el mismo classifier para que `zeta_count` refleje exclusivamente los movimientos que el
 * pipeline efectivamente persiste — evitando falsos positivos de drift.
 *
 * La comparación de RegistroIds es best-effort: solo detecta los IDs que Zeta
 * expone explícitamente en el campo RegistroId de cada fila.
 */
export async function runInvoiceCompletenessAudit(
  supabase: SupabaseClient,
  workspaceId: string,
  mes: number,
  anio: number
): Promise<CompletenessAuditResult> {
  const ctx: ZetaCallContext = { requestId: randomUUID(), tenantId: workspaceId };
  const auditScope = `period:${anio}-${String(mes).padStart(2, "0")}`;
  const entity: ZetaAuditableEntity = "invoices";

  // 1. Fetch todos los registros de Zeta para el período y clasificar
  const zetaRegistroIds: string[] = [];   // Solo de filas ACEPTADAS por el classifier
  let zetaRawCount = 0;                   // Todas las filas devueltas por Zeta
  let zetaSkippedCount = 0;               // Filas descartadas por el classifier
  let skippedReciboText = 0;
  let skippedCfeNotDgi = 0;
  const sampleSkipped: CompletenessAuditMetadata["sample_skipped_classifier"] = [];
  let zetaError: string | undefined;
  let page = 1;

  try {
    while (page <= MAX_PAGES) {
      const result = await fetchZetaCustomerVouchers({
        ctx,
        page: String(page),
        filters: { mes: String(mes), anio: String(anio) },
      });

      if (!result.ok) {
        zetaError = `Zeta error en página ${page}: ${result.errors.join(", ")}`;
        break;
      }

      for (const row of result.rows) {
        zetaRawCount++;
        const typedRow = row as ZetaCustomerVoucherRecord;
        const reject = zetaCustomerVoucherClassifierRejectReason(typedRow);

        if (reject !== null) {
          // Descartado por el classifier — no entra en proto_invoices
          zetaSkippedCount++;
          if (reject.code === "recibo_text") {
            skippedReciboText++;
          } else {
            skippedCfeNotDgi++;
          }
          if (sampleSkipped.length < 5) {
            const rid = readRegistroId(row as Record<string, unknown>);
            sampleSkipped.push({
              registro_id: rid,
              reject_code: reject.code,
              cfe_tipo: reject.code === "cfe_type_not_dgi" ? reject.cfeTipo : undefined,
              tipo_nombre: String(
                (row as Record<string, unknown>)["TipoComprobanteNombre"] ??
                (row as Record<string, unknown>)["tipoComprobanteNombre"] ??
                ""
              ) || null,
            });
          }
          continue; // No contar en zetaRegistroIds
        }

        // Fila aceptada — misma lógica que el pipeline
        const id = readRegistroId(row as Record<string, unknown>);
        if (id) zetaRegistroIds.push(id);
      }

      if (!result.hasMore) break;
      page++;
      await sleep(PAGE_DELAY_MS);
    }
  } catch (err) {
    zetaError = `Excepción al llamar Zeta: ${String(err)}`;
  }

  // zeta_accepted_count = total - skipped (usamos este para severidad y drift)
  const zetaAcceptedCount = zetaRawCount - zetaSkippedCount;

  const auditMetadata: CompletenessAuditMetadata = {
    zeta_raw_count: zetaRawCount,
    zeta_accepted_count: zetaAcceptedCount,
    zeta_skipped_count: zetaSkippedCount,
    ...(zetaSkippedCount > 0
      ? {
          skipped_classifier_counts: {
            ...(skippedReciboText > 0 ? { recibo_text: skippedReciboText } : {}),
            ...(skippedCfeNotDgi > 0 ? { cfe_type_not_dgi: skippedCfeNotDgi } : {}),
          },
          sample_skipped_classifier: sampleSkipped,
        }
      : {}),
  };

  // 2. Contar localmente facturas Zeta para el período
  const periodStart = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const periodEnd = lastDayOfMonth(anio, mes);

  const { count: localCount, error: localError } = await supabase
    .from("proto_invoices")
    .select("id", { count: "exact", head: true })
    .eq("workspace_company_id", workspaceId)
    .like("invoice_number", "ZETA:%")
    .gte("issue_date", periodStart)
    .lte("issue_date", periodEnd)
    .eq("is_active", true);

  if (localError) {
    return {
      entity,
      audit_scope: auditScope,
      period_year: anio,
      period_month: mes,
      zeta_count: zetaAcceptedCount,
      local_count: 0,
      drift: -zetaAcceptedCount,
      drift_pct: 100,
      missing_registro_ids: zetaRegistroIds,
      orphan_registro_ids: [],
      severity: "critical",
      zeta_error: `DB error: ${localError.message}`,
      metadata: auditMetadata,
    };
  }

  // 3. Fetch local metadata unconditionally — needed for both RegistroId comparison
  //    and legacy untraceable count. Running outside any guard ensures legacyUntraceableCount
  //    is always computed correctly regardless of zetaRegistroIds contents.
  const missingIds: string[] = [];
  const orphanIds: string[] = [];
  let legacyUntraceableCount = 0;

  const { data: localMetaRows } = await supabase
    .from("proto_invoices")
    .select("invoice_number, zeta_metadata")
    .eq("workspace_company_id", workspaceId)
    .like("invoice_number", "ZETA:%")
    .gte("issue_date", periodStart)
    .lte("issue_date", periodEnd)
    .eq("is_active", true)
    .limit(5000);

  const localRegistroIdSet = new Set<string>();
  for (const row of localMetaRows ?? []) {
    const meta = row.zeta_metadata as Record<string, unknown> | null;
    const invNum = (row.invoice_number as string) ?? "";

    if (meta) {
      // Ruta prioritaria (ZETA-03 formato v1)
      const identity = meta["zeta_comprobante_identity_v1"] as Record<string, unknown> | undefined;
      const id1 = identity?.["registro_id"];
      if (typeof id1 === "string" && id1.trim()) {
        localRegistroIdSet.add(id1.trim());
        continue;
      }
      // Fallback: RegistroId en raíz del metadata
      const id2 = meta["RegistroId"] ?? meta["registroId"];
      if (typeof id2 === "string" && id2.trim()) {
        localRegistroIdSet.add(id2.trim());
        continue;
      }
      if (typeof id2 === "number" && id2 > 0) {
        localRegistroIdSet.add(String(Math.round(id2)));
        continue;
      }
    }

    // No RegistroId found in any path: if ZETA:CCV1: prefix → historical legacy untraceable.
    // These records predate modern traceability and are NOT operational drift.
    if (invNum.startsWith("ZETA:CCV1:")) {
      legacyUntraceableCount++;
    }
  }

  if (zetaRegistroIds.length > 0) {
    for (const zetaId of zetaRegistroIds) {
      if (!localRegistroIdSet.has(zetaId)) missingIds.push(zetaId);
    }
    const zetaIdSet = new Set(zetaRegistroIds);
    for (const localId of localRegistroIdSet) {
      if (!zetaIdSet.has(localId)) orphanIds.push(localId);
    }
  }

  const localTotal = localCount ?? 0;

  // Legacy untraceable records (ZETA:CCV1: without zeta_registro_id) exist in both Zeta
  // and locally but can't be ID-matched. Exclude them from BOTH sides so they don't
  // inflate the apparent drift. Raw drift and local_count are preserved for auditability.
  const operationalLocalCount = Math.max(0, localTotal - legacyUntraceableCount);
  const adjustedZetaCount = Math.max(0, zetaAcceptedCount - legacyUntraceableCount);
  const severity = computeSeverity(adjustedZetaCount, operationalLocalCount);
  const drift = localTotal - zetaAcceptedCount;
  const driftPct = zetaAcceptedCount > 0 ? Math.abs(drift / zetaAcceptedCount) * 100 : 0;

  const legacyNote = legacyUntraceableCount > 0
    ? `${legacyUntraceableCount} registro(s) legacy sin trazabilidad excluidos del drift operacional.`
    : undefined;

  return {
    entity,
    audit_scope: auditScope,
    period_year: anio,
    period_month: mes,
    zeta_count: zetaAcceptedCount,      // ← accepted, not raw
    local_count: localTotal,
    drift,
    drift_pct: Math.round(driftPct * 100) / 100,
    missing_registro_ids: missingIds.slice(0, 500),
    orphan_registro_ids: orphanIds.slice(0, 100),
    severity,
    notes: [zetaError, legacyNote].filter(Boolean).join(" ") || undefined,
    zeta_error: zetaError,
    metadata: legacyUntraceableCount > 0
      ? { ...auditMetadata, legacy_untraceable_count: legacyUntraceableCount }
      : auditMetadata,
  };
}

// ── Receipts (Recibos de cobranza) ────────────────────────────────────────────

/**
 * Audita completeness de recibos para un mes/año dado.
 * Estrategia: comparación PRECISA por RegistroId.
 * receipt_number = ZETA:COB:{RegistroId} → extracción directa sin necesidad de metadata.
 */
export async function runReceiptCompletenessAudit(
  supabase: SupabaseClient,
  workspaceId: string,
  mes: number,
  anio: number
): Promise<CompletenessAuditResult> {
  const ctx: ZetaCallContext = { requestId: randomUUID(), tenantId: workspaceId };
  const auditScope = `period:${anio}-${String(mes).padStart(2, "0")}`;
  const entity: ZetaAuditableEntity = "receipts";

  // 1. Fetch todos los RegistroIds de Zeta para el período
  const zetaRegistroIds: string[] = [];
  let zetaError: string | undefined;
  let page = 1;

  try {
    while (page <= MAX_PAGES) {
      const result = await fetchZetaCollectionReceipts({
        ctx,
        page: String(page),
        filters: { mes: String(mes), anio: String(anio) },
      });

      if (!result.ok) {
        zetaError = `Zeta error en página ${page}: ${result.errors.join(", ")}`;
        break;
      }

      for (const row of result.rows) {
        const id = readRegistroId(row as Record<string, unknown>);
        if (id) zetaRegistroIds.push(id);
      }

      if (!result.hasMore) break;
      page++;
      await sleep(PAGE_DELAY_MS);
    }
  } catch (err) {
    zetaError = `Excepción al llamar Zeta: ${String(err)}`;
  }

  // 2. Comparar RegistroIds con local
  const periodStart = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const periodEnd = lastDayOfMonth(anio, mes);
  const RECEIPT_PREFIX = "ZETA:COB:";

  const { data: localReceipts, error: localError } = await supabase
    .from("proto_receipts")
    .select("receipt_number")
    .eq("workspace_company_id", workspaceId)
    .like("receipt_number", `${RECEIPT_PREFIX}%`)
    .gte("receipt_date", periodStart)
    .lte("receipt_date", periodEnd)
    .eq("is_active", true)
    .limit(5000);

  if (localError) {
    return {
      entity,
      audit_scope: auditScope,
      period_year: anio,
      period_month: mes,
      zeta_count: zetaRegistroIds.length,
      local_count: 0,
      drift: -zetaRegistroIds.length,
      drift_pct: 100,
      missing_registro_ids: zetaRegistroIds,
      orphan_registro_ids: [],
      severity: "critical",
      zeta_error: `DB error: ${localError.message}`,
    };
  }

  const localRegistroIdSet = new Set<string>();
  for (const row of localReceipts ?? []) {
    const rn = row.receipt_number as string | null;
    if (rn?.startsWith(RECEIPT_PREFIX)) {
      localRegistroIdSet.add(rn.slice(RECEIPT_PREFIX.length));
    }
  }

  const zetaIdSet = new Set(zetaRegistroIds);
  const missingIds = zetaRegistroIds.filter((id) => !localRegistroIdSet.has(id));
  const orphanIds = [...localRegistroIdSet].filter((id) => !zetaIdSet.has(id));

  const zetaTotal = zetaRegistroIds.length;
  const localTotal = localRegistroIdSet.size;
  const severity = computeSeverity(zetaTotal, localTotal);
  const drift = localTotal - zetaTotal;
  const driftPct = zetaTotal > 0 ? Math.abs(drift / zetaTotal) * 100 : 0;

  return {
    entity,
    audit_scope: auditScope,
    period_year: anio,
    period_month: mes,
    zeta_count: zetaTotal,
    local_count: localTotal,
    drift,
    drift_pct: Math.round(driftPct * 100) / 100,
    missing_registro_ids: missingIds.slice(0, 500),
    orphan_registro_ids: orphanIds.slice(0, 100),
    severity,
    notes: zetaError,
    zeta_error: zetaError,
  };
}

// ── Contacts ──────────────────────────────────────────────────────────────────

/**
 * Audita completeness de contactos comparando conteo Zeta vs local.
 *
 * Usa RESTContactosV3Query (esCliente="1") para obtener el conteo real de Zeta.
 * Pagina hasta MAX_CONTACT_PAGES páginas de 500 contactos cada una.
 * Si Zeta falla, degrada gracefully a verificación de conteo local > 0.
 */
export async function runContactCompletenessAudit(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<CompletenessAuditResult> {
  const entity: ZetaAuditableEntity = "contacts";
  const auditScope = "full";
  const MAX_CONTACT_PAGES = 20;
  const ctx: ZetaCallContext = { requestId: randomUUID(), tenantId: workspaceId };

  // 1. Contar local
  const { count: localCount, error: localError } = await supabase
    .from("proto_contacts")
    .select("id", { count: "exact", head: true })
    .eq("workspace_company_id", workspaceId)
    .eq("is_active", true);

  const localTotal = localCount ?? 0;

  if (localError) {
    return {
      entity,
      audit_scope: auditScope,
      zeta_count: 0,
      local_count: 0,
      drift: 0,
      drift_pct: 0,
      missing_registro_ids: [],
      orphan_registro_ids: [],
      severity: "critical",
      notes: `DB error: ${localError.message}`,
    };
  }

  // 2. Fetch conteo Zeta via RESTContactosV3Query
  let zetaTotal = 0;
  let zetaExact = false;
  let zetaError: string | undefined;

  try {
    let page = 1;
    while (page <= MAX_CONTACT_PAGES) {
      const result = await fetchZetaContactsTyped({
        ctx,
        page: String(page),
        pageSize: 500,
        filters: { esCliente: "S" },
      });

      if (!result.ok) {
        zetaError = `Zeta contacts error en página ${page}: ${result.errors.join(", ")}`;
        break;
      }

      zetaTotal += result.contacts.length;

      if (!result.hasMore) {
        zetaExact = true;
        break;
      }
      page++;
      await sleep(PAGE_DELAY_MS);
    }

    if (page > MAX_CONTACT_PAGES && !zetaError) {
      zetaError = `Conteo Zeta parcial: se alcanzó el límite de ${MAX_CONTACT_PAGES} páginas`;
    }
  } catch (err) {
    zetaError = `Excepción al llamar Zeta contacts: ${String(err)}`;
  }

  // 3. Si Zeta falló, degradar a verificación de presencia local
  if (zetaError && zetaTotal === 0) {
    const severity: CompletenessAuditSeverity = localTotal === 0 ? "warning" : "ok";
    return {
      entity,
      audit_scope: auditScope,
      zeta_count: localTotal,
      local_count: localTotal,
      drift: 0,
      drift_pct: 0,
      missing_registro_ids: [],
      orphan_registro_ids: [],
      severity,
      notes: zetaError,
      zeta_error: zetaError,
    };
  }

  // 4. Comparar — dirección unidireccional para contactos.
  // Local puede tener MÁS contactos que Zeta (importados, creados manualmente) → eso es ok.
  // Solo es problema si local tiene MENOS que Zeta (faltan registros del sync).
  const drift = localTotal - zetaTotal;
  const driftPct = zetaTotal > 0 ? Math.abs(drift / zetaTotal) * 100 : 0;
  let severity: CompletenessAuditSeverity;
  if (localTotal === 0) {
    severity = "warning"; // sin contactos en absoluto
  } else if (zetaTotal > 0 && localTotal < zetaTotal) {
    severity = computeSeverity(zetaTotal, localTotal); // nos faltan contactos de Zeta
  } else {
    severity = "ok"; // local >= Zeta o Zeta=0
  }

  return {
    entity,
    audit_scope: auditScope,
    zeta_count: zetaTotal,
    local_count: localTotal,
    drift,
    drift_pct: Math.round(driftPct * 100) / 100,
    missing_registro_ids: [],
    orphan_registro_ids: [],
    severity,
    notes: zetaError ?? (!zetaExact ? `Conteo Zeta parcial (>${MAX_CONTACT_PAGES} páginas)` : undefined),
    zeta_error: zetaError,
  };
}

// ── Helper: meses a auditar ───────────────────────────────────────────────────

/**
 * Devuelve el mes actual y el anterior respetando el límite operativo (enero 2026).
 */
export function getAuditMonths(): Array<{ mes: number; anio: number }> {
  const OPERATIONAL_START_YEAR = 2026;
  const OPERATIONAL_START_MONTH = 1;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const months: Array<{ mes: number; anio: number }> = [
    { mes: currentMonth, anio: currentYear },
  ];

  let prevMonth = currentMonth - 1;
  let prevYear = currentYear;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear--;
  }

  const isBeforeOperational =
    prevYear < OPERATIONAL_START_YEAR ||
    (prevYear === OPERATIONAL_START_YEAR && prevMonth < OPERATIONAL_START_MONTH);

  if (!isBeforeOperational) {
    months.push({ mes: prevMonth, anio: prevYear });
  }

  return months;
}
