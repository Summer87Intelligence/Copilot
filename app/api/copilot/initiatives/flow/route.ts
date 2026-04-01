import { NextRequest, NextResponse } from "next/server";

import type { ActionPayloadJson } from "@/lib/ai/action-types";
import type {
  InitiativeFlowItem,
  InitiativeFlowStatus,
} from "@/lib/ai/initiative-flow-types";
import { supabase } from "@/lib/supabase-client";

function mapStatusLabel(status: InitiativeFlowStatus): string {
  switch (status) {
    case "new":
      return "Nueva";
    case "decision_generated":
      return "Decisión generada";
    case "action_pending":
      return "Acción pendiente";
    case "executed":
      return "Ejecutada";
    case "with_outcome":
      return "Con resultado";
    case "closed_no_response":
      return "Cerrada sin respuesta";
    default:
      return "Nueva";
  }
}

function resolveFlowStatus(item: Omit<InitiativeFlowItem, "flow_status" | "flow_status_label">): InitiativeFlowStatus {
  if (item.outcome) {
    return item.outcome.outcome_type === "no_response"
      ? "closed_no_response"
      : "with_outcome";
  }
  if (item.action) {
    return item.action.execution_status.toLowerCase() === "pending"
      ? "action_pending"
      : "executed";
  }
  if (item.decision) {
    return "decision_generated";
  }
  return "new";
}

export async function GET(request: NextRequest) {
  try {
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = Math.min(
      200,
      Math.max(1, limitParam ? parseInt(limitParam, 10) || 100 : 100)
    );

    const { data: initiativesRaw, error: initiativesError } = await supabase
      .from("initiatives")
      .select(
        "id, company_name, source, trigger, score, status, created_at, processing_stage"
      )
      .order("score", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (initiativesError) {
      return NextResponse.json(
        { error: initiativesError.message, items: [] as InitiativeFlowItem[] },
        { status: 500 }
      );
    }

    const initiatives = initiativesRaw ?? [];
    const initiativeIds = initiatives.map((x) => String(x.id));
    if (initiativeIds.length === 0) {
      return NextResponse.json({ items: [] as InitiativeFlowItem[] });
    }

    const { data: decisionsRaw, error: decisionsError } = await supabase
      .from("decisions")
      .select(
        "id, initiative_id, decision_type, recommended_channel, priority_rank, confidence_score, suggested_message, created_at"
      )
      .in("initiative_id", initiativeIds)
      .order("created_at", { ascending: false });

    if (decisionsError) {
      return NextResponse.json(
        { error: decisionsError.message, items: [] as InitiativeFlowItem[] },
        { status: 500 }
      );
    }

    const { data: actionsRaw, error: actionsError } = await supabase
      .from("actions")
      .select(
        "id, decision_id, initiative_id, action_type, channel, execution_status, action_payload, created_at"
      )
      .in("initiative_id", initiativeIds)
      .order("created_at", { ascending: false });

    if (actionsError) {
      return NextResponse.json(
        { error: actionsError.message, items: [] as InitiativeFlowItem[] },
        { status: 500 }
      );
    }

    const { data: outcomesRaw, error: outcomesError } = await supabase
      .from("outcomes")
      .select(
        "id, action_id, initiative_id, outcome_type, outcome_category, revenue_amount, notes, created_at"
      )
      .in("initiative_id", initiativeIds)
      .order("created_at", { ascending: false });

    if (outcomesError) {
      return NextResponse.json(
        { error: outcomesError.message, items: [] as InitiativeFlowItem[] },
        { status: 500 }
      );
    }

    const latestDecisionByInitiative = new Map<string, (typeof decisionsRaw)[number]>();
    for (const d of decisionsRaw ?? []) {
      const key = String(d.initiative_id);
      if (!latestDecisionByInitiative.has(key)) {
        latestDecisionByInitiative.set(key, d);
      }
    }

    const latestActionByInitiative = new Map<string, (typeof actionsRaw)[number]>();
    for (const a of actionsRaw ?? []) {
      const key = String(a.initiative_id);
      if (!latestActionByInitiative.has(key)) {
        latestActionByInitiative.set(key, a);
      }
    }

    const latestOutcomeByAction = new Map<string, (typeof outcomesRaw)[number]>();
    const latestOutcomeByInitiative = new Map<string, (typeof outcomesRaw)[number]>();
    for (const o of outcomesRaw ?? []) {
      const actionId = String(o.action_id);
      const initiativeId = String(o.initiative_id);
      if (!latestOutcomeByAction.has(actionId)) {
        latestOutcomeByAction.set(actionId, o);
      }
      if (!latestOutcomeByInitiative.has(initiativeId)) {
        latestOutcomeByInitiative.set(initiativeId, o);
      }
    }

    const items: InitiativeFlowItem[] = initiatives.map((i) => {
      const initiativeId = String(i.id);
      const decision = latestDecisionByInitiative.get(initiativeId) ?? null;
      const action = latestActionByInitiative.get(initiativeId) ?? null;
      const outcome = action
        ? latestOutcomeByAction.get(String(action.id)) ?? null
        : latestOutcomeByInitiative.get(initiativeId) ?? null;

      const base = {
        initiative: {
          id: initiativeId,
          company_name: String(i.company_name ?? ""),
          source: String(i.source ?? ""),
          trigger: String(i.trigger ?? ""),
          score: Number(i.score ?? 0),
          status: String(i.status ?? ""),
          created_at: String(i.created_at),
          processing_stage:
            i.processing_stage == null ? null : String(i.processing_stage),
        },
        decision: decision
          ? {
              id: String(decision.id),
              decision_type: String(decision.decision_type),
              recommended_channel: String(decision.recommended_channel),
              priority_rank: Number(decision.priority_rank ?? 0),
              confidence_score: Number(decision.confidence_score ?? 0),
              suggested_message: String(decision.suggested_message ?? ""),
              created_at: String(decision.created_at),
            }
          : null,
        action: action
          ? {
              id: String(action.id),
              decision_id: String(action.decision_id),
              action_type: String(action.action_type),
              channel: String(action.channel),
              execution_status: String(action.execution_status),
              action_payload: (action.action_payload ?? {
                suggested_message: "",
              }) as ActionPayloadJson,
              created_at: String(action.created_at),
            }
          : null,
        outcome: outcome
          ? {
              id: String(outcome.id),
              action_id: String(outcome.action_id),
              outcome_type: String(outcome.outcome_type),
              outcome_category: String(outcome.outcome_category),
              revenue_amount:
                outcome.revenue_amount == null
                  ? null
                  : Number(outcome.revenue_amount),
              notes: outcome.notes == null ? null : String(outcome.notes),
              created_at: String(outcome.created_at),
            }
          : null,
      };

      const flowStatus = resolveFlowStatus(base);
      return {
        ...base,
        flow_status: flowStatus,
        flow_status_label: mapStatusLabel(flowStatus),
      };
    });

    return NextResponse.json({ items });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json(
      { error: message, items: [] as InitiativeFlowItem[] },
      { status: 500 }
    );
  }
}
