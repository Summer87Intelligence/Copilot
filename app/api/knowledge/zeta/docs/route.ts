import { NextRequest, NextResponse } from "next/server";

import { requireSuperadmin } from "@/lib/knowledge/zeta-knowledge-guard";
import { ayudaFolderKey } from "@/lib/knowledge/zeta-knowledge-folder-key";
import { readZetaKnowledgeIndex } from "@/lib/knowledge/zeta-knowledge-store";

export const dynamic = "force-dynamic";

/**
 * GET /api/knowledge/zeta/docs
 * Lista metadatos desde `docs/zeta/markdown/index.json` (solo superadmin).
 */
export async function GET(request: NextRequest) {
  const auth = await requireSuperadmin(request);
  if (!auth.ok) return auth.response;

  try {
    const items = await readZetaKnowledgeIndex();
    const folderSet = new Set<string>();
    for (const row of items) {
      const k = ayudaFolderKey(row.url_final || row.url_original);
      if (k) folderSet.add(k);
    }
    const folders = [...folderSet].sort((a, b) => a.localeCompare(b, "es"));
    return NextResponse.json({
      ok: true as const,
      count: items.length,
      folders,
      items,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false as const, message: `No se pudo leer la biblioteca: ${msg}` },
      { status: 500 }
    );
  }
}
