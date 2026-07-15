import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard estático: ningún componente de Cobranza debe volver a concatenar
 * monedas inline (`$… · U$S…`). Los importes multi-moneda se muestran con
 * `SeparatedCurrencyAmounts` / `FinancialMetricCard`, siempre separados.
 *
 * Si este test falla, buscá un `.join(" · ")` sobre montos por moneda o un
 * `formatClientDebt`-style helper y reemplazalo por el primitivo separado.
 */

const COBRANZA_DIR = join(process.cwd(), "components", "copilot", "cobranza");

function collectTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectTsxFiles(full));
    } else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("Cobranza no reintroduce formato inline de monedas", () => {
  const files = collectTsxFiles(COBRANZA_DIR);

  it("encuentra archivos de Cobranza para auditar", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('ningún archivo concatena monedas con join(" · ")', () => {
    const offenders = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      return src.includes('.join(" · ")') || src.includes(".join(' · ')");
    });
    expect(offenders).toEqual([]);
  });

  it("no queda el helper formatClientDebt (joiner inline)", () => {
    const offenders = files.filter((f) =>
      readFileSync(f, "utf8").includes("function formatClientDebt")
    );
    expect(offenders).toEqual([]);
  });
});
