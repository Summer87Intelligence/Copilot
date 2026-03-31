import { NextRequest, NextResponse } from "next/server";

import type { InitiativeRow } from "@/lib/ai/initiative-types";
import { supabase } from "@/lib/supabase-client";

export async function GET(request: NextRequest) {
  try {
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = Math.min(
      200,
      Math.max(1, limitParam ? parseInt(limitParam, 10) || 50 : 50)
    );

    const { data, error } = await supabase
      .from("initiatives")
      .select(
        "id, company_name, source, trigger, score, status, created_at, processing_stage"
      )
      .order("score", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json(
        { error: error.message, initiatives: [] as InitiativeRow[] },
        { status: 500 }
      );
    }

    return NextResponse.json({
      initiatives: (data ?? []) as InitiativeRow[],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json(
      { error: message, initiatives: [] as InitiativeRow[] },
      { status: 500 }
    );
  }
}
