/**
 * FASE 9 — Data source server-side del módulo Ventas.
 *
 * Carga (una sola vez por request) el universo de facturas del workspace desde
 * MIN_FINANCIAL_DATE, lo deduplica con la lógica canónica compartida, resuelve
 * nombres de cliente y construye los documentos canónicos + la vista de catálogo.
 *
 * Todas las agregaciones (snapshot, productos, clientes, comparación, etc.) se
 * calculan sobre ESTE resultado — sin N+1, sin re-query por métrica.
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

export type SalesDataset = {
  documents: CanonicalSaleDocument[];
  catalog: SalesCatalogView;
  salespersons: SalespersonRow[];
  meta: {
    invoiceRowsLoaded: number;
    documentsBuilt: number;
    catalogMigrationPending: boolean;
    salespersonsMigrationPending: boolean;
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

  const [{ rows: invoiceRows, reachedMaxRows }, names, catalogResult, spResult, assignments] =
    await Promise.all([
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
      loadSalespersons(supabase, workspaceId).catch(() => ({ salespersons: [], migrationPending: true })),
      loadDocumentAssignments(supabase, workspaceId).catch(() => new Map<string, string>()),
    ]);

  // Dedup canónico compartido (mismos universos que Cartera/Finanzas/Reportes).
  const deduped = dedupeZetaShadowInvoicesCanonical(invoiceRows as unknown as DataRow[]);

  const documents = buildCanonicalSaleDocuments({
    workspaceId,
    rows: deduped as unknown as RawSaleInvoiceRow[],
    customerNames: names,
    catalog: catalogResult.view,
    minDate,
  });

  // Adjuntar comercial por documento (solo aplica a ventas desde 2026-07-01;
  // asignaciones a documentos anteriores se ignoran por regla de vigencia).
  const spNameById = new Map(spResult.salespersons.map((s) => [s.id, s.displayName]));
  for (const doc of documents) {
    if (doc.issueDate < SALESPERSON_START_DATE) continue;
    const spId = assignments.get(doc.documentId);
    if (spId && spNameById.has(spId)) {
      doc.salespersonId = spId;
      doc.salespersonName = spNameById.get(spId) ?? null;
    }
  }

  return {
    documents,
    catalog: catalogResult.view,
    salespersons: spResult.salespersons,
    meta: {
      invoiceRowsLoaded: invoiceRows.length,
      documentsBuilt: documents.length,
      catalogMigrationPending: catalogResult.migrationPending,
      salespersonsMigrationPending: spResult.migrationPending,
      reachedMaxRows,
    },
  };
}
