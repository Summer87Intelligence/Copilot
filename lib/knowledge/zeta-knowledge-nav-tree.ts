/**
 * Árbol de navegación Zeta (solo cliente / datos del índice).
 * Agrupa por `ayuda_branch` y subniveles desde el pathname `/ayuda/<rama>/...`.
 */

export type ZetaNavIndexRow = {
  output_md: string;
  title: string;
  url_original: string | null;
  url_final: string | null;
  error?: string | null;
  ayuda_branch?: string | null;
};

export type ZetaNavDoc = {
  output_md: string;
  title: string;
  url_original: string | null;
  url_final: string | null;
  branch: string | "__other__";
};

export type ZetaNavTreeNode = {
  key: string;
  slug: string;
  label: string;
  children: ZetaNavTreeNode[];
  docs: ZetaNavDoc[];
};

/** Etiqueta legible para slug de rama o segmento de URL. */
export function formatZetaNavSegmentLabel(slug: string): string {
  const s = slug.trim().toLowerCase();
  if (!s) return "—";
  if (s === "apis") return "APIs";
  return s
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function normalizeZetaBranch(row: ZetaNavIndexRow): string | "__other__" {
  const fromField = row.ayuda_branch?.trim().toLowerCase() ?? "";
  if (fromField) return fromField;
  const u = row.url_final || row.url_original;
  if (u) {
    try {
      const parts = new URL(u).pathname.replace(/\/+$/, "").split("/").filter(Boolean);
      if (parts[0] === "ayuda" && parts[1]) return parts[1].toLowerCase();
    } catch {
      /* ignore */
    }
  }
  return "__other__";
}

/** Segmentos de ruta bajo `/ayuda/<rama>/` (vacío = documento en raíz de la rama). */
export function pathSegmentsUnderBranch(
  url: string | null | undefined,
  branch: string | "__other__"
): string[] {
  if (!url || branch === "__other__") return [];
  try {
    const parts = new URL(url).pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    if (parts[0] !== "ayuda" || !parts[1]) return [];
    if (parts[1].toLowerCase() !== branch.toLowerCase()) {
      const idx = parts.findIndex((seg, i) => i > 0 && seg.toLowerCase() === branch.toLowerCase());
      if (idx === -1) return parts.slice(2).map((s) => s.toLowerCase());
      return parts.slice(idx + 1).map((s) => s.toLowerCase());
    }
    return parts.slice(2).map((s) => s.toLowerCase());
  } catch {
    return [];
  }
}

function insertDocAtPath(
  root: ZetaNavTreeNode,
  branch: string | "__other__",
  segments: string[],
  doc: ZetaNavDoc
) {
  let node = root;
  const prefix = `b:${branch}`;

  for (let i = 0; i < segments.length; i++) {
    const slug = segments[i]!;
    const key = `${prefix}|${segments.slice(0, i + 1).join("|")}`;
    let child = node.children.find((c) => c.slug === slug);
    if (!child) {
      child = {
        key,
        slug,
        label: formatZetaNavSegmentLabel(slug),
        children: [],
        docs: [],
      };
      node.children.push(child);
    }
    node = child;
  }
  if (!node.docs.some((d) => d.output_md === doc.output_md)) {
    node.docs.push(doc);
  }
}

function sortTree(node: ZetaNavTreeNode) {
  node.children.sort((a, b) => a.label.localeCompare(b.label, "es"));
  node.docs.sort((a, b) => a.title.localeCompare(b.title, "es"));
  for (const c of node.children) sortTree(c);
}

/**
 * Raíz por rama: `key` = `b:<slug>`, `slug` = rama u `__other__`.
 * `root` agrupa subcarpetas y docs en la raíz de esa rama.
 */
export function buildZetaNavTree(rows: ZetaNavIndexRow[]): ZetaNavTreeNode[] {
  const valid = rows.filter((r) => Boolean(r.output_md) && !r.error);
  const byBranch = new Map<string | "__other__", ZetaNavTreeNode>();

  for (const r of valid) {
    const branch = normalizeZetaBranch(r);
    const key = `b:${branch}`;
    let root = byBranch.get(branch);
    if (!root) {
      root = {
        key,
        slug: branch,
        label: branch === "__other__" ? "Otros" : formatZetaNavSegmentLabel(branch),
        children: [],
        docs: [],
      };
      byBranch.set(branch, root);
    }

    const doc: ZetaNavDoc = {
      output_md: r.output_md,
      title: r.title,
      url_original: r.url_original,
      url_final: r.url_final,
      branch,
    };

    if (branch === "__other__") {
      if (!root.docs.some((d) => d.output_md === doc.output_md)) root.docs.push(doc);
      continue;
    }

    const segs = pathSegmentsUnderBranch(r.url_final || r.url_original, branch);
    if (segs.length === 0) {
      if (!root.docs.some((d) => d.output_md === doc.output_md)) root.docs.push(doc);
    } else {
      insertDocAtPath(root, branch, segs, doc);
    }
  }

  const roots = [...byBranch.values()];
  for (const root of roots) sortTree(root);
  roots.sort((a, b) => {
    if (a.slug === "__other__") return 1;
    if (b.slug === "__other__") return -1;
    return a.label.localeCompare(b.label, "es");
  });
  return roots;
}

export function filterNavTreeByBranch(
  branches: ZetaNavTreeNode[],
  branchFilter: "" | "__other__" | string
): ZetaNavTreeNode[] {
  if (!branchFilter) return branches;
  const bf = branchFilter.toLowerCase();
  return branches.filter((b) => b.slug.toLowerCase() === bf);
}

function countDocsInNode(node: ZetaNavTreeNode): number {
  let n = node.docs.length;
  for (const c of node.children) n += countDocsInNode(c);
  return n;
}

export function branchDocCount(node: ZetaNavTreeNode): number {
  return countDocsInNode(node);
}

type FindResult = {
  /** Etiquetas: rama + subcarpetas (sin título del documento). */
  trailLabels: string[];
  /** Keys de nodos en la ruta al documento (para expandir sidebar). */
  expandKeys: string[];
};

function findInNode(
  node: ZetaNavTreeNode,
  outputMd: string,
  folderLabels: string[],
  ancestorKeys: string[]
): FindResult | null {
  const keysHere = [...ancestorKeys, node.key];

  for (const d of node.docs) {
    if (d.output_md === outputMd) {
      return { trailLabels: folderLabels, expandKeys: keysHere };
    }
  }

  for (const child of node.children) {
    const hit = findInNode(child, outputMd, [...folderLabels, child.label], keysHere);
    if (hit) return hit;
  }

  return null;
}

/** Busca documento en el bosque de ramas (cada raíz = una `ayuda_branch`). */
export function findDocNavContext(
  branches: ZetaNavTreeNode[],
  outputMd: string
): FindResult | null {
  for (const root of branches) {
    const hit = findInNode(root, outputMd, [root.label], []);
    if (hit) return hit;
  }
  return null;
}

export function sortKeyForZetaRow(r: ZetaNavIndexRow): string {
  const u = r.url_final || r.url_original || "";
  return `${u}\u0000${r.title}`;
}

/** Orden estable dentro de la misma rama que el documento activo (URL + título). */
export function orderDocsInSameBranchAs(
  rows: ZetaNavIndexRow[],
  activeOutputMd: string | null
): ZetaNavIndexRow[] {
  if (!activeOutputMd) return [];
  const active = rows.find((r) => r.output_md === activeOutputMd && !r.error);
  if (!active) return [];
  const b = normalizeZetaBranch(active);
  const subset = rows.filter((r) => Boolean(r.output_md) && !r.error && normalizeZetaBranch(r) === b);
  return subset.slice().sort((a, c) => sortKeyForZetaRow(a).localeCompare(sortKeyForZetaRow(c), "es"));
}

export function prevNextInOrdered(
  ordered: ZetaNavIndexRow[],
  activeOutputMd: string | null
): { prev: string | null; next: string | null } {
  const idx = ordered.findIndex((r) => r.output_md === activeOutputMd);
  if (idx < 0) return { prev: null, next: null };
  return {
    prev: idx > 0 ? ordered[idx - 1]!.output_md : null,
    next: idx < ordered.length - 1 ? ordered[idx + 1]!.output_md : null,
  };
}
