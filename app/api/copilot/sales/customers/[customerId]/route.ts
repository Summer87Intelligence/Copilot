import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { todayYmdMontevideo } from "@/lib/date/summer87-today";
import { loadSalesDataset } from "@/lib/sales/sales-data-source";
import { parseSalesFilters, buildSalesOverview } from "@/lib/sales/sales-api";
import { buildCustomerDrillDown } from "@/lib/sales/canonical/sales-analytics";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ customerId: string }> };

/** Drill-down on-demand de un cliente. */
export async function GET(request: NextRequest, ctx: Ctx) {
  const auth = await requireCopilotModuleAccess(request, "ventas");
  if (!auth.ok) return auth.response;

  const { customerId: rawId } = await ctx.params;
  const customerId = (rawId ?? "").trim();
  if (!customerId) {
    return NextResponse.json(
      { ok: false as const, code: "INVALID_ID", message: "Falta el identificador del cliente." },
      { status: 400 }
    );
  }

  try {
    const dataset = await loadSalesDataset(auth.ctx.supabase, auth.ctx.tenantCompanyId);
    const filters = parseSalesFilters(request.nextUrl.searchParams, todayYmdMontevideo());
    const overview = buildSalesOverview(dataset.documents, dataset.catalog, filters, {
      firstSaleByCustomerId: dataset.firstSaleByCustomerId,
      assignedCustomerCountBySalesperson: dataset.assignedCustomerCountBySalesperson,
    });
    const periodTotalUsd = overview.snapshot.netSalesByCurrency.USD;
    const data = buildCustomerDrillDown(
      dataset.documents,
      customerId,
      filters.dateFrom,
      filters.dateTo,
      periodTotalUsd
    );

    // Enriquecer con comercial vigente + historial de asignaciones.
    const customerRow = overview.customers.find((c) => c.customerId === customerId);
    const assignmentHistory = dataset.clientAssignments.filter((a) => a.customerId === customerId);
    const enriched = {
      ...data,
      summary: {
        ...data.summary,
        salesByCurrency: customerRow?.netSalesByCurrency ?? data.summary.salesByCurrency,
        netSalesByCurrency: customerRow?.netSalesByCurrency ?? data.summary.salesByCurrency,
        creditNotesByCurrency: customerRow?.creditNotesByCurrency ?? { UYU: 0, USD: 0 },
        salespersonId: customerRow?.salespersonId ?? null,
        salespersonName: customerRow?.salespersonName ?? data.summary.topSalespersonName,
        assignmentHistory: assignmentHistory.map((a) => ({
          salespersonId: a.salespersonId,
          validFrom: a.validFrom,
          validTo: a.validTo,
          assignedAt: a.assignedAt,
        })),
      },
    };

    if (enriched.summary.invoiceCount === 0 && enriched.invoices.length === 0) {
      return NextResponse.json(
        { ok: false as const, code: "NOT_FOUND", message: "No hay ventas de este cliente en el período." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true as const,
      data: enriched,
      meta: {
        period: filters,
        clientAssignmentMigrationPending: dataset.meta.clientAssignmentMigrationPending,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false as const,
        code: "SALES_LOAD_ERROR" as const,
        message: "No pudimos cargar el análisis del cliente.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
