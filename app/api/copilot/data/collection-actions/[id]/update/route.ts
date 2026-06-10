import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess, requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { collectionUpdateAction } from "@/lib/copilot-collection-service";
import {
  COLLECTION_ACTION_TYPES,
  COLLECTION_STATUSES,
  COLLECTION_PRIORITIES,
  type CollectionActionPatch,
} from "@/lib/copilot-collection-types";

const MSG_DB = "Error de base de datos. Intentá de nuevo.";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireCopilotModuleWriteAccess(request, "datos");
    if (!auth.ok) return auth.response;

    const { supabase, tenantCompanyId } = auth.ctx;
    const { id } = await params;

    if (!id?.trim()) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION", message: "Falta el id de la acción." },
        { status: 400 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, code: "VALIDATION", message: "Body inválido." },
        { status: 400 }
      );
    }

    const patch: CollectionActionPatch = {};

    if (
      typeof body.status === "string" &&
      (COLLECTION_STATUSES as readonly string[]).includes(body.status)
    ) {
      patch.status = body.status as CollectionActionPatch["status"];
    }

    if (
      typeof body.action_type === "string" &&
      (COLLECTION_ACTION_TYPES as readonly string[]).includes(body.action_type)
    ) {
      patch.actionType = body.action_type as CollectionActionPatch["actionType"];
    }

    if (
      typeof body.priority === "string" &&
      (COLLECTION_PRIORITIES as readonly string[]).includes(body.priority)
    ) {
      patch.priority = body.priority as CollectionActionPatch["priority"];
    }

    if (body.assigned_to !== undefined) {
      patch.assignedTo = typeof body.assigned_to === "string" ? body.assigned_to || null : null;
    }
    if (body.due_date !== undefined) {
      patch.dueDate = typeof body.due_date === "string" ? body.due_date || null : null;
    }
    if (body.contact_date !== undefined) {
      patch.contactDate = typeof body.contact_date === "string" ? body.contact_date || null : null;
    }
    if (body.next_action_date !== undefined) {
      patch.nextActionDate =
        typeof body.next_action_date === "string" ? body.next_action_date || null : null;
    }
    if (body.promise_date !== undefined) {
      patch.promiseDate =
        typeof body.promise_date === "string" ? body.promise_date || null : null;
    }
    if (body.promise_amount !== undefined) {
      patch.promiseAmount =
        typeof body.promise_amount === "number" && body.promise_amount > 0
          ? body.promise_amount
          : null;
    }
    if (body.promise_currency !== undefined) {
      patch.promiseCurrency =
        body.promise_currency === "UYU" || body.promise_currency === "USD"
          ? body.promise_currency
          : null;
    }
    if (body.notes !== undefined) {
      patch.notes = typeof body.notes === "string" ? body.notes || null : null;
    }
    if (
      body.metadata !== undefined &&
      body.metadata !== null &&
      typeof body.metadata === "object" &&
      !Array.isArray(body.metadata)
    ) {
      patch.metadata = body.metadata as Record<string, unknown>;
    }

    const result = await collectionUpdateAction(supabase, id, patch, tenantCompanyId);

    if (!result.ok) {
      const status = result.code === "VALIDATION" ? 400 : result.code === "NOT_FOUND" ? 404 : 500;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { ok: false, code: "DATABASE", message: MSG_DB },
      { status: 500 }
    );
  }
}
