import type { ZetaKnowledgeIndexRow } from "@/lib/knowledge/zeta-knowledge-store";
import { readZetaKnowledgeMarkdownByOutputPath } from "@/lib/knowledge/zeta-knowledge-store";

export { ayudaFolderKey } from "@/lib/knowledge/zeta-knowledge-folder-key";

export type ZetaDocBody = {
  row: ZetaKnowledgeIndexRow;
  body: string;
};

type CacheEntry = { at: number; docs: ZetaDocBody[] };

const CACHE_TTL_MS = 60_000;
let cache: CacheEntry | null = null;

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

export async function loadAllZetaMarkdownBodies(
  rows: ZetaKnowledgeIndexRow[]
): Promise<ZetaDocBody[]> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return cache.docs;
  }

  const docs: ZetaDocBody[] = [];
  for (const row of rows) {
    if (!row.output_md || row.error) continue;
    try {
      const body = await readZetaKnowledgeMarkdownByOutputPath(row.output_md);
      docs.push({ row, body });
    } catch {
      // omitir archivos rotos
    }
  }
  cache = { at: now, docs };
  return docs;
}

export type ZetaSearchHit = {
  row: ZetaKnowledgeIndexRow;
  score: number;
  snippet: string;
};

export function searchZetaKnowledge(
  docs: ZetaDocBody[],
  query: string,
  mode: "title" | "content" | "all"
): ZetaSearchHit[] {
  const terms = tokenize(query);
  if (!terms.length) return [];

  const hits: ZetaSearchHit[] = [];

  for (const { row, body } of docs) {
    const title = (row.title || "").toLowerCase();
    const hay = body.toLowerCase();
    let score = 0;

    if (mode === "title" || mode === "all") {
      for (const t of terms) {
        if (title.includes(t)) score += 12;
      }
    }
    if (mode === "content" || mode === "all") {
      for (const t of terms) {
        const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
        const m = hay.match(re);
        if (m) score += Math.min(6, m.length);
      }
    }

    if (score <= 0) continue;

    const snippet = extractSnippet(body, terms);
    hits.push({ row, score, snippet });
  }

  hits.sort((a, b) => b.score - a.score || a.row.title.localeCompare(b.row.title));
  return hits;
}

function extractSnippet(body: string, terms: string[]): string {
  const lower = body.toLowerCase();
  let bestStart = 0;
  let bestScore = -1;

  for (let i = 0; i < lower.length; i += 80) {
    const slice = lower.slice(i, i + 420);
    let s = 0;
    for (const t of terms) {
      if (slice.includes(t)) s += 1;
    }
    if (s > bestScore) {
      bestScore = s;
      bestStart = i;
    }
  }

  const chunk = body.slice(bestStart, bestStart + 420).replace(/\s+/g, " ").trim();
  return chunk.length > 360 ? `${chunk.slice(0, 357)}…` : chunk;
}

export type ZetaAskResult = {
  answer: string;
  sources: { title: string; url_final: string | null; output_md: string; snippet: string }[];
};

export async function askZetaKnowledgeLocal(
  rows: ZetaKnowledgeIndexRow[],
  question: string
): Promise<ZetaAskResult> {
  const q = question.trim();
  if (!q) {
    return {
      answer: "Escribí una pregunta para buscar en la biblioteca Zeta.",
      sources: [],
    };
  }

  const docs = await loadAllZetaMarkdownBodies(rows);
  const hits = searchZetaKnowledge(docs, q, "all").slice(0, 6);

  if (!hits.length) {
    return {
      answer:
        "No encontré fragmentos relevantes en la biblioteca local de Zeta para esa consulta. Probá con otros términos o navegá los documentos en el panel izquierdo.",
      sources: [],
    };
  }

  const sources = hits.map((h) => ({
    title: h.row.title,
    url_final: h.row.url_final,
    output_md: h.row.output_md,
    snippet: h.snippet,
  }));

  const lines = hits.map((h, i) => {
    const url = h.row.url_final || h.row.url_original || "";
    const head = url ? `**${i + 1}. ${h.row.title}** (${url})` : `**${i + 1}. ${h.row.title}**`;
    return `${head}\n\n> ${h.snippet.replace(/\n+/g, " ")}\n`;
  });

  const answer =
    `Respuesta generada **solo** a partir de fragmentos de la biblioteca interna (markdown local). No usa modelos externos ni otras fuentes.\n\n` +
    lines.join("\n---\n\n");

  return { answer, sources };
}
