import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { scheduledPaymentCreateBodySchema } from "@/lib/api/schemas/treasury-scheduled-payment-bodies";
import { requireCopilotModuleAccess, requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { getEndOfCurrentMonth } from "@/lib/copilot-operational-period";
import { parseYmdQuery } from "@/lib/treasury/treasury-db-helpers";
import { nextResponseFromTreasuryCrud, treasuryCreatedResponse } from "@/lib/treasury/treasury-http";
import {
  createScheduledPayment,
  filterPlannedObligationsForHoyScheduledList,
  listScheduledPayments,
  loadInactiveRecurringTemplateIds,
  mapPlannedObligationToScheduledPayment,
  summarizeScheduledOutflows,
} from "@/lib/treasury/treasury-scheduled-payments";
import { plannedCashObligationList } from "@/lib/treasury/services/planned-cash-obligation-service";
import type { TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";

function parseScheduledListQuery(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const raw = params.get("currency")?.trim() || params.get("currency_code")?.trim();
  const currency =
    raw === "UYU" || raw === "USD" ? (raw as TreasuryCurrencyCode) : undefined;
  return {
    currencyCode: currency,
    fromDate: parseYmdQuery(params.get("from_date")),
    toDate: parseYmdQuery(params.get("to_date")),
    asOfDate: parseYmdQuery(params.get("as_of")) ?? new Date().toISOString().slice(0, 10),
    /** Fecha de corte explícita — si no viene, usa fin del mes actual (contrato único). */
    horizonEndDate: parseYmdQuery(params.get("horizon_end_date")) ?? getEndOfCurrentMonth(),
    includeSummary: params.get("include_summary") === "1" || params.get("include_summary") === "true",
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireCopilotModuleAccess(request, "tesoreria");
    if (!auth.ok) return auth.response;

    const q = parseScheduledListQuery(request);

    if (q.includeSummary) {
      const listed = await plannedCashObligationList(
        auth.ctx.supabase,
        auth.ctx.tenantCompanyId,
        { direction: "outflow", currencyCode: q.currencyCode },
        500
      );
      if (!listed.ok) return nextResponseFromTreasuryCrud(listed);
      const horizonEnd = q.horizonEndDate;
      const inactiveRecurringTemplateIds = await loadInactiveRecurringTemplateIds(
        auth.ctx.supabase,
        auth.ctx.tenantCompanyId
      );
      const range = {
        asOfDate: q.asOfDate,
        horizonEndDate: horizonEnd,
        periodStartDate: q.fromDate,
        periodEndDate: q.toDate ?? horizonEnd,
        inactiveRecurringTemplateIds,
      };
      const summary = summarizeScheduledOutflows(listed.data.items, range);
      const hoyRows = filterPlannedObligationsForHoyScheduledList(listed.data.items, range).filter(
        (row) => !q.currencyCode || row.currencyCode === q.currencyCode
      );
      const items = hoyRows.map((row) =>
        mapPlannedObligationToScheduledPayment(row, q.asOfDate)
      );
      return NextResponse.json({
        ok: true as const,
        data: { items, count: items.length, summary },
        message: "Pagos programados listados.",
      });
    }

    const result = await listScheduledPayments(auth.ctx.supabase, auth.ctx.tenantCompanyId, {
      currencyCode: q.currencyCode,
      fromDate: q.fromDate,
      toDate: q.toDate,
    });
    return nextResponseFromTreasuryCrud(result);
  } catch {
    return NextResponse.json(
      { ok: false as const, code: "DATABASE" as const, message: MSG_DB_USER },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseAndValidateJsonBody(request, scheduledPaymentCreateBodySchema);
    if (!parsed.ok) return parsed.response;

    const auth = await requireCopilotModuleWriteAccess(request, "tesoreria",
      parsed.data as Record<string, unknown>
    );
    if (!auth.ok) return auth.response;

    const result = await createScheduledPayment(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      parsed.data
    );
    return treasuryCreatedResponse(result);
  } catch {
    return NextResponse.json(
      { ok: false as const, code: "DATABASE" as const, message: MSG_DB_USER },
      { status: 500 }
    );
  }
}
