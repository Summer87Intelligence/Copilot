import { NextRequest, NextResponse } from "next/server";

import { requireSuperadmin } from "@/lib/knowledge/zeta-knowledge-guard";
import {
  readZetaKnowledgeIndex,
  readZetaKnowledgeMarkdownByOutputPath,
} from "@/lib/knowledge/zeta-knowledge-store";

export const dynamic = "force-dynamic";

/**
 * GET /api/knowledge/zeta/doc?path=docs/zeta/markdown/....md
 * Devuelve el markdown completo de un documento indexado (solo superadmin).
 */
export async function GET(request: NextRequest) {
  const auth = await requireSuperadmin(request);
  if (!auth.ok) return auth.response;

  const rawPath = request.nextUrl.searchParams.get("path")?.trim();
  if (!rawPath) {
    return NextResponse.json(
      { ok: false as const, message: "Falta query `path`." },
      { status: 400 }
    );
  }

  try {
    const index = await readZetaKnowledgeIndex();
    const allowed = new Set(index.map((r) => r.output_md).filter(Boolean));
    if (!allowed.has(rawPath)) {
      return NextResponse.json(
        { ok: false as const, message: "Documento no indexado o ruta no permitida." },
        { status: 404 }
      );
    }

    const markdown = await readZetaKnowledgeMarkdownByOutputPath(rawPath);
    const meta = index.find((r) => r.output_md === rawPath);
    return NextResponse.json({
      ok: true as const,
      path: rawPath,
      title: meta?.title ?? null,
      url_original: meta?.url_original ?? null,
      url_final: meta?.url_final ?? null,
      markdown,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false as const, message: msg },
      { status: 400 }
    );
  }
}
