export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { enforcePdfRateLimit } from "@/lib/security/pdf-rate-limit";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";
import {
  listProtoInvoicesByCompanyIdForLedger,
  listProtoReceiptsByCompanyIdForLedger,
  getProtoCompanyById,
} from "@/lib/data/proto-operational-read-repository";
import { buildClientAccountStatement } from "@/lib/copilot-client-account-statement";
import {
  buildAccountStatementDownloadFilename,
  slugifyClientNameForFilename,
} from "@/lib/account-statement/build-collection-account-statement-attachments";
import { renderAccountStatementPdf, type ClientInfo } from "@/lib/account-statement/render-account-statement-pdf";
import { ISSUER_FALLBACK, type IssuerInfo } from "@/lib/account-statement/issuer-fallback";

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

    const rateLimited = enforcePdfRateLimit(request, "clientes/account-statement", auth.ctx.appUser.id);
    if (rateLimited) return rateLimited;

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
    const [invoices, receipts, company, issuerRow] = await Promise.all([
      listProtoInvoicesByCompanyIdForLedger(supabase, companyId, tenantCompanyId),
      listProtoReceiptsByCompanyIdForLedger(supabase, companyId, tenantCompanyId),
      getProtoCompanyById(supabase, companyId, tenantCompanyId),
      // Intenta cargar la empresa del workspace como emisor; usa fallback si falla o no existe
      getProtoCompanyById(supabase, tenantCompanyId, tenantCompanyId).catch(() => null),
    ]);
    log.info("account_statement_pdf_data_ready", {
      invoiceCount: invoices.length,
      receiptCount: receipts.length,
    });

    const statement = buildClientAccountStatement({ invoices, receipts, ledgerMode: true });
    const companyName =
      String(company?.name ?? company?.company_name ?? company?.zeta_client_name ?? "").trim() ||
      "Cliente";

    // Datos del cliente para el bloque gris del PDF
    const client: ClientInfo = {
      code: String(company?.external_id ?? "").trim() || undefined,
      name: companyName,
      address: [
        String(company?.address ?? "").trim(),
        String(company?.city ?? "").trim(),
      ].filter(Boolean).join(", ") || undefined,
      phone: String(company?.phone ?? "").trim() || undefined,
    };

    // Datos del emisor — empresa del workspace, con fallback a config demo
    const issuerName = String(issuerRow?.name ?? issuerRow?.company_name ?? "").trim();
    const issuer: IssuerInfo = issuerName
      ? {
          name: issuerName,
          rut: String(issuerRow?.rut ?? "").trim() || undefined,
          addressLine: String(issuerRow?.address ?? "").trim() || undefined,
          phone: String(issuerRow?.phone ?? "").trim()
            ? `Tel. ${String(issuerRow?.phone).trim()}`
            : undefined,
          city: String(issuerRow?.city ?? "").trim() || undefined,
        }
      : ISSUER_FALLBACK;

    log.info("account_statement_pdf_rendering", { companyName, hasIssuer: issuerName !== "" });
    const pdfBuffer = await renderAccountStatementPdf({
      companyName,
      statement,
      currencies,
      from,
      to,
      issuer,
      client,
    });
    log.info("account_statement_pdf_done", { bytes: pdfBuffer.length });
    const todayYmd = new Date().toISOString().slice(0, 10);
    const currencySuffix =
      currencies.length === 1 ? currencies[0]!.toLowerCase() : "multi";
    const filename =
      currencies.length === 1
        ? buildAccountStatementDownloadFilename(companyName, currencies[0]!, todayYmd)
        : `estado-cuenta-${slugifyClientNameForFilename(companyName)}-${currencySuffix}-${todayYmd}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
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
