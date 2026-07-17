/**
 * FASE 9 — Data source server-side del módulo Ventas.
 *
 * Carga (una sola vez por request) el universo de facturas del workspace desde
 * MIN_FINANCIAL_DATE, lo deduplica con la lógica canónica compartida, resuelve
 * nombres de cliente y construye los documentos canónicos + la vista de catálogo.
 *
 * Atribución comercial FASE 9D — FUENTE CANÓNICA desde 2026-07-01:
 *   comercial vigente del cliente en issue_date (sales_client_salespersons)
 *   → Sin asignar
 *
 * `sales_document_salespersons` es legado histórico / auditoría técnica.
 * NO influye en Resumen, Clientes, Detalle, Comparativo, Comerciales,
 * insights, rankings, Cliente 360, Hoy ni Dashboard.
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
  type SalespersonRow,
} from "@/lib/sales/sales-salesperson-repository";
import {
  loadClientSalespersonAssignments,
  resolveClientSalespersonOnDate,
  countAssignedCustomersBySalesperson,
  currentClientSalespersonMap,
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
  /** customerId → comercial VIGENTE (asignación abierta) — para el selector editable. */
  currentSalespersonByCustomerId: Map<string, string>;
  /** salespersonId → displayName. */
  salespersonNameById: Map<string, string>;
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

  // Fuente canónica desde 2026-07-01: comercial vigente del cliente en issue_date.
  // Incluye ventas y NC (Case B): la NC hereda el comercial del cliente en su fecha.
  // sales_document_salespersons NO se consulta ni aplica aquí (legado / auditoría).
  for (const doc of documents) {
    if (doc.issueDate < SALESPERSON_START_DATE) continue;
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
    currentSalespersonByCustomerId: currentClientSalespersonMap(clientAssignments),
    salespersonNameById: spNameById,
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
