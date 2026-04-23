/**
 * Serialización de estado de Biblioteca Zeta en query string (solo cliente).
 * Params: branch, doc, q, mode — orden canónico fijo para comparar sin loops.
 */

export type ZetaKnowledgeSearchMode = "title" | "content" | "all";

/** Filtro de rama: vacío = todo; slug; `__other__` = sin `ayuda_branch`. */
export type ZetaKnowledgeBranchFilter = "" | "__other__" | string;

type IndexLike = {
  output_md?: string;
  error?: string | null;
  ayuda_branch?: string | null;
};

export function parseZetaKnowledgeMode(raw: string | null): ZetaKnowledgeSearchMode {
  if (raw === "title" || raw === "content" || raw === "all") return raw;
  return "all";
}

/** Lee params conocidos desde la URL (sin validar contra índice). */
export function parseZetaKnowledgeUrlParams(sp: URLSearchParams): {
  branchRaw: string;
  doc: string | null;
  q: string;
  mode: ZetaKnowledgeSearchMode;
} {
  const branchRaw = (sp.get("branch") ?? "").trim().toLowerCase();
  const docRaw = sp.get("doc");
  const doc = docRaw != null && docRaw.trim() !== "" ? docRaw.trim() : null;
  const q = (sp.get("q") ?? "").trim();
  const mode = parseZetaKnowledgeMode(sp.get("mode"));
  return { branchRaw, doc, q, mode };
}

/** Coacciona rama con índice cargado; con índice vacío acepta slugs seguros o confía `__other__`. */
export function coerceZetaBranchFilter(
  branchRaw: string,
  rows: IndexLike[]
): ZetaKnowledgeBranchFilter {
  const b = branchRaw.trim().toLowerCase();
  if (!b) return "";
  if (!rows.length) {
    if (b === "__other__") return "__other__";
    if (/^[a-z0-9_-]+$/.test(b)) return b;
    return "";
  }
  if (b === "__other__") {
    const has = rows.some((r) => Boolean(r.output_md) && !r.error && !r.ayuda_branch?.trim());
    return has ? "__other__" : "";
  }
  const valid = new Set(
    rows
      .filter((r) => Boolean(r.output_md) && !r.error && r.ayuda_branch?.trim())
      .map((r) => r.ayuda_branch!.trim().toLowerCase())
  );
  return valid.has(b) ? b : "";
}

/** Solo params que persistimos; omite vacíos y `mode` por defecto. */
export function pickZetaKnowledgeUrlParams(sp: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  const { branchRaw, doc, q, mode } = parseZetaKnowledgeUrlParams(sp);
  if (branchRaw) out.set("branch", branchRaw);
  if (doc) out.set("doc", doc);
  if (q) out.set("q", q);
  if (mode !== "all") out.set("mode", mode);
  return out;
}

/** Construye query canónica desde estado de UI (usa `q` ya debounced). */
export function buildZetaKnowledgeUrlQuery(state: {
  branch: ZetaKnowledgeBranchFilter;
  doc: string | null;
  q: string;
  mode: ZetaKnowledgeSearchMode;
}): string {
  const out = new URLSearchParams();
  const br = typeof state.branch === "string" ? state.branch.trim().toLowerCase() : "";
  if (br) out.set("branch", br);
  if (state.doc?.trim()) out.set("doc", state.doc.trim());
  const qt = state.q.trim();
  if (qt) out.set("q", qt);
  if (state.mode !== "all") out.set("mode", state.mode);
  return out.toString();
}

/** Comparación estable entre URL actual y string generado. */
export function zetaKnowledgeUrlQueryEquals(sp: URLSearchParams, builtQueryString: string): boolean {
  const a = pickZetaKnowledgeUrlParams(sp).toString();
  const b = pickZetaKnowledgeUrlParams(new URLSearchParams(builtQueryString)).toString();
  return a === b;
}
