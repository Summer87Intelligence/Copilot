import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "node:url";

/**
 * Raíz del repo anclada a este módulo (lib/knowledge → ../..).
 * Evita `process.cwd()` en rutas API: Turbopack NFT deja de trazar el proyecto entero.
 */
const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);
const MARKDOWN_ROOT = path.join(PROJECT_ROOT, "docs", "zeta", "markdown");
const INDEX_PATH = path.join(MARKDOWN_ROOT, "index.json");
const MARKDOWN_REL_PREFIX = "docs/zeta/markdown/";

export type ZetaKnowledgeIndexRow = {
  source_html: string;
  output_md: string;
  url_original: string | null;
  url_final: string | null;
  title: string;
  processed_at?: string;
  error?: string | null;
  /** Primer segmento bajo `/ayuda/` (`apis`, `configuracion`, …). Opcional; lo escribe `zeta:md`. */
  ayuda_branch?: string | null;
};

function assertUnderMarkdownRoot(absPath: string): void {
  const root = path.normalize(MARKDOWN_ROOT + path.sep);
  const norm = path.normalize(absPath);
  if (!norm.startsWith(root)) {
    throw new Error("Ruta fuera de docs/zeta/markdown");
  }
}

export async function readZetaKnowledgeIndex(): Promise<ZetaKnowledgeIndexRow[]> {
  const raw = await fs.readFile(INDEX_PATH, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(Boolean) as ZetaKnowledgeIndexRow[];
}

export async function readZetaKnowledgeMarkdownByOutputPath(
  outputMdRelative: string
): Promise<string> {
  const rel = outputMdRelative.replace(/^\//, "");
  if (!rel.startsWith(MARKDOWN_REL_PREFIX)) {
    throw new Error("Ruta de markdown inválida");
  }
  const abs = path.resolve(PROJECT_ROOT, rel);
  assertUnderMarkdownRoot(abs);
  return fs.readFile(abs, "utf8");
}

export function zetaKnowledgeMarkdownRoot(): string {
  return MARKDOWN_ROOT;
}
