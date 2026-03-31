import { NextRequest, NextResponse } from "next/server";

import type { ActionListItem, ActionPayloadJson } from "@/lib/ai/action-types";
import { supabase } from "@/lib/supabase-client";

function mapRow(
  row: Record<string, unknown>,
  companyByInitiative: Map<string, string | null>
): ActionListItem {
  const initiativeId = String(row.initiative_id);
  return {
    id: String(row.id),
    decision_id: String(row.decision_id),
    initiative_id: initiativeId,
    action_type: String(row.action_type),
    channel: String(row.channel),
    execution_status: String(row.execution_status),
    action_payload: (row.action_payload ?? {
      suggested_message: "",
    }) as ActionPayloadJson,
    created_at: String(row.created_at),
    company_name: companyByInitiative.get(initiativeId) ?? null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = Math.min(
      200,
      Math.max(1, limitParam ? parseInt(limitParam, 10) || 80 : 80)
    );

    const { data: rows, error } = await supabase
      .from("actions")
      .select(
        "id, decision_id, initiative_id, action_type, channel, execution_status, action_payload, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json(
        { error: error.message, actions: [] as ActionListItem[] },
        { status: 500 }
      );
    }

    const list = rows ?? [];
    const initiativeIds = [
      ...new Set(list.map((r) => String(r.initiative_id))),
    ];

    const companyByInitiative = new Map<string, string | null>();
    if (initiativeIds.length > 0) {
      const { data: inits, error: initErr } = await supabase
        .from("initiatives")
        .select("id, company_name")
        .in("id", initiativeIds);

      if (!initErr && inits) {
        for (const i of inits) {
          companyByInitiative.set(
            String(i.id),
            i.company_name != null ? String(i.company_name) : null
          );
        }
      }
    }

    const actions: ActionListItem[] = list.map((r) =>
      mapRow(r as Record<string, unknown>, companyByInitiative)
    );

    return NextResponse.json({ actions });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json(
      { error: message, actions: [] as ActionListItem[] },
      { status: 500 }
    );
  }
}
