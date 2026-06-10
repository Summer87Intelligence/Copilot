export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";

import { COPILOT_MANUAL_PDF_FILENAME } from "@/lib/copilot-manual-content";
import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { enforcePdfRateLimit } from "@/lib/security/pdf-rate-limit";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { renderCopilotManualPdf } from "@/lib/reports/manual/render-copilot-manual-pdf";

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);

  try {
    const auth = await requireCopilotModuleAccess(request, "manual");
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "manual_pdf" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const rateLimited = enforcePdfRateLimit(request, "copilot/manual", auth.ctx.appUser.id);
    if (rateLimited) return rateLimited;

    const tenantCompanyId = auth.ctx.tenantCompanyId.trim();
    if (!tenantCompanyId) {
      return NextResponse.json(
        { ok: false, code: "FORBIDDEN_TENANT", error: "Sin workspace válido." },
        { status: 403 }
      );
    }

    log.info("manual_pdf_generating");

    const pdfBuffer = await renderCopilotManualPdf({ generatedAt: new Date() });

    log.info("manual_pdf_ready", { bytes: pdfBuffer.length });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${COPILOT_MANUAL_PDF_FILENAME}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err) {
    log.error("manual_pdf_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, error: "No se pudo generar el manual en PDF." },
      { status: 500 }
    );
  }
}
