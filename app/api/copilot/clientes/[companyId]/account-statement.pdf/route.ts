export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";
import {
  listProtoInvoicesByCompanyId,
  listProtoReceiptsByCompanyId,
  getProtoCompanyById,
} from "@/lib/data/proto-operational-read-repository";
import { buildClientAccountStatement } from "@/lib/copilot-client-account-statement";
import { renderAccountStatementPdf } from "@/lib/account-statement/render-account-statement-pdf";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  let log = copilotRequestLogger(request);

  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "account_statement_pdf" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const tenantCompanyId = auth.ctx.tenantCompanyId.trim();
    if (!tenantCompanyId) {
      return NextResponse.json(
        { ok: false, code: "FORBIDDEN_TENANT", error: "Sin workspace válido." },
        { status: 403 }
      );
    }

    const { companyId } = await params;
    if (!companyId?.trim()) {
      return NextResponse.json(
        { ok: false, code: "BAD_REQUEST", error: "Falta companyId." },
        { status: 400 }
      );
    }

    const supabaseFromCookies = await createRouteSupabaseClient();
    const { data: userData, error: userErr } = await supabaseFromCookies.auth.getUser();
    const supabase = !userErr && userData.user ? supabaseFromCookies : auth.ctx.supabase;

    const sp = request.nextUrl.searchParams;
    const from = sp.get("from")?.trim() || undefined;
    const to = sp.get("to")?.trim() || undefined;
    const currencyParam = sp.get("currency")?.trim().toUpperCase();
    const currencies: Array<"UYU" | "USD"> =
      currencyParam === "UYU" ? ["UYU"] :
      currencyParam === "USD" ? ["USD"] :
      ["UYU", "USD"];

    log.info("account_statement_pdf_fetching", { companyId, from, to, currencies });
    const [invoices, receipts, company] = await Promise.all([
      listProtoInvoicesByCompanyId(supabase, companyId, "all", tenantCompanyId),
      listProtoReceiptsByCompanyId(supabase, companyId, "all", tenantCompanyId),
      getProtoCompanyById(supabase, companyId, tenantCompanyId),
    ]);
    log.info("account_statement_pdf_data_ready", {
      invoiceCount: invoices.length,
      receiptCount: receipts.length,
    });

    const statement = buildClientAccountStatement({ invoices, receipts, ledgerMode: true });
    const companyName =
      String(company?.name ?? company?.company_name ?? company?.zeta_client_name ?? "").trim() ||
      "Cliente";

    log.info("account_statement_pdf_rendering", { companyName });
    const pdfBuffer = await renderAccountStatementPdf({ companyName, statement, currencies, from, to });
    log.info("account_statement_pdf_done", { bytes: pdfBuffer.length });
    const safeFilename = companyName.replace(/[^a-zA-Z0-9_\-áéíóúÁÉÍÓÚüÜñÑ ]/g, "_").slice(0, 60);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="estado-de-cuenta-${safeFilename}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[account-statement-pdf] INTERNAL_ERROR:", errMsg, err instanceof Error ? err.stack : "");
    log.error("account_statement_pdf_error", err);
    return NextResponse.json(
      { ok: false, code: "INTERNAL_ERROR", error: "No se pudo generar el PDF." },
      { status: 500 }
    );
  }
}
