import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { loadPaymentBehaviorData } from "@/lib/payment-behavior/payment-behavior-source";
import { runPaymentBehaviorEngine } from "@/lib/payment-behavior/payment-behavior-engine";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const auth = await requireCopilotModuleAccess(request, "cartera");
    if (!auth.ok) return auth.response;

    const today = new Date().toISOString().slice(0, 10);
    const wid = auth.ctx.tenantCompanyId;
    // Optional: filter response to a specific client
    const filterClientId = request.nextUrl.searchParams.get("client_id") ?? null;

    const { invoices, receipts } = await loadPaymentBehaviorData(auth.ctx.supabase, wid);

    const result = runPaymentBehaviorEngine(invoices, receipts, today);

    // Serialize Map to array for JSON response; filter by client if requested
    const profiles = [...result.profiles.values()].filter(
      (p) => !filterClientId || p.clientId === filterClientId
    );
    const projections = filterClientId
      ? result.projections.filter((p) => p.clientId === filterClientId)
      : result.projections;

    return NextResponse.json({
      ok: true,
      today,
      profiles,
      projections,
      summaries: result.summaries,
      globalFallbacks: result.globalFallbacks,
      meta: {
        invoiceCount: invoices.length,
        receiptCount: receipts.length,
        openInvoiceCount: projections.length,
        filteredByClientId: filterClientId ?? undefined,
      },
    });
  } catch (err) {
    console.error("[payment-behavior/projection] error:", err);
    return NextResponse.json(
      { ok: false as const, code: "DATABASE" as const, message: MSG_DB_USER },
      { status: 500 }
    );
  }
}
