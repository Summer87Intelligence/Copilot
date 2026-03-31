import { NextResponse } from "next/server";

import type { InitiativeRow } from "@/lib/ai/initiative-types";
import { generateMockOpportunities } from "@/lib/ai/opportunityEngine";
import { supabase } from "@/lib/supabase-client";

function startEndOfUtcDay(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0)
  );
  return { start: start.toISOString(), end: end.toISOString() };
}

function keyOf(row: {
  company_name: string;
  source: string;
  trigger: string;
}): string {
  return `${row.company_name}\u0001${row.source}\u0001${row.trigger}`;
}

export async function POST() {
  try {
    const generated = generateMockOpportunities();
    const { start, end } = startEndOfUtcDay();

    const { data: existingRows, error: fetchError } = await supabase
      .from("initiatives")
      .select("company_name, source, trigger")
      .gte("created_at", start)
      .lt("created_at", end);

    if (fetchError) {
      return NextResponse.json(
        { error: fetchError.message, inserted: 0, omitted: 0, rows: [] },
        { status: 500 }
      );
    }

    const seen = new Set<string>();
    for (const r of existingRows ?? []) {
      seen.add(keyOf(r));
    }

    const toInsert: {
      company_name: string;
      source: string;
      trigger: string;
      score: number;
      status: string;
      processing_stage: string;
    }[] = [];

    let omitted = 0;
    for (const o of generated) {
      const k = keyOf(o);
      if (seen.has(k)) {
        omitted += 1;
        continue;
      }
      seen.add(k);
      toInsert.push({
        company_name: o.company_name,
        source: o.source,
        trigger: o.trigger,
        score: o.score,
        status: o.status,
        processing_stage: "new",
      });
    }

    if (toInsert.length === 0) {
      return NextResponse.json({
        inserted: 0,
        omitted,
        rows: [] as InitiativeRow[],
      });
    }

    const { data: inserted, error: insertError } = await supabase
      .from("initiatives")
      .insert(toInsert)
      .select(
        "id, company_name, source, trigger, score, status, created_at, processing_stage"
      );

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message, inserted: 0, omitted: 0, rows: [] },
        { status: 500 }
      );
    }

    return NextResponse.json({
      inserted: inserted?.length ?? 0,
      omitted,
      rows: (inserted ?? []) as InitiativeRow[],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json(
      { error: message, inserted: 0, omitted: 0, rows: [] },
      { status: 500 }
    );
  }
}
