import { NextRequest, NextResponse } from "next/server";

import { requireSuperadmin } from "@/lib/knowledge/zeta-knowledge-guard";
import {
  ayudaFolderKey,
  loadAllZetaMarkdownBodies,
  searchZetaKnowledge,
} from "@/lib/knowledge/zeta-knowledge-search";
import { readZetaKnowledgeIndex } from "@/lib/knowledge/zeta-knowledge-store";

export const dynamic = "force-dynamic";

/**
 * GET /api/knowledge/zeta/search?q=...&mode=title|content|all&folder=opcional
 */
export async function GET(request: NextRequest) {
  const auth = await requireSuperadmin(request);
  if (!auth.ok) return auth.response;

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const modeRaw = request.nextUrl.searchParams.get("mode")?.trim().toLowerCase() ?? "all";
  const folder = request.nextUrl.searchParams.get("folder")?.trim().toLowerCase() ?? "";

  const mode =
    modeRaw === "title" || modeRaw === "content" || modeRaw === "all" ? modeRaw : "all";

  try {
    const rows = await readZetaKnowledgeIndex();
    const docs = await loadAllZetaMarkdownBodies(rows);
    let filteredDocs = docs;
    if (folder) {
      filteredDocs = docs.filter((d) => {
        const k = ayudaFolderKey(d.row.url_final || d.row.url_original)?.toLowerCase() ?? "";
        return k === folder;
      });
    }

    if (!q) {
      return NextResponse.json({
        ok: true as const,
        query: q,
        mode,
        folder: folder || null,
        hits: [],
      });
    }

    const hits = searchZetaKnowledge(filteredDocs, q, mode as "title" | "content" | "all").slice(
      0,
      80
    );

    return NextResponse.json({
      ok: true as const,
      query: q,
      mode,
      folder: folder || null,
      hits: hits.map((h) => ({
        title: h.row.title,
        output_md: h.row.output_md,
        url_original: h.row.url_original,
        url_final: h.row.url_final,
        score: h.score,
        snippet: h.snippet,
        folder: ayudaFolderKey(h.row.url_final || h.row.url_original),
        ayuda_branch:
          (h.row as { ayuda_branch?: string | null }).ayuda_branch?.trim().toLowerCase() ||
          ayudaFolderKey(h.row.url_final || h.row.url_original)?.toLowerCase() ||
          null,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false as const, message: msg },
      { status: 500 }
    );
  }
}
