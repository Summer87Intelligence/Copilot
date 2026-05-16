/**
 * ZETA-15: Drift classification engine for orphan local invoice records.
 *
 * Orphan records = invoices present locally but absent in Zeta (local > Zeta).
 * This module classifies WHY they exist — enabling informed triage, not blind deletion.
 *
 * Classification is read-only and never modifies data.
 * All auto_deactivate_eligible flags are false by default — the operator must review.
 *
 * DriftClass taxonomy:
 *   cfe_type_not_dgi      — CFETipo not accepted by pipeline classifier (e.g. CFETipo=0)
 *   stale_local_record    — record pre-dates integration, no Zeta metadata
 *   archived_in_zeta      — Zeta explicitly flags as archived/annulled in metadata
 *   unsupported_document  — document type Copilot doesn't model (credit note, etc.)
 *   unknown               — cannot classify; needs manual review
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type DriftClass =
  | "cfe_type_not_dgi"
  | "stale_local_record"
  | "archived_in_zeta"
  | "unsupported_document"
  | "unknown";

export type DriftClassification = {
  record_id: string;
  invoice_number: string;
  drift_class: DriftClass;
  confidence: "high" | "medium" | "low";
  reason: string;
  auto_deactivate_eligible: boolean;
  metadata: Record<string, unknown>;
};

export type DriftClassifierResult = {
  total_orphans: number;
  classifications: DriftClassification[];
  auto_deactivate_candidates: DriftClassification[];
  by_class: Record<DriftClass, number>;
  dry_run: boolean;
  classified_at: string;
};

type OrphanRecord = {
  id: string;
  invoice_number: string;
  zeta_metadata?: Record<string, unknown> | null;
};

// CFETipo values that the pipeline classifier accepts as DGI documents.
// Source: zeta-customer-vouchers-invoice-classifier.ts (CFETipo !== 0 rule + DGI set)
const NON_DGI_CFE_TIPOS = new Set([0]);
const ARCHIVED_STATUS_VALUES = new Set(["A", "anulado", "Anulado", "archived"]);

function extractCfeTipo(meta: Record<string, unknown> | null | undefined): number | null {
  if (!meta) return null;
  const v =
    meta["CFETipo"] ??
    meta["cfeTipo"] ??
    meta["cfe_tipo"] ??
    (meta["zeta_comprobante_identity_v1"] as Record<string, unknown> | undefined)?.["cfe_tipo"] ??
    (meta["raw"] as Record<string, unknown> | undefined)?.["CFETipo"];
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function extractStatus(meta: Record<string, unknown> | null | undefined): string | null {
  if (!meta) return null;
  const v =
    meta["Estado"] ??
    meta["estado"] ??
    meta["status"] ??
    (meta["raw"] as Record<string, unknown> | undefined)?.["Estado"];
  return v != null ? String(v) : null;
}

export function classifyOrphanInvoice(record: OrphanRecord): DriftClassification {
  const meta = record.zeta_metadata;

  // No Zeta metadata at all → pre-integration stale record
  if (!meta || Object.keys(meta).length === 0) {
    return {
      record_id: record.id,
      invoice_number: record.invoice_number,
      drift_class: "stale_local_record",
      confidence: "medium",
      reason: "Sin metadata Zeta — registro anterior a la integración o nunca sincronizado",
      auto_deactivate_eligible: false,
      metadata: {},
    };
  }

  const cfeTipo = extractCfeTipo(meta);
  const estado = extractStatus(meta);

  // Archived/annulled in Zeta
  if (estado !== null && ARCHIVED_STATUS_VALUES.has(estado)) {
    return {
      record_id: record.id,
      invoice_number: record.invoice_number,
      drift_class: "archived_in_zeta",
      confidence: "high",
      reason: `Documento anulado/archivado en Zeta (Estado="${estado}") — no aparece en consultas activas`,
      auto_deactivate_eligible: false,
      metadata: { estado, cfe_tipo: cfeTipo },
    };
  }

  // CFETipo not accepted by classifier
  if (cfeTipo !== null && NON_DGI_CFE_TIPOS.has(cfeTipo)) {
    return {
      record_id: record.id,
      invoice_number: record.invoice_number,
      drift_class: "cfe_type_not_dgi",
      confidence: "high",
      reason: `CFETipo=${cfeTipo} — rechazado por el classifier del pipeline (tipo no DGI)`,
      auto_deactivate_eligible: false,
      metadata: { cfe_tipo: cfeTipo },
    };
  }

  // CFETipo present but no specific rule matched
  if (cfeTipo !== null) {
    return {
      record_id: record.id,
      invoice_number: record.invoice_number,
      drift_class: "unknown",
      confidence: "low",
      reason: `CFETipo=${cfeTipo} presente pero sin regla de clasificación — requiere revisión manual`,
      auto_deactivate_eligible: false,
      metadata: { cfe_tipo: cfeTipo, estado },
    };
  }

  return {
    record_id: record.id,
    invoice_number: record.invoice_number,
    drift_class: "unknown",
    confidence: "low",
    reason: "No se pudo clasificar automáticamente — CFETipo no encontrado en metadata",
    auto_deactivate_eligible: false,
    metadata: { meta_keys: Object.keys(meta) },
  };
}

/**
 * Classifies orphan invoice records for a workspace using their local metadata.
 * `orphanInvoiceNumbers` = ZETA-prefixed invoice_numbers present locally but absent in Zeta.
 * dryRun=true (default) — returns candidates without any writes.
 */
export async function classifyOrphanInvoices(
  supabase: SupabaseClient,
  workspaceId: string,
  orphanInvoiceNumbers: string[],
  dryRun = true
): Promise<DriftClassifierResult> {
  const classifiedAt = new Date().toISOString();

  if (orphanInvoiceNumbers.length === 0) {
    return {
      total_orphans: 0,
      classifications: [],
      auto_deactivate_candidates: [],
      by_class: { cfe_type_not_dgi: 0, stale_local_record: 0, archived_in_zeta: 0, unsupported_document: 0, unknown: 0 },
      dry_run: dryRun,
      classified_at: classifiedAt,
    };
  }

  const { data } = await supabase
    .from("proto_invoices")
    .select("id, invoice_number, zeta_metadata")
    .eq("workspace_company_id", workspaceId)
    .in("invoice_number", orphanInvoiceNumbers.slice(0, 500))
    .eq("is_active", true)
    .limit(500);

  const classifications = (data ?? []).map((row) =>
    classifyOrphanInvoice({
      id: row.id as string,
      invoice_number: row.invoice_number as string,
      zeta_metadata: row.zeta_metadata as Record<string, unknown> | null,
    })
  );

  const auto_deactivate_candidates = classifications.filter((c) => c.auto_deactivate_eligible);

  const by_class: Record<DriftClass, number> = {
    cfe_type_not_dgi: 0,
    stale_local_record: 0,
    archived_in_zeta: 0,
    unsupported_document: 0,
    unknown: 0,
  };
  for (const c of classifications) {
    by_class[c.drift_class]++;
  }

  return {
    total_orphans: orphanInvoiceNumbers.length,
    classifications,
    auto_deactivate_candidates,
    by_class,
    dry_run: dryRun,
    classified_at: classifiedAt,
  };
}
