import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { tmacGet, tmacUpsert } from "@/lib/treasury/services/treasury-movement-accounting-service";
import type { TreasuryMovementAccountingInput } from "@/lib/treasury/treasury-types";
import { nextResponseFromTreasuryCrud } from "@/lib/treasury/treasury-http";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) return auth.response;

    const { id } = await context.params;
    const result = await tmacGet(auth.ctx.supabase, auth.ctx.tenantCompanyId, id);
    return nextResponseFromTreasuryCrud(result);
  } catch (err) {
    console.error("[movements/[id]/accounting/GET]", err);
    return NextResponse.json({ ok: false, code: "DATABASE", message: MSG_DB_USER }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) return auth.response;

    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, code: "VALIDATION", message: "Body inválido." }, { status: 400 });
    }

    const input: TreasuryMovementAccountingInput = {};
    if (typeof body.accounting_posted === "boolean") input.accountingPosted = body.accounting_posted;
    if (typeof body.accounting_checked === "boolean") input.accountingChecked = body.accounting_checked;
    if ("zeta_accounting_entry_id" in body) input.zetaAccountingEntryId = body.zeta_accounting_entry_id as string | null;
    if ("zeta_accounting_entry_number" in body) input.zetaAccountingEntryNumber = body.zeta_accounting_entry_number as string | null;
    if ("zeta_accounting_entry_date" in body) input.zetaAccountingEntryDate = body.zeta_accounting_entry_date as string | null;
    if ("zeta_accounting_entry_amount" in body && body.zeta_accounting_entry_amount != null) {
      input.zetaAccountingEntryAmount = Number(body.zeta_accounting_entry_amount);
    }
    if ("zeta_accounting_entry_currency" in body) input.zetaAccountingEntryCurrency = body.zeta_accounting_entry_currency as string | null;
    if (typeof body.accounting_match_status === "string") {
      input.accountingMatchStatus = body.accounting_match_status as TreasuryMovementAccountingInput["accountingMatchStatus"];
    }
    if ("accounting_notes" in body) input.accountingNotes = body.accounting_notes as string | null;

    const result = await tmacUpsert(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      id,
      input,
      auth.ctx.appUser.id
    );
    return nextResponseFromTreasuryCrud(result);
  } catch (err) {
    console.error("[movements/[id]/accounting/PUT]", err);
    return NextResponse.json({ ok: false, code: "DATABASE", message: MSG_DB_USER }, { status: 500 });
  }
}
