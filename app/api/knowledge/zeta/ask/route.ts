import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { requireSuperadmin } from "@/lib/knowledge/zeta-knowledge-guard";
import { askZetaKnowledgeLocal } from "@/lib/knowledge/zeta-knowledge-search";
import { readZetaKnowledgeIndex } from "@/lib/knowledge/zeta-knowledge-store";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    question: z.string().trim().min(1).max(2000),
  })
  .strict();

/**
 * POST /api/knowledge/zeta/ask
 * Respuesta local por recuperación textual (sin LLM ni servicios externos).
 */
export async function POST(request: NextRequest) {
  const auth = await requireSuperadmin(request);
  if (!auth.ok) return auth.response;

  const pv = await parseAndValidateJsonBody(request, bodySchema);
  if (!pv.ok) return pv.response;

  try {
    const rows = await readZetaKnowledgeIndex();
    const { answer, sources } = await askZetaKnowledgeLocal(rows, pv.data.question);
    return NextResponse.json({
      ok: true as const,
      answer,
      sources,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false as const, message: msg },
      { status: 500 }
    );
  }
}
