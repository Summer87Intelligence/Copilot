export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { enforcePdfRateLimit } from "@/lib/security/pdf-rate-limit";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";
import {
  listProtoCompanies,
  listProtoInvoices,
  listProtoReceipts,
  getProtoCompanyById,
} from "@/lib/data/proto-operational-read-repository";
import { buildClientAccountStatement } from "@/lib/copilot-client-account-statement";
import {
  renderAccountStatementPdf,
  renderBulkAccountStatementsPdf,
  type BulkAccountStatementEntry,
  type ClientInfo,
} from "@/lib/account-statement/render-account-statement-pdf";
import { ISSUER_FALLBACK, type IssuerInfo } from "@/lib/account-statement/issuer-fallback";

function toFiniteOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);

  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "bulk_account_statements_pdf" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const rateLimited = enforcePdfRateLimit(request, "reports/account-statements", auth.ctx.appUser.id);
    if (rateLimited) return rateLimited;

    const tenantCompanyId = auth.ctx.tenantCompanyId.trim();
    if (!tenantCompanyId) {
      return NextResponse.json(
        { ok: false, code: "FORBIDDEN_TENANT", error: "Sin workspace válido." },
        { status: 403 }
      );
    }

    const supabaseFromCookies = await createRouteSupabaseClient();
    const { data: userData, error: userErr } = await supabaseFromCookies.auth.getUser();
    const supabase = !userErr && userData.user ? supabaseFromCookies : auth.ctx.supabase;

    const sp = request.nextUrl.searchParams;
    const from = sp.get("from")?.trim() || undefined;
    const to = sp.get("to")?.trim() || undefined;
    const currencyParam = sp.get("currency")?.trim().toUpperCase();
    const companyIdParam = sp.get("companyId")?.trim() || null;
    const currencies: Array<"UYU" | "USD"> =
      currencyParam === "UYU" ? ["UYU"] :
      currencyParam === "USD" ? ["USD"] :
      ["UYU", "USD"];

    log.info("bulk_account_statements_pdf_fetching", { currencies });

    const [companies, allInvoices, allReceipts, issuerRow] = await Promise.all([
      listProtoCompanies(supabase, "active", tenantCompanyId),
      listProtoInvoices(supabase, "all", tenantCompanyId),
      listProtoReceipts(supabase, "all", tenantCompanyId),
      getProtoCompanyById(supabase, tenantCompanyId, tenantCompanyId).catch(() => null),
    ]);

    // Group invoices and receipts by company_id
    type DataRow = Record<string, unknown>;
    const invoicesByCompany = new Map<string, DataRow[]>();
    for (const inv of allInvoices) {
      const cid = String(inv.company_id ?? "");
      if (!cid) continue;
      const arr = invoicesByCompany.get(cid);
      if (arr) arr.push(inv);
      else invoicesByCompany.set(cid, [inv]);
    }
    const receiptsByCompany = new Map<string, DataRow[]>();
    for (const rec of allReceipts) {
      const cid = String(rec.company_id ?? "");
      if (!cid) continue;
      const arr = receiptsByCompany.get(cid);
      if (arr) arr.push(rec);
      else receiptsByCompany.set(cid, [rec]);
    }

    // Build issuer info
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

    // ── Single-client mode ────────────────────────────────────────────────────
    if (companyIdParam) {
      const targetCompany = companies.find((c) => String(c.id ?? "") === companyIdParam);
      if (!targetCompany || companyIdParam === tenantCompanyId) {
        return NextResponse.json(
          { ok: false, code: "CLIENT_NOT_FOUND", error: "Cliente no encontrado en este workspace." },
          { status: 404 }
        );
      }

      const invoices = invoicesByCompany.get(companyIdParam) ?? [];
      const receipts = receiptsByCompany.get(companyIdParam) ?? [];
      const obUyu = toFiniteOrNull((targetCompany as Record<string, unknown>).ledger_opening_balance_uyu);
      const obUsd = toFiniteOrNull((targetCompany as Record<string, unknown>).ledger_opening_balance_usd);
      const statement = buildClientAccountStatement({
        invoices,
        receipts,
        ledgerMode: true,
        openingBalanceUyu: obUyu,
        openingBalanceUsd: obUsd,
      });

      const hasData = currencies.some((cur) => {
        const block = cur === "UYU" ? statement.uyu : statement.usd;
        return block.movements.length > 0;
      });
      if (!hasData) {
        return NextResponse.json(
          { ok: false, code: "NO_DATA", error: "No hay movimientos para la moneda solicitada." },
          { status: 404 }
        );
      }

      const companyName =
        String(
          targetCompany.name ?? targetCompany.company_name ??
          (targetCompany as Record<string, unknown>).zeta_client_name ?? ""
        ).trim() || "Cliente";

      const client: ClientInfo = {
        code: String((targetCompany as Record<string, unknown>).external_id ?? "").trim() || undefined,
        name: companyName,
        address:
          [String(targetCompany.address ?? "").trim(), String(targetCompany.city ?? "").trim()]
            .filter(Boolean)
            .join(", ") || undefined,
        phone: String(targetCompany.phone ?? "").trim() || undefined,
      };

      log.info("single_account_statement_pdf_building", { companyId: companyIdParam, currencies });

      const pdfBuffer = await renderAccountStatementPdf({
        companyName,
        statement,
        currencies,
        from,
        to,
        issuer,
        client,
      });

      const todayYmd = new Date().toISOString().slice(0, 10);
      const currencySlug = currencies.length === 1 ? currencies[0]!.toLowerCase() : "uyu-usd";
      const clientSlug = companyName
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40);
      const filename = `estado-cuenta-${clientSlug}-${currencySlug}-${todayYmd}.pdf`;

      log.info("single_account_statement_pdf_done", { bytes: pdfBuffer.length, companyId: companyIdParam });

      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // ── Bulk mode ─────────────────────────────────────────────────────────────
    // Build entries sorted by client name
    const sortedCompanies = [...companies].sort((a, b) => {
      const na = String(a.name ?? a.company_name ?? "");
      const nb = String(b.name ?? b.company_name ?? "");
      return na.localeCompare(nb, "es");
    });

    const entries: BulkAccountStatementEntry[] = [];
    for (const company of sortedCompanies) {
      const companyId = String(company.id ?? "");
      if (!companyId || companyId === tenantCompanyId) continue;

      const invoices = invoicesByCompany.get(companyId) ?? [];
      const receipts = receiptsByCompany.get(companyId) ?? [];
      const obUyu = toFiniteOrNull((company as Record<string, unknown>).ledger_opening_balance_uyu);
      const obUsd = toFiniteOrNull((company as Record<string, unknown>).ledger_opening_balance_usd);
      const statement = buildClientAccountStatement({
        invoices,
        receipts,
        ledgerMode: true,
        openingBalanceUyu: obUyu,
        openingBalanceUsd: obUsd,
      });

      // Only include clients that have movements in the requested currencies
      const hasData = currencies.some((cur) => {
        const block = cur === "UYU" ? statement.uyu : statement.usd;
        return block.movements.length > 0;
      });
      if (!hasData) continue;

      const companyName =
        String(company.name ?? company.company_name ?? company.zeta_client_name ?? "").trim() ||
        "Cliente";

      const client: ClientInfo = {
        code: String(company.external_id ?? "").trim() || undefined,
        name: companyName,
        address: [
          String(company.address ?? "").trim(),
          String(company.city ?? "").trim(),
        ].filter(Boolean).join(", ") || undefined,
        phone: String(company.phone ?? "").trim() || undefined,
      };

      entries.push({ client, companyName, statement });
    }

    log.info("bulk_account_statements_pdf_building", {
      clientCount: entries.length,
      currencies,
    });

    if (entries.length === 0) {
      return NextResponse.json(
        { ok: false, code: "NO_DATA", error: "No hay clientes con movimientos para la moneda solicitada." },
        { status: 404 }
      );
    }

    const pdfBuffer = await renderBulkAccountStatementsPdf({ entries, currencies, issuer });

    const todayYmd = new Date().toISOString().slice(0, 10);
    const currencySlug =
      currencies.length === 1 ? currencies[0]!.toLowerCase() : "uyu-usd";
    const filename = `estados-cuenta-clientes-${currencySlug}-${todayYmd}.pdf`;

    log.info("bulk_account_statements_pdf_done", {
      bytes: pdfBuffer.length,
      clientCount: entries.length,
    });

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
    console.error("[bulk-account-statements-pdf] INTERNAL_ERROR:", errMsg);
    log.error("bulk_account_statements_pdf_error", err);
    return NextResponse.json(
      { ok: false, code: "INTERNAL_ERROR", error: "No se pudo generar el PDF." },
      { status: 500 }
    );
  }
}
