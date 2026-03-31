import { NextResponse } from "next/server";

import type { OutcomeRow, OutcomeTypeValue } from "@/lib/ai/outcome-types";
import { OUTCOME_TYPES } from "@/lib/ai/outcome-types";
import { supabase } from "@/lib/supabase-client";

function isOutcomeType(v: string): v is OutcomeTypeValue {
  return (OUTCOME_TYPES as readonly string[]).includes(v);
}

function categoryForOutcomeType(t: OutcomeTypeValue): string {
  switch (t) {
    case "no_response":
      return "negative";
    case "response":
      return "engagement";
    case "meeting":
      return "advancement";
    case "sale":
      return "revenue";
    default:
      return "other";
  }
}

function executionStatusForOutcome(t: OutcomeTypeValue): "executed" | "failed" {
  return t === "no_response" ? "failed" : "executed";
}

function mapOutcomeRow(row: Record<string, unknown>): OutcomeRow {
  const rev = row.revenue_amount;
  return {
    id: String(row.id),
    action_id: String(row.action_id),
    initiative_id: String(row.initiative_id),
    outcome_type: String(row.outcome_type),
    outcome_category: String(row.outcome_category),
    revenue_amount:
      rev === null || rev === undefined
        ? null
        : typeof rev === "number"
          ? rev
          : Number(rev),
    notes: row.notes != null ? String(row.notes) : null,
    created_at: String(row.created_at),
  };
}

type Body = {
  action_id?: string;
  initiative_id?: string;
  outcome_type?: string;
  revenue_amount?: number | null;
  notes?: string | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const actionId = body.action_id?.trim();
    const initiativeId = body.initiative_id?.trim();
    const outcomeTypeRaw = body.outcome_type?.trim();

    if (!actionId || !initiativeId || !outcomeTypeRaw) {
      return NextResponse.json(
        { error: "Faltan action_id, initiative_id u outcome_type." },
        { status: 400 }
      );
    }

    if (!isOutcomeType(outcomeTypeRaw)) {
      return NextResponse.json(
        { error: "outcome_type no válido." },
        { status: 400 }
      );
    }

    const outcomeType = outcomeTypeRaw;

    const { data: existing, error: exErr } = await supabase
      .from("outcomes")
      .select("id")
      .eq("action_id", actionId)
      .maybeSingle();

    if (exErr) {
      return NextResponse.json({ error: exErr.message }, { status: 500 });
    }
    if (existing) {
      return NextResponse.json(
        { error: "Ya existe un resultado para esta acción." },
        { status: 409 }
      );
    }

    const { data: actionRow, error: actErr } = await supabase
      .from("actions")
      .select("id, initiative_id")
      .eq("id", actionId)
      .maybeSingle();

    if (actErr) {
      return NextResponse.json({ error: actErr.message }, { status: 500 });
    }
    if (!actionRow) {
      return NextResponse.json({ error: "Acción no encontrada." }, { status: 404 });
    }
    if (String(actionRow.initiative_id) !== initiativeId) {
      return NextResponse.json(
        { error: "initiative_id no coincide con la acción." },
        { status: 400 }
      );
    }

    let revenue: number | null = null;
    if (body.revenue_amount !== undefined && body.revenue_amount !== null) {
      const n = Number(body.revenue_amount);
      if (Number.isFinite(n)) {
        revenue = n;
      }
    }
    if (outcomeType === "sale" && revenue === null) {
      revenue = 0;
    }

    const notes =
      typeof body.notes === "string" && body.notes.trim() !== ""
        ? body.notes.trim()
        : null;

    const insertPayload = {
      action_id: actionId,
      initiative_id: initiativeId,
      outcome_type: outcomeType,
      outcome_category: categoryForOutcomeType(outcomeType),
      revenue_amount: revenue,
      notes,
    };

    const { data: inserted, error: insErr } = await supabase
      .from("outcomes")
      .insert(insertPayload)
      .select(
        "id, action_id, initiative_id, outcome_type, outcome_category, revenue_amount, notes, created_at"
      )
      .single();

    if (insErr) {
      if (
        insErr.code === "23505" ||
        insErr.message?.toLowerCase().includes("unique")
      ) {
        return NextResponse.json(
          { error: "Ya existe un resultado para esta acción." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    const newStatus = executionStatusForOutcome(outcomeType);
    const insertedId = String((inserted as Record<string, unknown>).id);

    const { error: updErr } = await supabase
      .from("actions")
      .update({ execution_status: newStatus })
      .eq("id", actionId);

    if (updErr) {
      await supabase.from("outcomes").delete().eq("id", insertedId);
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    const outcome = mapOutcomeRow(inserted as Record<string, unknown>);
    return NextResponse.json({ outcome });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
