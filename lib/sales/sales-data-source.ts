/**
 * FASE 9 — Data source server-side del módulo Ventas.
 *
 * Carga (una sola vez por request) el universo de facturas del workspace desde
 * MIN_FINANCIAL_DATE, lo deduplica con la lógica canónica compartida, resuelve
 * nombres de cliente y construye los documentos canónicos + la vista de catálogo.
 *
 * Atribución comercial FASE 9D (precedencia):
 *   1) override legacy en sales_document_salespersons (solo lectura histórica)
 *   2) comercial vigente del cliente en issue_date (sales_client_salespersons)
 *   3) Sin asignar
 *
 * Todas las agregaciones se calculan sobre ESTE resultado — sin N+1.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { MIN_FINANCIAL_DATE } from "@/lib/copilot-operational-period";
import { fetchAllRows } from "@/lib/supabase-pagination";
import { dedupeZetaShadowInvoicesCanonical } from "@/lib/copilot-zeta-invoice-canonical-dedup";
import type { DataRow } from "@/lib/data/proto-operational-read-repository";
import {
  buildCanonicalSaleDocuments,
  type RawSaleInvoiceRow,
} from "@/lib/sales/canonical/build-canonical-sales";
import { SALESPERSON_START_DATE, type CanonicalSaleDocument } from "@/lib/sales/canonical/types";
import type { SalesCatalogView } from "@/lib/sales/canonical/catalog-types";
import { loadSalesCatalogView } from "@/lib/sales/sales-catalog-repository";
import {
  loadSalespersons,
  loadDocumentAssignments,
  type SalespersonRow,
} from "@/lib/sales/sales-salesperson-repository";
import {
  loadClientSalespersonAssignments,
  resolveClientSalespersonOnDate,
  countAssignedCustomersBySalesperson,
  type ClientSalespersonAssignmentRow,
} from "@/lib/sales/sales-client-salesperson-repository";
import { isCreditNoteFromMetadata } from "@/lib/copilot-zeta-credit-note";

/** Lookback para primera compra (cliente nuevo). KPI de montos sigue filtrando por período + MIN_FINANCIAL_DATE. */
const FIRST_SALE_LOOKBACK_DATE = "2020-01-01";

export type SalesDataset = {
  documents: CanonicalSaleDocument[];
  catalog: SalesCatalogView;
  salespersons: SalespersonRow[];
  /** Historial de asignaciones cliente↔comercial (puede estar vacío si migración pendiente). */
  clientAssignments: ClientSalespersonAssignmentRow[];
  /** customerId → primera venta válida (incluye historia previa a MIN_FINANCIAL_DATE). */
  firstSaleByCustomerId: Map<string, string>;
  /** Clientes con asignación abierta por comercial. */
  assignedCustomerCountBySalesperson: Map<string | null, number>;
  meta: {
    invoiceRowsLoaded: number;
    documentsBuilt: number;
    catalogMigrationPending: boolean;
    salespersonsMigrationPending: boolean;
    clientAssignmentMigrationPending: boolean;
    reachedMaxRows: boolean;
  };
};

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/** Nombre de cliente: name → legal_name → RazonSocial → Nombre. */
function companyDisplayName(row: Record<string, unknown>): string {
  return (
    str(row.name).trim() ||
    str(row.legal_name).trim() ||
    str(row.RazonSocial).trim() ||
    str(row.Nombre).trim() ||
    ""
  );
}

async function loadCustomerNames(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const { rows } = await fetchAllRows<Record<string, unknown>>({
      queryPage: (from, to) =>
        supabase
          .from("proto_companies")
          .select("id, name, legal_name, RazonSocial, Nombre")
          .eq("workspace_company_id", workspaceId)
          .order("id", { ascending: true })
          .range(from, to),
      pageSize: 1000,
      maxRows: 50000,
    });
    for (const r of rows) {
      const id = str(r.id).trim();
      const name = companyDisplayName(r);
      if (id && name) map.set(id, name);
    }
  } catch {
    // Degradación segura: sin nombres, el modelo usa fallback por código.
  }
  return map;
}

const VOIDED = new Set(["cancelled", "canceled", "void", "voided", "anulado", "anulada"]);

/**
 * Primera venta válida por customerId usando historia extendida (no solo KPI ≥ 2026-01-01).
 * Excluye NC y anulados. Sin customerId no se indexa (no hay clave estable).
 */
