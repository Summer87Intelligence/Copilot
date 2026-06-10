import { describe, expect, it } from "vitest";

import {
  readZetaKnowledgeIndex,
  readZetaKnowledgeMarkdownByOutputPath,
  zetaKnowledgeMarkdownRoot,
} from "./zeta-knowledge-store";

describe("zeta-knowledge-store", () => {
  it("markdown root apunta a docs/zeta/markdown bajo el repo", () => {
    expect(zetaKnowledgeMarkdownRoot()).toMatch(/docs[\\/]zeta[\\/]markdown$/);
  });

  it("readZetaKnowledgeIndex devuelve filas del index.json", async () => {
    const rows = await readZetaKnowledgeIndex();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toMatchObject({
      output_md: expect.stringContaining("docs/zeta/markdown/"),
      title: expect.any(String),
    });
  });

  it("rechaza rutas que escapan del directorio markdown", async () => {
    await expect(
      readZetaKnowledgeMarkdownByOutputPath(
        "docs/zeta/markdown/../../../package.json"
      )
    ).rejects.toThrow(/fuera de docs\/zeta\/markdown/);
  });

  it("lee markdown por output_md del índice", async () => {
    const rows = await readZetaKnowledgeIndex();
    const row = rows.find((r) => r.output_md && !r.error);
    expect(row).toBeDefined();
    const content = await readZetaKnowledgeMarkdownByOutputPath(row!.output_md);
    expect(content.length).toBeGreaterThan(0);
  });
});
