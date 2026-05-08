import { describe, expect, it } from "vitest";

import {
  describePeriodLabel,
  filterRowsByDateRange,
  formatYmdDisplay,
  normalizeYmdInput,
} from "./copilot-datos-period-filter";
import type { DataRow } from "./copilot-data";

function row(date: string): DataRow {
  return { id: date, issue_date: date };
}

describe("normalizeYmdInput", () => {
  it("acepta YYYY-MM-DD válido", () => {
    expect(normalizeYmdInput("2026-04-17")).toBe("2026-04-17");
  });
  it("recorta valores con tiempo", () => {
    expect(normalizeYmdInput("2026-04-17T10:00:00")).toBe("2026-04-17");
  });
  it("devuelve null para inputs vacíos o inválidos", () => {
    expect(normalizeYmdInput(null)).toBeNull();
    expect(normalizeYmdInput("")).toBeNull();
    expect(normalizeYmdInput("17/04/2026")).toBeNull();
  });
});

describe("formatYmdDisplay", () => {
  it("renderiza es-UY DD/MM/YYYY", () => {
    expect(formatYmdDisplay("2026-04-17")).toBe("17/04/2026");
  });
  it('devuelve "—" cuando el input es inválido', () => {
    expect(formatYmdDisplay("")).toBe("—");
    expect(formatYmdDisplay("foo")).toBe("—");
  });
});

describe("filterRowsByDateRange", () => {
  const rows = [
    row("2025-12-15"),
    row("2026-02-18"),
    row("2026-03-09"),
    row("2026-04-06"),
    row("2026-05-04"),
  ];

  it("sin extremos devuelve todas las filas (slice)", () => {
    const out = filterRowsByDateRange(rows, "issue_date", null, null);
    expect(out.map((r) => r.issue_date)).toEqual(rows.map((r) => r.issue_date));
    expect(out).not.toBe(rows);
  });

  it("respeta rango cerrado [from, to] inclusivo", () => {
    const out = filterRowsByDateRange(rows, "issue_date", "2025-12-01", "2026-04-17");
    expect(out.map((r) => r.issue_date)).toEqual([
      "2025-12-15",
      "2026-02-18",
      "2026-03-09",
      "2026-04-06",
    ]);
  });

  it("aplica solo from (rango abierto a la derecha)", () => {
    const out = filterRowsByDateRange(rows, "issue_date", "2026-03-01", null);
    expect(out.map((r) => r.issue_date)).toEqual([
      "2026-03-09",
      "2026-04-06",
      "2026-05-04",
    ]);
  });

  it("aplica solo to (rango abierto a la izquierda)", () => {
    const out = filterRowsByDateRange(rows, "issue_date", null, "2026-02-28");
    expect(out.map((r) => r.issue_date)).toEqual(["2025-12-15", "2026-02-18"]);
  });

  it("excluye filas sin fecha parseable", () => {
    const data = [...rows, { id: "ghost", issue_date: null } as unknown as DataRow];
    const out = filterRowsByDateRange(data, "issue_date", "2025-01-01", "2026-12-31");
    expect(out.find((r) => r.id === "ghost")).toBeUndefined();
  });
});

describe("describePeriodLabel", () => {
  it("modo all → 'Histórico completo'", () => {
    expect(describePeriodLabel({ mode: "all" })).toBe("Histórico completo");
  });

  it("modo month_year con año y mes → 'Mayo 2026'", () => {
    expect(
      describePeriodLabel({ mode: "month_year", year: 2026, month: 5 })
    ).toBe("Mayo 2026");
  });

  it("modo month_year sólo año → 'Año 2026'", () => {
    expect(
      describePeriodLabel({ mode: "month_year", year: 2026, month: "all" })
    ).toBe("Año 2026");
  });

  it("modo month_year sólo mes → 'Mes Mayo'", () => {
    expect(
      describePeriodLabel({ mode: "month_year", year: "all", month: 5 })
    ).toBe("Mes Mayo");
  });

  it("modo range con ambos extremos → 'Del 01/12/2025 al 17/04/2026'", () => {
    expect(
      describePeriodLabel({
        mode: "range",
        from: "2025-12-01",
        to: "2026-04-17",
      })
    ).toBe("Del 01/12/2025 al 17/04/2026");
  });

  it("modo range solo desde → 'Desde DD/MM/YYYY'", () => {
    expect(
      describePeriodLabel({ mode: "range", from: "2025-12-01", to: null })
    ).toBe("Desde 01/12/2025");
  });

  it("modo range solo hasta → 'Hasta DD/MM/YYYY'", () => {
    expect(
      describePeriodLabel({ mode: "range", from: null, to: "2026-04-17" })
    ).toBe("Hasta 17/04/2026");
  });

  it("modo range vacío → 'Histórico completo'", () => {
    expect(
      describePeriodLabel({ mode: "range", from: null, to: null })
    ).toBe("Histórico completo");
  });
});
