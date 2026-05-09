import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { collectionCreateAction } from "@/lib/copilot-collection-service";
import {
  COLLECTION_ACTION_TYPES,
  COLLECTION_STATUSES,
  COLLECTION_PRIORITIES,
  type CollectionActionInput,
} from "@/lib/copilot-collection-types";

const MSG_DB = "Error de base de datos. Intentá de nuevo.";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) return auth.response;

    const { supabase, tenantCompanyId } = auth.ctx;

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, code: "VALIDATION", message: "Body inválido." },
        { status: 400 }
      );
    }

    const companyId = typeof body.company_id === "string" ? body.company_id.trim() : "";
    if (!companyId) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION", message: "Falta company_id." },
        { status: 400 }
      );
    }

    const actionType = typeof body.action_type === "string" ? body.action_type : "";
    if (!(COLLECTION_ACTION_TYPES as readonly string[]).includes(actionType)) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION", message: "action_type inválido." },
        { status: 400 }
      );
    }

    const input: CollectionActionInput = {
      companyId,
      actionType: actionType as CollectionActionInput["actionType"],
      status:
        typeof body.status === "string" &&
        (COLLECTION_STATUSES as readonly string[]).includes(body.status)
          ? (body.status as CollectionActionInput["status"])
          : "pending_review",
      priority:
        typeof body.priority === "string" &&
        (COLLECTION_PRIORITIES as readonly string[]).includes(body.priority)
          ? (body.priority as CollectionActionInput["priority"])
          : "medium",
      assignedTo: typeof body.assigned_to === "string" ? body.assigned_to || null : null,
      createdBy: typeof body.created_by === "string" ? body.created_by || null : null,
      dueDate: typeof body.due_date === "string" ? body.due_date || null : null,
      contactDate: typeof body.contact_date === "string" ? body.contact_date || null : null,
      nextActionDate:
        typeof body.next_action_date === "string" ? body.next_action_date || null : null,
      promiseDate:
        typeof body.promise_date === "string" ? body.promise_date || null : null,
      promiseAmount:
        typeof body.promise_amount === "number" && body.promise_amount > 0
          ? body.promise_amount
          : null,
      promiseCurrency:
        body.promise_currency === "UYU" || body.promise_currency === "USD"
          ? body.promise_currency
          : null,
      notes: typeof body.notes === "string" ? body.notes || null : null,
      metadata:
        body.metadata !== null &&
        typeof body.metadata === "object" &&
        !Array.isArray(body.metadata)
          ? (body.metadata as Record<string, unknown>)
          : null,
    };

    const result = await collectionCreateAction(supabase, input, tenantCompanyId);

    if (!result.ok) {
      const status = result.code === "VALIDATION" ? 400 : result.code === "NOT_FOUND" ? 404 : 500;
      return NextResponse.json(result, { status });
    }

    console.info(
      JSON.stringify({
        source: "collection_actions",
        kind: "action_created",
        workspace_id: tenantCompanyId,
        company_id: companyId,
        action_type: input.actionType,
        status: input.status,
        action_id: result.data.id,
      })
    );

    return NextResponse.json(result, { status: 201 });
  } catch {
    return NextResponse.json(
      { ok: false, code: "DATABASE", message: MSG_DB },
      { status: 500 }
    );
  }
}
