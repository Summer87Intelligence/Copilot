import { NextRequest, NextResponse } from "next/server";

import type { DecisionRow } from "@/lib/ai/decision-types";
import { supabase } from "@/lib/supabase-client";

export async function GET(request: NextRequest) {
  try {
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = Math.min(
      500,
      Math.max(1, limitParam ? parseInt(limitParam, 10) || 100 : 200)
    );

    const { data, error } = await supabase
      .from("decisions")
      .select(
        "id, initiative_id, decision_type, recommended_channel, priority_rank, confidence_score, suggested_message, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json(
        { error: error.message, decisions: [] as DecisionRow[] },
        { status: 500 }
      );
    }

    return NextResponse.json({
      decisions: (data ?? []) as DecisionRow[],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json(
      { error: message, decisions: [] as DecisionRow[] },
      { status: 500 }
    );
  }
}
