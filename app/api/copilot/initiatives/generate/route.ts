import { NextResponse } from "next/server";

import type { InitiativeRow } from "@/lib/ai/initiative-types";
import { fetchExistingDedupeKeysForLocalDate } from "@/lib/ai/initiative-generate-db";
import {
  initiativeDedupeKey,
  normalizeInitiativeDedupeFields,
  startEndOfMontevideoDay,
} from "@/lib/ai/initiative-dedupe";
import { isPgUniqueViolation } from "@/lib/ai/initiative-insert";
import { generateMockOpportunities } from "@/lib/ai/opportunityEngine";
import { supabase } from "@/lib/supabase-client";

const INSERT_SELECT =
  "id, company_name, source, trigger, score, status, created_at, processing_stage, dedupe_local_date";

/**
 * POST /api/copilot/initiatives/generate
 *
 * A) Generar lote candidato (mock).
 * B) Claves ya existentes hoy (`dedupe_local_date` = día Montevideo actual).
 * C) Insertar solo candidatas no vistas en B (ni duplicadas en el lote), con `dedupe_local_date`.
 * D) Insert fila a fila: violación única (23505) = carrera u omisión → cuenta como omitida, sin fallar el endpoint.
 */
export async function POST() {
  try {
    const generated = generateMockOpportunities();
    const { ymd } = startEndOfMontevideoDay();

    let existingKeys: Set<string>;
    try {
      existingKeys = await fetchExistingDedupeKeysForLocalDate(supabase, ymd);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Error al consultar existentes";
      return NextResponse.json(
        { error: msg, inserted: 0, omitted: 0, rows: [] },
        { status: 500 }
      );
    }

    const pending: {
      company_name: string;
      source: string;
      trigger: string;
      score: number;
      status: string;
      processing_stage: string;
      dedupe_local_date: string;
    }[] = [];

    let omitted = 0;
    const seenInBatch = new Set<string>();

    for (const o of generated) {
      const normalized = normalizeInitiativeDedupeFields({
        company_name: o.company_name,
        source: o.source,
        trigger: o.trigger,
      });
      const k = initiativeDedupeKey(normalized);

      if (seenInBatch.has(k)) {
        omitted += 1;
        continue;
      }
      seenInBatch.add(k);

      if (existingKeys.has(k)) {
        omitted += 1;
        continue;
      }

      pending.push({
        company_name: normalized.company_name,
        source: normalized.source,
        trigger: normalized.trigger,
        score: o.score,
        status: o.status,
        processing_stage: "new",
        dedupe_local_date: ymd,
      });
    }

    if (pending.length === 0) {
      return NextResponse.json({
        inserted: 0,
        omitted,
        rows: [] as InitiativeRow[],
        dedupe_date: ymd,
        timezone: "America/Montevideo",
      });
    }

    const insertedRows: InitiativeRow[] = [];

    for (const row of pending) {
      const { data, error } = await supabase
        .from("initiatives")
        .insert(row)
        .select(INSERT_SELECT)
        .maybeSingle();

      if (error) {
        if (isPgUniqueViolation(error)) {
          omitted += 1;
          continue;
        }
        return NextResponse.json(
          { error: error.message, inserted: 0, omitted: 0, rows: [] },
          { status: 500 }
        );
      }

      if (data) {
        insertedRows.push(data as InitiativeRow);
      }
    }

    return NextResponse.json({
      inserted: insertedRows.length,
      omitted,
      rows: insertedRows,
      dedupe_date: ymd,
      timezone: "America/Montevideo",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json(
      { error: message, inserted: 0, omitted: 0, rows: [] },
      { status: 500 }
    );
  }
}
