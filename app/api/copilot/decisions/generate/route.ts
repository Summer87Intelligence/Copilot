import { NextResponse } from "next/server";

import {
  generateDecisionsForInitiatives,
  type InitiativeForDecision,
} from "@/lib/ai/decisionEngine";
import { supabase } from "@/lib/supabase-client";

const BATCH_LIMIT = 20;

export async function POST() {
  try {
    const { data: candidates, error: fetchError } = await supabase
      .from("initiatives")
      .select("id, company_name, trigger, score")
      .eq("processing_stage", "new")
      .order("score", { ascending: false })
      .limit(BATCH_LIMIT);

    if (fetchError) {
      return NextResponse.json(
        { error: fetchError.message, processed: 0, decisionsCreated: 0 },
        { status: 500 }
      );
    }

    const rows = (candidates ?? []) as InitiativeForDecision[];
    if (rows.length === 0) {
      return NextResponse.json({
        processed: 0,
        decisionsCreated: 0,
      });
    }

    const ids = rows.map((r) => r.id);

    const { data: existingDecisions, error: decErr } = await supabase
      .from("decisions")
      .select("initiative_id")
      .in("initiative_id", ids);

    if (decErr) {
      return NextResponse.json(
        { error: decErr.message, processed: 0, decisionsCreated: 0 },
        { status: 500 }
      );
    }

    const hasDecision = new Set(
      (existingDecisions ?? []).map((d) => d.initiative_id as string)
    );

    const eligible = rows.filter((r) => !hasDecision.has(r.id));
    if (eligible.length === 0) {
      return NextResponse.json({
        processed: 0,
        decisionsCreated: 0,
      });
    }

    const payloads = generateDecisionsForInitiatives(eligible);

    const insertRows = payloads.map((p) => ({
      initiative_id: p.initiative_id,
      decision_type: p.decision_type,
      recommended_channel: p.recommended_channel,
      priority_rank: p.priority_rank,
      confidence_score: p.confidence_score,
      suggested_message: p.suggested_message,
    }));

    const { data: inserted, error: insertError } = await supabase
      .from("decisions")
      .insert(insertRows)
      .select("id, initiative_id");

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message, processed: 0, decisionsCreated: 0 },
        { status: 500 }
      );
    }

    const created = inserted?.length ?? 0;
    const processedIds = eligible.map((e) => e.id);

    const { error: updateError } = await supabase
      .from("initiatives")
      .update({ processing_stage: "decision_made" })
      .in("id", processedIds);

    if (updateError) {
      return NextResponse.json(
        {
          error: updateError.message,
          processed: 0,
          decisionsCreated: created,
          warning:
            "Decisiones insertadas pero no se pudo actualizar processing_stage.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      processed: processedIds.length,
      decisionsCreated: created,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json(
      { error: message, processed: 0, decisionsCreated: 0 },
      { status: 500 }
    );
  }
}