async function loadFirstSaleByCustomerId(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const { rows } = await fetchAllRows<Record<string, unknown>>({
      queryPage: (from, to) =>
        supabase
          .from("proto_invoices")
          .select("company_id, issue_date, status, zeta_metadata")
          .eq("workspace_company_id", workspaceId)
          .gte("issue_date", FIRST_SALE_LOOKBACK_DATE)
          .order("issue_date", { ascending: true })
          .range(from, to),
      pageSize: 1000,
      maxRows: 200000,
    });
    for (const r of rows) {
      const customerId = str(r.company_id).trim();
      if (!customerId) continue;
      const issueDate = str(r.issue_date).slice(0, 10);
      if (!issueDate) continue;
      const status = str(r.status).trim().toLowerCase();
      if (status && VOIDED.has(status)) continue;
      if (isCreditNoteFromMetadata(r.zeta_metadata)) continue;
      const prev = map.get(customerId);
      if (!prev || issueDate < prev) map.set(customerId, issueDate);
    }
  } catch {
    // Degradación: el caller usará firstSale derivado del dataset KPI.
  }
  return map;
}

/**
 * Carga y construye el dataset canónico de ventas del workspace.
 * `supabase` debe estar ya scoped al tenant (contexto Copilot).
 */
export async function loadSalesDataset(
  supabase: SupabaseClient,
  workspaceId: string,
  options?: { minDate?: string }
): Promise<SalesDataset> {
  const minDate = options?.minDate ?? MIN_FINANCIAL_DATE;

  const [
    { rows: invoiceRows, reachedMaxRows },
    names,
    catalogResult,
    spResult,
    documentAssignments,
    clientAssignResult,
    firstSaleByCustomerId,
  ] = await Promise.all([
    fetchAllRows<RawSaleInvoiceRow>({
      queryPage: (from, to) =>
        supabase
          .from("proto_invoices")
          .select("*")
          .eq("workspace_company_id", workspaceId)
          .gte("issue_date", minDate)
          .order("id", { ascending: true })
          .range(from, to),
      pageSize: 1000,
      maxRows: 100000,
    }),
    loadCustomerNames(supabase, workspaceId),
    loadSalesCatalogView(supabase, workspaceId),
    loadSalespersons(supabase, workspaceId).catch(() => ({
      salespersons: [] as SalespersonRow[],
      migrationPending: true,
    })),
    loadDocumentAssignments(supabase, workspaceId).catch(() => new Map<string, string>()),
    loadClientSalespersonAssignments(supabase, workspaceId).catch(() => ({
      assignments: [] as ClientSalespersonAssignmentRow[],
      migrationPending: true,
    })),
    loadFirstSaleByCustomerId(supabase, workspaceId),
  ]);

  const deduped = dedupeZetaShadowInvoicesCanonical(invoiceRows as unknown as DataRow[]);

  const documents = buildCanonicalSaleDocuments({
    workspaceId,
    rows: deduped as unknown as RawSaleInvoiceRow[],
    customerNames: names,
    catalog: catalogResult.view,
    minDate,
  });

  const spNameById = new Map(spResult.salespersons.map((s) => [s.id, s.displayName]));
  const clientAssignments = clientAssignResult.assignments;

  for (const doc of documents) {
    if (doc.issueDate < SALESPERSON_START_DATE) continue;

    // 1) Override legacy por documento (histórico / excepción).
    const legacySpId = documentAssignments.get(doc.documentId);
    if (legacySpId && spNameById.has(legacySpId)) {
      doc.salespersonId = legacySpId;
      doc.salespersonName = spNameById.get(legacySpId) ?? null;
      continue;
    }

    // 2) Comercial vigente del cliente en la fecha de la factura.
    const clientSpId = resolveClientSalespersonOnDate(clientAssignments, doc.customerId, doc.issueDate);
    if (clientSpId && spNameById.has(clientSpId)) {
      doc.salespersonId = clientSpId;
      doc.salespersonName = spNameById.get(clientSpId) ?? null;
    }
  }

  return {
    documents,
    catalog: catalogResult.view,
    salespersons: spResult.salespersons,
    clientAssignments,
    firstSaleByCustomerId,
    assignedCustomerCountBySalesperson: countAssignedCustomersBySalesperson(clientAssignments),
    meta: {
      invoiceRowsLoaded: invoiceRows.length,
      documentsBuilt: documents.length,
      catalogMigrationPending: catalogResult.migrationPending,
      salespersonsMigrationPending: spResult.migrationPending,
      clientAssignmentMigrationPending: clientAssignResult.migrationPending,
      reachedMaxRows,
    },
  };
}
