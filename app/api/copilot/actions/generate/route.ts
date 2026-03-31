import { NextResponse } from "next/server";

import { generateActionsFromDecisions } from "@/lib/ai/actionEngine";
import type { DecisionInputForAction } from "@/lib/ai/actionEngine";
import { supabase } from "@/lib/supabase-client";

const SCAN_LIMIT = 80;
const BATCH_LIMIT = 20;

export async function POST() {
  try {
    const { data: decisions, error: decError } = await supabase
      .from("decisions")
      .select("id, initiative_id, decision_type, suggested_message")
      .order("created_at", { ascending: false })
      .limit(SCAN_LIMIT);

    if (decError) {
      return NextResponse.json(
        { error: decError.message, processed: 0, actionsCreated: 0 },
        { status: 500 }
      );
    }

    const decRows = (decisions ?? []) as DecisionInputForAction[];
    if (decRows.length === 0) {
      return NextResponse.json({ processed: 0, actionsCreated: 0 });
    }

    const decisionIds = decRows.map((d) => d.id);

    const { data: existingActions, error: actErr } = await supabase
      .from("actions")
      .select("decision_id")
      .in("decision_id", decisionIds);

    if (actErr) {
      return NextResponse.json(
        { error: actErr.message, processed: 0, actionsCreated: 0 },
        { status: 500 }
      );
    }

    const hasAction = new Set(
      (existingActions ?? []).map((r) => r.decision_id as string)
    );

    const pending = decRows
      .filter((d) => !hasAction.has(d.id))
      .slice(0, BATCH_LIMIT);

    if (pending.length === 0) {
      return NextResponse.json({ processed: 0, actionsCreated: 0 });
    }

    const toInsert = generateActionsFromDecisions(pending);

    const { data: inserted, error: insertError } = await supabase
      .from("actions")
      .insert(toInsert)
      .select("id");

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message, processed: 0, actionsCreated: 0 },
        { status: 500 }
      );
    }

    const created = inserted?.length ?? 0;

    return NextResponse.json({
      processed: pending.length,
      actionsCreated: created,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json(
      { error: message, processed: 0, actionsCreated: 0 },
      { status: 500 }
    );
  }
}
